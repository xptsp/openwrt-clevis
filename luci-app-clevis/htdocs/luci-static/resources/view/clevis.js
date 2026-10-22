'use strict';
'use ui';

var ui = L.require('ui');
var uci = L.require('uci');
var form = L.require('form');

return L.view.extend({
	rpcClevisPopulate: L.rpc.declare({
		object: 'clevis',
		method: 'populate',
		expect: { drives: [] }
	}),

	rpcVolumeMount: L.rpc.declare({
		object: 'clevis',
		method: 'mount',
		params: [ 'mapper', 'path' ]
	}),

	rpcVolumeUmount: L.rpc.declare({
		object: 'clevis',
		method: 'umount',
		params: [ 'mapper' ]
	}),

	rpcClevisLock: L.rpc.declare({
		object: 'clevis',
		method: 'lock',
		params: [ 'mapper' ]
	}),

	rpcClevisUnlockPassphrase: L.rpc.declare({
		object: 'clevis',
		method: 'unlock_passphrase',
		params: [ 'mapper', 'uuid', 'label', 'passphrase' ]
	}),

	rpcClevisUnlock: L.rpc.declare({
		object: 'clevis',
		method: 'unlock',
		params: [ 'section' ]
	}),

	rpcFstabSync: L.rpc.declare({
		object: 'clevis',
		method: 'fstab_sync',
		params: [ 'mapper', 'uuid', 'path', 'enabled' ]
	}),

	rpcClevisGetSlots: L.rpc.declare({
		object: 'clevis',
		method: 'slots',
		params: [ 'section_id' ],
	}),

	rpcClevisSlotAdd: L.rpc.declare({
		object: 'clevis',
		method: 'slot_add',
		params: [ 'section_id', 'passphrase', 'new_passphrase', 'is_clevis' ]
	}),

	rpcClevisSlotWipe: L.rpc.declare({
		object: 'clevis',
		method: 'slot_wipe',
		params: [ 'section_id', 'passphrase', 'slot_id' ]
	}),

	// Fetch both the Form library and our live RPCD active mapper data concurrently
	load: function() {
		return Promise.all([
			L.resolveDefault(L.require('form')),
			L.rpc.declare({
				object: 'clevis',
				method: 'status',
				expect: { unlocked_mappers: [] }
			})(),
			L.rpc.declare({
				object: 'clevis',
				method: 'mounts',
				expect: { mounted_mappers: [] }
			})()
		]);
	},

	render: function(data) {
		// Properly unpack Promise.all sequential indices
		var formModule = data[0];
		this.unlockedMappers = data[1] || []; 
		this.mountedMappers = data[2] || []; 
		var viewContext = this;
		var m, s, o;

		m = new formModule.Map('clevis', _('Clevis Decryption'),
			_('Configure automated cryptographic volume decryption utilizing Clevis metadata stanzas. Once unlocked, virtual devices appear inside') + 
			' <strong>/dev/mapper/</strong> ' + _('and can be natively assigned to mount paths under') + 
			' <a href="/cgi-bin/luci/admin/system/mounts">' + _('System ➔ Mount Points') + '</a>.');

		// Global Timeout Config using TypedSection
		s = m.section(formModule.TypedSection, 'global', _('Global Settings'));
		s.anonymous = true;
		s.addremove = false;
		
		o = s.option(formModule.Value, 'network_timeout', _('Network Interface Timeout'), 
			_('Seconds to block-wait for connectivity prior to firing pinning operations. Ideal for remote Tang hook definitions. (0 to disable)'));
		o.datatype = 'uinteger';
		o.default = '30';

		// "Populate Drives" action trigger
		//===========================================================================
		o = s.option(formModule.Button, '_populate', _('Populate Drives'));
		o.inputtitle = _('Scan & Populate Drives');
		o.inputstyle = 'button'; 
		o.onclick = L.bind(function(ev) {
			L.showModal(null, [ E('p', { 'class': 'spinning' }, _('Scanning hardware block layers and generating partition profile registries...')) ]);
			
			this.rpcClevisPopulate().then(L.bind(function(result) {
				L.hideModal();
				
				// Display our clean auto-fading system notification banner
				L.ui.addNotification(null, E('p', _('Encrypted target drives have been successfully discovered and appended!')), 'info', 10000);
				
				// Force LuCI's UCI engine to unload the stale config from memory 
				// and fetch the fresh committed disk rows directly from the router filesystem
				L.uci.unload('clevis');
				L.uci.load('clevis').then(function() {
					// Once data is reloaded, force an immediate clean in-place table redraw
					m.render();
				});
				
			}, this)).catch(L.bind(function(err) { 
				L.hideModal(); 
				var errorText = _('Failed to discover storage targets: ') + (err.message || err || _('Unknown error'));
				L.ui.addNotification(null, E('p', { 'class': 'danger' }, errorText), 'danger'); 
			}, this));
		}, this);

		// "Unlock All"/"Lock All" action trigger
		//===========================================================================
		// THE MASTER ADJUSTABLE CONTROLS SECTION
		o = s.option(formModule.Button, '_unlock_all', _('Master Controls'));
		o.modalonly = false;

		// Override the render method to dynamically output one or both buttons depending on system states
		o.render = function(section_id) {
			var sections = L.uci.sections('clevis', 'drive') || [];
			var hasAnyUnlocked = false;
			var hasAnyLocked = false;

			for (var i = 0; i < sections.length; i++) {
				var mapperName = sections[i].mapper;
				if (mapperName && viewContext.unlockedMappers.indexOf(mapperName) !== -1) {
					hasAnyUnlocked = true;
				} else {
					hasAnyLocked = true;
				}
			}

			// Define the Master Unlock All button element
			var masterUnlockBtn = E('button', {
				'class': 'btn cbi-button-action primary',
				'style': 'margin-right: 6px;',
				'click': function(ev) {
					ev.preventDefault();
					L.showModal(null, [ E('p', { 'class': 'spinning' }, _('Master unlock sequence initiated. Spawning background worker threads...')) ]);
					
					viewContext.rpcClevisUnlock('all').then(function(res) {
						if (res && res.result === 'success') {
							L.showModal(null, [ E('p', { 'class': 'spinning' }, _('Monitoring cryptographic storage slots. Please wait while partitions auto-unlock...')) ]);
							var checks = 0;
							var pollInterval = setInterval(function() {
								L.rpc.declare({ object: 'clevis', method: 'status', expect: { unlocked_mappers: [] } })().then(function(status) {
									checks++;
									if (checks >= 6) {
										clearInterval(pollInterval);
										L.hideModal();
										viewContext.unlockedMappers = status || [];
										L.ui.addNotification(null, E('p', _('Success: ') + _('Master background sweeps complete. Grid states updated.')), 'info', 10000);
										m.render();
									}
								});
							}, 1000);
						} else {
							L.hideModal();
							L.ui.addNotification(null, E('p', _('Failure: ') + (res.error || _('Unlock processing error.'))), 'danger');
						}
					}).catch(function(err) { L.hideModal(); L.ui.addNotification(null, E('p', err.message || err), 'danger'); });
				}
			}, _('Unlock All Drives'));

			// Define the Master Lock All button element
			var masterLockBtn = E('button', {
				'class': 'btn cbi-button-reset',
				'style': 'background-color: #dc2626; color: #fff; border-color: #dc2626;',
				'click': function(ev) {
					ev.preventDefault();
					L.showModal(null, [ E('p', { 'class': 'spinning' }, _('Master teardown sequence initiated. Safely disassembling filesystem arrays...')) ]);
					
					L.rpc.declare({ object: 'clevis', method: 'lock', params: [ 'mapper' ] })('all').then(function(res) {
						L.hideModal();
						L.ui.addNotification(null, E('p', _('Success: ') + _('Master teardown complete. All volume arrays safely closed.')), 'info', 7000);
						L.rpc.declare({ object: 'clevis', method: 'status', expect: { unlocked_mappers: [] } })().then(function(status) {
							viewContext.unlockedMappers = status || [];
							m.render();
						});
					}).catch(function(err) { L.hideModal(); L.ui.addNotification(null, E('p', err.message || err), 'danger'); });
				}
			}, _('Lock All Drives'));

			// Conditional UI element collection generation wrapper
			var container = E('div', { 'class': 'cbi-value-field' });

			if (hasAnyUnlocked && hasAnyLocked) {
				// MIXED STATE: Render both elements side-by-side cleanly
				container.appendChild(masterUnlockBtn);
				container.appendChild(masterLockBtn);
			} else if (hasAnyUnlocked) {
				// ALL UNLOCKED: Only show Lock All
				container.appendChild(masterLockBtn);
			} else {
				// ALL LOCKED / DEFAULT: Only show Unlock All
				container.appendChild(masterUnlockBtn);
			}

			// Wrap inside standard LuCI form layout wrapper nodes to align columns perfectly
			return E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Global Actions')),
				container
			]);
		};

		//===========================================================================
		// Drive Map Grid Section
		//===========================================================================
		s = m.section(formModule.GridSection, 'drive', _('Encrypted Volume Targets'));
		s.anonymous = true;
		s.addremove = true;

		// Declare sub-tabs for the row Edit sub-form modal overlay dialog

		// LIVE STATUS BADGE COLUMN
		o = s.option(formModule.DummyValue, '_status', _('Status'));
		o.modalonly = false;
		o.cfgvalue = function(section_id) {
			var mapperName = L.uci.get('clevis', section_id, 'mapper');
			if (!mapperName) return 'unsaved';
			
			if (viewContext.mountedMappers.indexOf(mapperName) !== -1) return 'mounted';
			return (viewContext.unlockedMappers.indexOf(mapperName) !== -1) ? 'unlocked' : 'locked';
		};
		o.textvalue = function(section_id) {
			var state = this.cfgvalue(section_id);
			if (state === 'mounted') return E('span', { 'class': 'label success', 'style': 'display:inline-block;' }, _('Mounted'));
			if (state === 'unlocked') return E('span', { 'class': 'label info', 'style': 'display:inline-block; background-color:#14b8a6; color:#fff;' }, _('Unlocked'));
			if (state === 'locked') return E('span', { 'class': 'label danger', 'style': 'display:inline-block;' }, _('Locked'));
			return E('em', _('Unsaved Profile'));
		};

		//===========================================================================
		// --- TAB 1: GENERAL SETTINGS PROPERTIES ---
		//===========================================================================
		s.tab('general', _('General Settings'));
		o = s.taboption('general', formModule.Flag, 'enabled', _('Enabled'));
		o.enabled = '1';
		o.disabled = '0';
		o.default = '1';
		o.rmempty = false;

		// Save a direct reference to the mapper option object
		var mapperField = s.taboption('general', formModule.Value, 'mapper', _('Mapper Moniker'));
		mapperField.rmempty = false;

		o = s.taboption('general', formModule.Value, 'uuid', _('Device UUID'));
		o.rmempty = true;

		o = s.taboption('general', formModule.Value, 'label', _('Device Label'));
		o.rmempty = true;

		o = s.taboption('general', formModule.Value, 'mount_path', _('Mount Target Path'),
			_('Absolute directory path where this decrypted volume filesystem should attach. Changes sync directly to') +' <strong>/etc/config/fstab</strong>.');
		o.modalonly = true;
		o.rmempty = true;
		o.placeholder = '/mnt/secure_storage';
		
		o.write = function(section_id, form_value) {
			var mapperName = L.uci.get('clevis', section_id, 'mapper');
			var devUuid = L.uci.get('clevis', section_id, 'uuid');
			var isProfileEnabled = L.uci.get('clevis', section_id, 'enabled') || '1';
			
			L.uci.set('clevis', section_id, 'mount_path', form_value);
			
			if (mapperName && form_value) {
				return viewContext.rpcFstabSync(mapperName, devUuid, form_value, isProfileEnabled)
					.catch(function(err) { L.ui.addNotification(null, E('p', _('Failed to sync fstab targets: ') + (err.message || err)), 'danger'); });
			}
		};

		//===========================================================================
		// --- TAB 2: SEPARATED CUSTOM SCRIPT HOOKS ---
		//===========================================================================
		s.tab('hooks', _('Script Hooks'));
		o = s.taboption('hooks', formModule.TextValue, 'pre_mount', _('Pre-Mount Hook'),
			_('Shell commands to execute exactly AFTER decryption succeeds, but BEFORE the filesystem is attached.'));
		o.modalonly = true; 
		o.rmempty = true;
		o.rows = 2;

		o = s.taboption('hooks', formModule.TextValue, 'post_mount', _('Post-Unlock Hook'),
			_('Shell commands to execute exactly AFTER the block mount command completes.'));
		o.modalonly = true; 
		o.rmempty = true;
		o.rows = 2;

		o = s.taboption('hooks', formModule.TextValue, 'pre_unmount', _('Pre-Unmount Hook'),
			_('Shell commands to execute safely BEFORE the filesystem is detached (e.g., stop Samba, Docker, or databases accessing this drive).'));
		o.modalonly = true;
		o.rmempty = true;
		o.rows = 2;

		o = s.taboption('hooks', formModule.TextValue, 'post_unmount', _('Post-Unmount Hook'),
			_('Shell commands to execute AFTER the filesystem unmount completes, but BEFORE the cryptographic LUKS container is locked.'));
		o.modalonly = true;
		o.rmempty = true;
		o.rows = 2;

		//===========================================================================
		// --- TAB 3: LUKS KEYSLOT MANAGEMENT PANEL ---
		//===========================================================================
		s.tab('slots', _('Slot Management'));
		
		o = s.taboption('slots', formModule.DummyValue, '_slots_matrix', _('LUKS Container Slots'));
		o.modalonly = true;
		
		o.render = L.bind(function(section_id) {
			// 1. Create a persistent container node holding both Matrix Grid and Wizard elements
			var mainWrapper = E('div', { 'style': 'display: flex; flex-direction: column; gap: 24px; width: 100%;' });

			var gridWrapper = E('div', { 
				'id': 'clevis-slots-matrix-container',
				'style': 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 10px; min-height: 50px;' 
			}, [
				E('div', { 'style': 'grid-column: span 4; text-align: center; padding: 20px;' }, [
					E('span', { 'class': 'spinning' }), 'Preparing metadata engine hook loops' + '.' + '.' + '.'
				])
			]);

			/*var wizardContainer = E('div', {
				'id': 'clevis-wizard-panel-container',
				'style': 'border-top: 1px solid var(--border-color, #444); padding-top: 20px; display: block;'
			});*/

			mainWrapper.appendChild(gridWrapper);
			//mainWrapper.appendChild(wizardContainer);

			// 2. Defer execution until the browser finishes drawing the Tab panel structure into the DOM
			setTimeout(L.bind(function() {
				var mapperInput = document.querySelector('input[id$=".mapper"], [name$=".mapper"]');
				var mapperName = mapperInput ? mapperInput.value : '';

				if (!mapperName || mapperName.trim() === '') {
					gridWrapper.innerHTML = '';
					gridWrapper.appendChild(E('div', { 'style': 'grid-column: span 4; text-align: center; padding: 10px;' }, 
						E('em', 'Please configure a Mapper Moniker name in General Settings first' + '.' + '.' + '.')
					));
					return;
				}

				var queryToken = mapperName.trim();

				// 3. Define local matrix card drawer function
				var reloadSlotsGrid = function() {
					gridWrapper.innerHTML = '';
					gridWrapper.appendChild(E('div', { 'style': 'grid-column: span 4; text-align: center; padding: 20px;' }, [
						E('span', { 'class': 'spinning' }), 'Interrogating cryptsetup metadata header blocks' + '.' + '.' + '.'
					]));

					viewContext.rpcClevisGetSlots(queryToken).then(function(res) {
						gridWrapper.innerHTML = ''; 
						
						var slotArray = (res && res.slots) ? res.slots : [];
						if (slotArray.length === 0) {
							gridWrapper.appendChild(E('div', { 'style': 'grid-column: span 4; text-align: center; padding: 10px;' }, 
								E('em', 'No active keyslots detected, or device is currently offline/unmapped' + '.' + '.' + '.')
							));
							return;
						}

						slotArray.forEach(function(slot) {
							var isOccupied = slot.status === 'occupied';
							var isClevis = slot.type === 'clevis';
							
							var bgStyle = isOccupied ? (isClevis ? 'background-color: #14b8a6; color: #fff;' : 'background-color: #3b82f6; color: #fff;') : 'background-color: rgba(0, 0, 0, 0.05); color: #888; border: 1px dashed var(--border-color, #444);';
							var badgeText = isOccupied ? (isClevis ? 'Clevis Pin Key' : 'Passphrase Key') : 'Empty Slot';

							var actionLink = E('div', { 'style': 'margin-top: 10px; min-height: 24px;' });
							
							if (isOccupied) {
								actionLink.appendChild(E('button', {
									'class': 'btn cbi-button-reset',
									'style': 'background-color: rgba(220, 38, 38, 0.15); color: #fff; border: 1px solid rgba(220,38,38,0.3); padding: 2px 8px; font-size: 0.85em; border-radius: 4px; width: 100%; cursor: pointer;',
									'click': function(ev) {
										ev.preventDefault();
										
										var authPass = E('input', { 'type': 'password', 'class': 'cbi-input-text', 'placeholder': 'Valid Master Passphrase', 'style': 'width: 100%; padding-right: 35px;' });
										
										// Eye unmask toggle icon widget for individual Wipe actions
										var wipeEye = E('span', {
											'class': 'btn',
											'style': 'position: absolute; right: 5px; top: 50%; transform: translateY(-50%); border: none; background: transparent; cursor: pointer; padding: 4px; font-size: 1.15em;',
											'click': function(ex) {
												ex.preventDefault();
												if (authPass.type === 'password') {
													authPass.type = 'text';
													ex.target.textContent = '👁️';
												} else {
													authPass.type = 'password';
													ex.target.textContent = '🙈';
												}
											}
										}, '🙈');

										var wipeWrapper = E('div', { 'style': 'position: relative; display: inline-block; width: 100%;' }, [ authPass, wipeEye ]);

										// Layered Child Modal (Preserves underlying Edit window)
										var childModal = E('div', {
											'style': 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 5000; display: flex; align-items: center; justify-content: center;'
										}, [
											E('div', { 'class': 'modal', 'style': 'background: var(--background-color, #2d2d2d); color: var(--text-color, #eee); border: 1px solid var(--border-color, #444); padding: 20px; border-radius: 6px; max-width: 450px; width: 90%; box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-weight: normal;' }, [
												E('h3', 'Wipe Key Slot #' + slot.id),
												E('p', { 'style': 'margin: 10px 0; opacity: 0.9;' }, 'To destroy this key slot allocation registry statement, provide an authorized operational master storage container password:'),
												E('div', { 'class': 'cbi-value', 'style': 'padding: 5px 0; border: none;' }, [ wipeWrapper ]),
												E('div', { 'class': 'right', 'style': 'margin-top: 15px; text-align: right;' }, [
													E('button', { 'class': 'btn cbi-button-reset', 'style': 'margin-right: 6px;', 'click': function() { childModal.remove(); } }, 'Cancel'),
													E('button', { 'class': 'btn cbi-button-action primary', 'click': function() {
														if (!authPass.value) return;
														
														var cardBody = childModal.querySelector('.modal');
														cardBody.innerHTML = '';
														cardBody.appendChild(E('div', { 'style': 'text-align: center; padding: 20px;' }, [
															E('span', { 'class': 'spinning', 'style': 'display: inline-block; margin-bottom: 10px;' }),
															E('p', { 'style': 'font-weight: bold;' }, 'Purging target slot configuration signatures' + '.' + '.' + '.')
														]));
														
														// Unified positional mapping syntax handles backend array requests safely
														L.rpc.declare({ object: 'clevis', method: 'slot_wipe', params: [ 'section_id', 'passphrase', 'slot_id' ] })(queryToken, authPass.value, slot.id).then(function(wipeRes) {
															cardBody.innerHTML = '';
															if (wipeRes && wipeRes.result === 'success') {
																cardBody.appendChild(E('div', { 'style': 'text-align: center; padding: 10px;' }, [
																	E('h4', { 'style': 'color: #16a34a; margin-bottom: 10px;' }, 'Transaction Successful'),
																	E('p', 'Keyslot #' + slot.id + ' successfully destroyed out of the crypt container configuration map' + '.' + '.' + '.'),
																	E('button', { 'class': 'btn cbi-button-action primary', 'style': 'margin-top: 15px;', 'click': function() { childModal.remove(); reloadSlotsGrid(); } }, 'Dismiss')
																]));
															} else {
																cardBody.appendChild(E('div', { 'style': 'text-align: center; padding: 10px;' }, [
																	E('h4', { 'style': 'color: #dc2626; margin-bottom: 10px;' }, 'Operation Failed'),
																	E('p', 'Wipe error: ' + (wipeRes.error || 'Access Denied')),
																	E('button', { 'class': 'btn cbi-button-reset', 'style': 'margin-top: 15px;', 'click': function() { childModal.remove(); } }, 'Dismiss')
																]));
															}
														}).catch(function(err) {
															cardBody.innerHTML = '';
															cardBody.appendChild(E('div', { 'style': 'text-align: center; padding: 10px;' }, [
																E('h4', { 'style': 'color: #dc2626; margin-bottom: 10px;' }, 'Execution Crash'),
																E('p', err.message || err),
																E('button', { 'class': 'btn cbi-button-reset', 'style': 'margin-top: 15px;', 'click': function() { childModal.remove(); } }, 'Dismiss')
															]));
														});
													} }, 'Confirm Wipe')
												])
											])
										]);
										
										document.body.appendChild(childModal);
										setTimeout(function() { authPass.focus(); }, 100);
									}
								}, 'Wipe Slot'));
							} else {
								// Continuation from Part 1 branching condition blocks for Add actions
								actionLink.appendChild(E('button', {
									'class': 'btn cbi-button-action primary',
									'style': 'padding: 2px 8px; font-size: 0.85em; border-radius: 4px; width: 100%; cursor: pointer;',
									'click': function(ev) {
										ev.preventDefault();
										
										var masterPass = E('input', { 'type': 'password', 'class': 'cbi-input-text', 'placeholder': 'Existing Passphrase', 'style': 'width: 100%; padding-right: 35px;' });
										var newPass = E('input', { 'type': 'password', 'class': 'cbi-input-text', 'placeholder': 'New Target Passphrase', 'style': 'width: 100%;' });
										
										// Eye unmask toggle widgets for standalone Key Addition slots
										var addEye1 = E('span', {
											'class': 'btn',
											'style': 'position: absolute; right: 5px; top: 50%; transform: translateY(-50%); border: none; background: transparent; cursor: pointer; padding: 4px; font-size: 1.15em;',
											'click': function(ex) {
												ex.preventDefault();
												if (masterPass.type === 'password') {
													masterPass.type = 'text';
													ex.target.textContent = '👁️';
												} else {
													masterPass.type = 'password';
													ex.target.textContent = '🙈';
												}
											}
										}, '🙈');

										// Eye unmask toggle widgets for standalone Key Addition slots
										var addEye2 = E('span', {
											'class': 'btn',
											'style': 'position: absolute; right: 5px; top: 50%; transform: translateY(-50%); border: none; background: transparent; cursor: pointer; padding: 4px; font-size: 1.15em;',
											'click': function(ex) {
												ex.preventDefault();
												if (newPass.type === 'password') {
													newPass.type = 'text';
													ex.target.textContent = '👁️';
												} else {
													newPass.type = 'password';
													ex.target.textContent = '🙈';
												}
											}
										}, '🙈');

										var addWrapper1 = E('div', { 'style': 'position: relative; display: inline-block; width: 100%;' }, [ masterPass, addEye1 ]);
										var addWrapper2 = E('div', { 'style': 'position: relative; display: inline-block; width: 100%;' }, [ newPass, addEye2 ]);

										var childModal = E('div', {
											'style': 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 5000; display: flex; align-items: center; justify-content: center;'
										}, [
											E('div', { 'class': 'modal', 'style': 'background: var(--background-color, #2d2d2d); color: var(--text-color, #eee); border: 1px solid var(--border-color, #444); padding: 20px; border-radius: 6px; max-width: 450px; width: 90%; box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-weight: normal;' }, [
												E('h3', 'Provision Key into Slot #' + slot.id),
												E('p', { 'style': 'margin: 10px 0; opacity: 0.9;' }, 'Authorize matrix modification using an existing administrative master passphrase:'),
												E('div', { 'class': 'cbi-value', 'style': 'padding: 5px 0; border: none;' }, [ E('label', { 'class': 'cbi-value-title', 'style': 'margin-bottom: 4px; display: block; color: var(--text-color, #eee);' }, 'Current Password'), addWrapper1 ]),
												E('div', { 'class': 'cbi-value', 'style': 'padding: 5px 0; border: none;' }, [ E('label', { 'class': 'cbi-value-title' }, 'New Key Signature'), addWrapper2 ]),
												E('div', { 'class': 'right', 'style': 'margin-top: 15px; text-align: right;' }, [
													E('button', { 'class': 'btn cbi-button-reset', 'style': 'margin-right: 6px;', 'click': function() { childModal.remove(); } }, 'Cancel'),
													E('button', { 'class': 'btn cbi-button-action primary', 'click': function() {
														if (!masterPass.value || !newPass.value) return;
														
														var cardBody = childModal.querySelector('.modal');
														cardBody.innerHTML = '';
														cardBody.appendChild(E('div', { 'style': 'text-align: center; padding: 20px;' }, [
															E('span', { 'class': 'spinning', 'style': 'display: inline-block; margin-bottom: 10px;' }),
															E('p', { 'style': 'font-weight: bold;' }, 'Executing cryptographic container expansions' + '.' + '.' + '.')
														]));
														
														L.rpc.declare({ object: 'clevis', method: 'slot_add', params: [ 'section_id', 'passphrase', 'new_passphrase', 'is_clevis' ] })(queryToken, masterPass.value, newPass.value, '0').then(function(addRes) {
															cardBody.innerHTML = '';
															if (addRes && addRes.result === 'success') {
																cardBody.appendChild(E('div', { 'style': 'text-align: center; padding: 10px;' }, [
																	E('h4', { 'style': 'color: #14b8a6; margin-bottom: 10px;' }, 'Provisioning Complete'),
																	E('p', 'New storage slot allocation successfully provisioned and locked into slot mapping registry matrix' + '.' + '.' + '.'),
																	E('button', { 'class': 'btn cbi-button-action primary', 'style': 'margin-top: 15px;', 'click': function() { childModal.remove(); reloadSlotsGrid(); } }, 'Dismiss')
																]));
															} else {
																cardBody.appendChild(E('div', { 'style': 'text-align: center; padding: 10px;' }, [
																	E('h4', { 'style': 'color: #dc2626; margin-bottom: 10px;' }, 'Addition Failed'),
																	E('p', 'Addition failed: ' + (addRes.error || 'Check credential rules')),
																	E('button', { 'class': 'btn cbi-button-reset', 'style': 'margin-top: 15px;', 'click': function() { childModal.remove(); } }, 'Dismiss')
																]));
															}
														}).catch(function(err) {
															cardBody.innerHTML = '';
															cardBody.appendChild(E('div', { 'style': 'text-align: center; padding: 10px;' }, [
																E('h4', { 'style': 'color: #dc2626; margin-bottom: 10px;' }, 'Execution Crash'),
																E('p', err.message || err),
																E('button', { 'class': 'btn cbi-button-reset', 'style': 'margin-top: 15px;', 'click': function() { childModal.remove(); } }, 'Dismiss')
															]));
														});
													} }, 'Add Key Slot')
												])
											])
										]);
										
										document.body.appendChild(childModal);
										setTimeout(function() { masterPass.focus(); }, 100);
									}
								}, 'Add Key'));
							}

							var cardEl = E('div', {
								'style': 'padding: 14px; border-radius: 6px; text-align: center; font-weight: bold; display: flex; flex-direction: column; justify-content: space-between; ' + bgStyle
							}, [
								E('div', [
									E('div', { 'style': 'font-size: 1.15em; margin-bottom: 4px;' }, 'Slot ' + slot.id),
									E('span', { 'style': 'font-size: 0.85em; opacity: 0.9; display: block; min-height: 18px;' }, badgeText)
								]),
								actionLink
							]);
							
							gridWrapper.appendChild(cardEl);
						});
					}).catch(function(err) {
						gridWrapper.innerHTML = '';
						gridWrapper.appendChild(E('div', { 'style': 'grid-column: span 4; color: #dc2626; text-align: center;' }, 
							'Error executing metadata engine dump: ' + (err.message || err || 'Unknown error')
						));
					});
				};

/*				// 4. Generate the Automated Clevis Tang network binding wizard form elements
				var renderWizardPanel = function() {
					wizardContainer.innerHTML = '';

					var urlInput = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'placeholder': 'http://192.168.10.1:9090', 'style': 'width: 100%; max-width: 350px;' });
					var passInput = E('input', { 'type': 'password', 'class': 'cbi-input-text', 'placeholder': 'Drive Master Passphrase', 'style': 'width: 100%; max-width: 350px; padding-right: 35px;' });
					
					var wizardEye = E('span', {
						'class': 'btn',
						'style': 'position: absolute; right: 5px; top: 50%; transform: translateY(-50%); border: none; background: transparent; cursor: pointer; padding: 4px; font-size: 1.15em;',
						'click': function(ev) {
							ev.preventDefault();
							if (passInput.type === 'password') {
								passInput.type = 'text';
								ev.target.textContent = '👁️';
							} else {
								passInput.type = 'password';
								ev.target.textContent = '🙈';
							}
						}
					}, '🙈');

					var wizardPassWrapper = E('div', { 'style': 'position: relative; display: inline-block; width: 100%; max-width: 350px;' }, [ passInput, wizardEye ]);
					var statusDisplay = E('div', { 'style': 'margin-top: 10px; font-weight: bold; min-height: 20px;' });

					var executeWizardBtn = E('button', {
						'class': 'btn cbi-button-action primary',
						'style': 'margin-top: 15px;',
						'click': function(ev) {
							ev.preventDefault();
							if (!urlInput.value || !passInput.value) {
								statusDisplay.innerHTML = '<span style="color: #dc2626;">Please supply both the Tang Server URL target and a valid decryption password.</span>';
								return;
							}

							statusDisplay.innerHTML = '<span class="spinning"></span> Initializing automated encryption framework binding pipeline...';
							
							// Positional argument list configuration maps accurately to the RPC array transport
							L.rpc.declare({ object: 'clevis', method: 'slot_add', params: [ 'section_id', 'passphrase', 'new_passphrase', 'is_clevis' ] })(
								queryToken,
								passInput.value,
								urlInput.value.trim(),
								'TANG_SERVER_PROVISION_MODE'
							).then(function(bindRes) {
								if (bindRes && bindRes.result === 'success') {
									statusDisplay.innerHTML = '<span style="color: #16a34a;">✨ Automated Tang Network Binding provisioned successfully!</span>';
									urlInput.value = ''; passInput.value = '';
									setTimeout(function() { statusDisplay.innerHTML = ''; reloadSlotsGrid(); }, 3500);
								} else {
									statusDisplay.innerHTML = '<span style="color: #dc2626;">Binding assignment failed: ' + (bindRes.error || 'Check local utility bounds') + '</span>';
								}
							}).catch(function(err) {
								statusDisplay.innerHTML = '<span style="color: #dc2626;">Execution crash: ' + (err.message || err) + '</span>';
							});
						}
					}, 'Provision Network Unlock Token ➕');

					wizardContainer.appendChild(E('div', [
						E('h3', { 'style': 'margin-bottom: 6px;' }, 'Automated Clevis Tang Network Binding Wizard'),
						E('p', { 'style': 'opacity: 0.8; font-size: 0.9em; margin-bottom: 15px;' }, 'Securely link an empty drive key allocation block to an infrastructure Tang network authentication server for automatic boot decryption paths.'),
						E('div', { 'class': 'cbi-value', 'style': 'padding: 4px 0; border: none;' }, [ E('label', { 'class': 'cbi-value-title', 'style': 'width: 140px;' }, 'Tang Server URL'), urlInput ]),
						E('div', { 'class': 'cbi-value', 'style': 'padding: 4px 0; border: none;' }, [ E('label', { 'class': 'cbi-value-title', 'style': 'width: 140px;' }, 'Drive Passphrase'), passInput ]),
						statusDisplay,
						executeWizardBtn
					]));
				};
*/
				reloadSlotsGrid();
//				renderWizardPanel();
			}, this), 150);

			return E('div', { 'class': 'cbi-value' }, [
				E('div', { 'class': 'cbi-value-field' }, [ mainWrapper ])
			]);
		}, this);

		//===========================================================================
		// ACTIONS CONTROL COLUMN WITH CONTEXTUAL LOCK BUTTON INCLUSIONS
		//===========================================================================
		o = s.option(formModule.DummyValue, '_actions', _('Drive Actions'));
		o.modalonly = false;
		o.textvalue = function(section_id) {
			var mapperName = L.uci.get('clevis', section_id, 'mapper');
			var isUnlocked = mapperName && viewContext.unlockedMappers.indexOf(mapperName) !== -1;
			var isMounted = mapperName && viewContext.mountedMappers.indexOf(mapperName) !== -1;

			if (isMounted) {
				// STATE 1: Mounted -> Show Unmount AND Lock Buttons side-by-side cleanly!
				var unMountBtn = E('button', {
					'class': 'btn cbi-button-reset',
					'style': 'margin-right: 4px; padding: 2px;',
					'click': function(ev) {
						ev.preventDefault();
						
						// Use clean, system-native full-screen modal blocking without dangerous class mutations
						L.showModal(null, [ E('p', { 'class': 'spinning' }, _('Safely detaching target device mapper structures...')) ]);

						viewContext.rpcVolumeUmount(mapperName).then(function(res) {
							L.hideModal(); // Clear full-screen modal blocker on response
							
							if (res && res.result === 'success') {
								L.ui.addNotification(null, E('p', _('Success: ') + _('The secure volume partition has been unmounted successfully.')), 'info', 7000);
							} else {
								L.ui.addNotification(null, E('p', _('Failure: ') + (res.error || _('Device busy.'))), 'danger');
							}
						}).catch(function(err) { 
							L.hideModal(); // Clear full-screen modal blocker on catch block failure
							L.ui.addNotification(null, E('p', err.message || err), 'danger'); 
						});
					}
				}, _('Unmount'));

				var lockBtn = E('button', {
					'class': 'btn cbi-button-reset',
					'style': 'padding: 2px; background-color: #dc2626; color: #fff; border-color: #dc2626;',
					'click': function(ev) {
						ev.preventDefault();

						// MODAL UPDATE: Show a full-screen loading spinner immediately when clicked
						L.showModal(null, [ E('p', { 'class': 'spinning' }, _('Executing teardown hooks and locking cryptographic partition...')) ]);

						viewContext.rpcClevisLock(mapperName).then(function(res) {
							L.hideModal(); // Clear full-screen modal blocker on response
							
							if (res && res.result === 'success') {
								L.ui.addNotification(null, E('p', _('Success: ') + _('Teardown hooks executed and cryptographic partition safely locked.')), 'info', 7000);
							} else {
								L.ui.addNotification(null, E('p', _('Failure: ') + (res.error || _('Could not close device.'))), 'danger');
							}
						}).catch(function(err) {
							L.hideModal(); // Clear full-screen modal blocker on catch block failure
							L.ui.addNotification(null, E('p', err.message || err), 'danger');
						});
					}
				}, _('Lock'));

				return E('span', {}, [ unMountBtn, lockBtn ]);
			} else if (isUnlocked) {
				// STATE 2: Unlocked but unmounted -> Mount AND Lock Buttons Side-by-Side
				var mountBtn = E('button', {
					'class': 'btn cbi-button-action primary',
					'style': 'margin-right: 4px;',
					'click': function(ev) {
						ev.preventDefault();
						
						// Use LuCI's clean, native full-screen modal blocker.
						L.showModal(null, [ E('p', { 'class': 'spinning' }, _('Attaching target filesystem structures...')) ]);
						
						var savedPath = L.uci.get('clevis', section_id, 'mount_path');
						var targetPath = savedPath || ('/mnt/' + mapperName);

						viewContext.rpcVolumeMount(mapperName, targetPath).then(function(res) {
							L.hideModal(); // Clear full-screen modal blocker on response
							if (res && res.result === 'success') {
								L.ui.addNotification(null, E('p', _('Success: ') + _('Filesystem mounted cleanly at ') + targetPath), 'info', 7000);
							} else {
								L.ui.addNotification(null, E('p', _('Failure: ') + (res.error || _('Mount processing error.'))), 'danger');
							}
						}).catch(function(err) { 
							L.hideModal(); // Clear full-screen modal blocker on catch block failure
							L.ui.addNotification(null, E('p', err.message || err), 'danger'); 
						});
					}
				}, _('Mount'));

				var lockBtn = E('button', {
					'class': 'btn cbi-button-reset',
					'style': 'background-color: #dc2626; color: #fff; border-color: #dc2626;',
					'click': function(ev) {
						ev.preventDefault();
						ev.target.classList.add('spinning');
						ev.target.disabled = true;

						// MODAL UPDATE: Show a full-screen loading spinner immediately when clicked
						L.showModal(null, [ E('p', { 'class': 'spinning' }, _('Executing teardown hooks and locking cryptographic partition...')) ]);

						viewContext.rpcClevisLock(mapperName).then(function(res) {
							L.hideModal(); // Clear full-screen modal blocker on response
							ev.target.classList.remove('spinning');
							
							if (res && res.result === 'success') {
								L.ui.addNotification(null, E('p', _('Success: ') + _('Teardown hooks executed and cryptographic partition safely locked.')), 'info', 7000);
							} else {
								ev.target.disabled = false;
								L.ui.addNotification(null, E('p', _('Failure: ') + (res.error || _('Could not close device.'))), 'danger');
							}
						}).catch(function(err) {
							L.hideModal(); // Clear full-screen modal blocker on catch block failure
							ev.target.classList.remove('spinning');
							ev.target.disabled = false;
							L.ui.addNotification(null, E('p', err.message || err), 'danger');
						});
					}
				}, _('Lock'));

				return E('span', {}, [ mountBtn, lockBtn ]);
			} else {
				// STATE 3: Locked -> Amber Unlock Button shown with passphrase input fallback modal
				return E('button', {
					'class': 'btn cbi-button-action',
					'style': 'padding: 2px 6px; background-color: #eab308; color: #fff; border-color: #eab308;',
					'click': function(ev) {
						ev.preventDefault();
						var btnEl = ev.target;
						btnEl.classList.add('spinning');
						btnEl.disabled = true;

						var promptManualPassphraseModal = function() {
							btnEl.classList.remove('spinning');
							btnEl.disabled = false;

							var passInput = E('input', { 'type': 'password', 'class': 'cbi-input-text',  'style': 'width: 100%; padding-right: 35px;', 'placeholder': 'LUKS Passphrase' });
							var addEye = E('span', {
								'class': 'btn',
								'style': 'position: absolute; right: 5px; top: 50%; transform: translateY(-50%); border: none; background: transparent; cursor: pointer; padding: 4px; font-size: 1.15em;',
								'click': function(ex) {
									ex.preventDefault();
									if (passInput.type === 'password') {
										passInput.type = 'text';
										ex.target.textContent = '👁️';
									} else {
										passInput.type = 'password';
										ex.target.textContent = '🙈';
									}
								}
							}, '🙈');
							var addWrapper = E('div', { 'style': 'position: relative; display: inline-block; width: 100%;' }, [ passInput, addEye ]);
							
							L.showModal(_('Network Unlock Failed'), [
								E('p', _('The automated network binding failed to resolve. Please input the master disk passphrase to manually unlock this volume container locally:')),
								E('div', { 'class': 'cbi-value' }, [ addWrapper ]),
								E('div', { 'class': 'right', 'style': 'margin-top: 12px;' }, [
									E('button', { 'class': 'btn cbi-button-reset', 'style': 'margin-right: 4px;', 'click': function() { L.hideModal(); } }, _('Cancel')),
									E('button', { 'class': 'btn cbi-button-action primary', 'click': function() {
										var typedPassword = passInput.value;
										if (!typedPassword) { alert(_('Error: Passphrase cannot be empty')); return; }
										
										L.hideModal();
										btnEl.classList.add('spinning');
										btnEl.disabled = true;

										var u = L.uci.get('clevis', section_id, 'uuid');
										var l = L.uci.get('clevis', section_id, 'label');

										viewContext.rpcClevisUnlockPassphrase(mapperName, u, l, typedPassword).then(function(fallbackRes) {
											btnEl.classList.remove('spinning');
											if (fallbackRes && fallbackRes.result === 'success') {
												L.ui.addNotification(null, E('p', _('Success: ') + _('Cryptographic partition manually unlocked via passphrase entry!')), 'info', 10000);
												
												L.rpc.declare({ object: 'clevis', method: 'status', expect: { unlocked_mappers: [] } })().then(function(status) {
													viewContext.unlockedMappers = status || [];
													m.render();
												});
											} else {
												btnEl.disabled = false;
												L.ui.addNotification(null, E('p', _('Failure: ') + (fallbackRes.error || _('Invalid passphrase.'))), 'danger');
											}
										}).catch(function(err) { btnEl.classList.remove('spinning'); btnEl.disabled = false; L.ui.addNotification(null, E('p', err.message || err), 'danger'); });
									} }, _('Unlock Volume'))
								])
							]);
							setTimeout(function() { passInput.focus(); }, 100);
						};

						// Trigger standard automated network unlock routines first
						viewContext.rpcClevisUnlock(section_id).then(function(res) {
							if (res && res.result === 'success') {
								// MODAL UPDATE: Changed L.ui.addNotification to L.showModal to display a full-screen loading spinner
								L.showModal(null, [ E('p', { 'class': 'spinning' }, _('Unlock thread initiated. Monitoring network socket loop triggers...')) ]);
								
								var checks = 0;
								var pollInterval = setInterval(function() {
									L.rpc.declare({ object: 'clevis', method: 'status', expect: { unlocked_mappers: [] } })().then(function(status) {
										checks++;
										if (status && status.indexOf(mapperName) !== -1) {
											clearInterval(pollInterval);
											L.hideModal(); // Clear full-screen modal blocker on success
											btnEl.classList.remove('spinning');
											viewContext.unlockedMappers = status || [];
											L.ui.addNotification(null, E('p', _('Success: ') + _('Cryptographic partition successfully unlocked over the network!')), 'info', 10000);
											m.render();
										} else if (checks >= 6) {
											clearInterval(pollInterval);
											L.hideModal(); // Clear full-screen modal blocker before drawing fallback panel
											promptManualPassphraseModal();
										}
									});
								}, 1000);
							} else if (res && res.result === 'no_device') {
								clearInterval(pollInterval);
								L.hideModal(); // Clear full-screen modal blocker on success
								btnEl.classList.remove('spinning');
								L.ui.addNotification(null, E('p',  _('Failure: ') + _('Could not resolve physical underlying disk block device path node location'), 'danger', 10000));
								m.render();
							} else {
								promptManualPassphraseModal();
							}
						}).catch(function(err) { promptManualPassphraseModal(); });
					}
				}, _('Unlock'));
			}
		};

		// Correctly index the resolved Promise.all arrays to prevent object collision crashes
		var refreshInterval = setInterval(function() {
			if (!document.getElementById('maincontent')) {
				clearInterval(refreshInterval);
				return;
			}

			Promise.all([
				L.rpc.declare({ object: 'clevis', method: 'status', expect: { unlocked_mappers: [] } })(),
				L.rpc.declare({ object: 'clevis', method: 'mounts', expect: { mounted_mappers: [] } })()
			]).then(function(results) {
				// Explicitly target array positions [0] and [1] to isolate data streams safely! [INDEX]
				var statusList = results[0] || [];
				var mountsList = results[1] || [];

				var statusChanged = JSON.stringify(statusList) !== JSON.stringify(viewContext.unlockedMappers);
				var mountsChanged = JSON.stringify(mountsList) !== JSON.stringify(viewContext.mountedMappers);

				if (statusChanged || mountsChanged) {
					viewContext.unlockedMappers = statusList;
					viewContext.mountedMappers = mountsList;
					m.render();
				}
			}).catch(function(err) {
				// Quietly ignore background drops
			});
		}, 1000);

		return m.render();
	}
});
