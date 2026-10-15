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
										L.ui.addNotification(null, E('p', _('Success: Master background sweeps complete. Grid states updated.')), 'info', 10000);
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
			}, _('Unlock All Drives 🔑'));

			// Define the Master Lock All button element
			var masterLockBtn = E('button', {
				'class': 'btn cbi-button-reset',
				'style': 'background-color: #dc2626; color: #fff; border-color: #dc2626;',
				'click': function(ev) {
					ev.preventDefault();
					L.showModal(null, [ E('p', { 'class': 'spinning' }, _('Master teardown sequence initiated. Safely disassembling filesystem arrays...')) ]);
					
					L.rpc.declare({ object: 'clevis', method: 'lock', params: [ 'mapper' ] })('all').then(function(res) {
						L.hideModal();
						L.ui.addNotification(null, E('p', _('Success: Master teardown complete. All volume arrays safely closed.')), 'info', 7000);
						L.rpc.declare({ object: 'clevis', method: 'status', expect: { unlocked_mappers: [] } })().then(function(status) {
							viewContext.unlockedMappers = status || [];
							m.render();
						});
					}).catch(function(err) { L.hideModal(); L.ui.addNotification(null, E('p', err.message || err), 'danger'); });
				}
			}, _('Lock All Drives 🔒'));

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
		s.tab('general', _('General Settings'));
		s.tab('hooks', _('Script Hooks'));

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
			if (state === 'mounted') return E('span', { 'class': 'label success', 'style': 'display:inline-block;' }, _('Mounted') + ' 💾');
			if (state === 'unlocked') return E('span', { 'class': 'label info', 'style': 'display:inline-block; background-color:#14b8a6; color:#fff;' }, _('Unlocked') + ' 🔓');
			if (state === 'locked') return E('span', { 'class': 'label danger', 'style': 'display:inline-block;' }, _('Locked') + ' 🔒');
			return E('em', _('Unsaved Profile'));
		};

		// --- TAB 1: GENERAL SETTINGS PROPERTIES ---
		o = s.taboption('general', formModule.Flag, 'enabled', _('Enabled'));
		o.enabled = '1';
		o.disabled = '0';
		o.default = '1';
		o.rmempty = false;

		o = s.taboption('general', formModule.Value, 'mapper', _('Mapper Moniker'));
		o.rmempty = false;

		o = s.taboption('general', formModule.Value, 'uuid', _('Device UUID'));
		o.rmempty = true;

		o = s.taboption('general', formModule.Value, 'label', _('Device Label'));
		o.rmempty = true;

		o = s.taboption('general', formModule.Value, 'mount_path', _('Mount Target Path'),
			_('Absolute directory path where this decrypted volume filesystem should attach. Changes sync directly to') +' /etc/config/fstab.');
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

		// --- TAB 2: SEPARATED CUSTOM SCRIPT HOOKS ---
		o = s.taboption('hooks', formModule.Value, 'pre_mount', _('Pre-Mount Hook'),
			_('Shell commands to execute exactly AFTER decryption succeeds, but BEFORE the filesystem is attached.'));
		o.modalonly = true; 
		o.rmempty = true;

		o = s.taboption('hooks', formModule.Value, 'post_unlock', _('Post-Unlock Hook'),
			_('Shell commands to execute exactly AFTER the block mount command completes.'));
		o.modalonly = true; 
		o.rmempty = true;

		o = s.taboption('hooks', formModule.Value, 'pre_unmount', _('Pre-Unmount Hook'),
			_('Shell commands to execute safely BEFORE the filesystem is detached (e.g., stop Samba, Docker, or databases accessing this drive).'));
		o.modalonly = true;
		o.rmempty = true;

		o = s.taboption('hooks', formModule.Value, 'post_unmount', _('Post-Unmount Hook'),
			_('Shell commands to execute AFTER the filesystem unmount completes, but BEFORE the cryptographic LUKS container is locked.'));
		o.modalonly = true;
		o.rmempty = true;

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
				// STATE 1: Mounted -> Only Unmount Button Shown
				return E('button', {
					'class': 'btn cbi-button-reset',
					'click': function(ev) {
						ev.preventDefault();
						
						// FIX STEP A: Use clean, system-native full-screen modal blocking.
						// We have completely stripped out ev.target.classList.add('spinning') to prevent whitespace crashes!
						L.showModal(null, [ E('p', { 'class': 'spinning' }, _('Safely detaching target device mapper structures...')) ]);

						viewContext.rpcVolumeUmount(mapperName).then(function(res) {
							L.hideModal(); // Clear full-screen modal blocker on response
							
							if (res && res.result === 'success') {
								L.ui.addNotification(null, E('p', _('Success: The secure volume partition has been unmounted successfully.')), 'info', { timeout: 7 });
								
								// FIX STEP B: Re-query system state arrays safely over ubus to clear the active mount parameter [INDEX]
								L.rpc.declare({ object: 'clevis', method: 'mounts', expect: { unlocked_mappers: [] } })().then(function(mounts) {
									viewContext.mountedMappers = mounts || [];
									m.render(); // Redraw the table rows in-place instantly
								});
							} else {
								L.ui.addNotification(null, E('p', _('Failure: ') + (res.error || _('Device busy.'))), 'danger');
							}
						}).catch(function(err) { 
							L.hideModal(); // Clear full-screen modal blocker on catch block failure
							L.ui.addNotification(null, E('p', err.message || err), 'danger'); 
						});
					}
				}, _('Unmount ⛔'));
			} else if (isUnlocked) {
				// STATE 2: Unlocked but unmounted -> Mount AND Lock Buttons Side-by-Side
				var mountBtn = E('button', {
					'class': 'btn cbi-button-action primary',
					'style': 'margin-right: 4px;',
					'click': function(ev) {
						ev.preventDefault();
						
						// FIX STEP A: Use LuCI's clean, native full-screen modal blocker.
						// We have completely removed ev.target.classList.add('spinning') to prevent the whitespace crash!
						L.showModal(null, [ E('p', { 'class': 'spinning' }, _('Attaching target filesystem structures...')) ]);
						
						var savedPath = L.uci.get('clevis', section_id, 'mount_path');
						var targetPath = savedPath || ('/mnt/' + mapperName);

						viewContext.rpcVolumeMount(mapperName, targetPath).then(function(res) {
							L.hideModal(); // Clear full-screen modal blocker on response
							if (res && res.result === 'success') {
								L.ui.addNotification(null, E('p', _('Success: Filesystem mounted cleanly at ') + targetPath), 'info', 7000);
								
								// FIX STEP B: Re-query system status arrays safely over ubus to pull the fresh mount parameters
								L.rpc.declare({ object: 'clevis', method: 'mounts', expect: { unlocked_mappers: [] } })().then(function(mounts) {
									viewContext.mountedMappers = mounts || [];
									m.render(); // Redraw the table rows in-place instantly
								});
							} else {
								L.ui.addNotification(null, E('p', _('Failure: ') + (res.error || _('Mount processing error.'))), 'danger');
							}
						}).catch(function(err) { 
							L.hideModal(); // Clear full-screen modal blocker on catch block failure
							L.ui.addNotification(null, E('p', err.message || err), 'danger'); 
						});
					}
				}, _('Mount 💾'));

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
								L.ui.addNotification(null, E('p', _('Success: Teardown hooks executed and cryptographic partition safely locked.')), 'info', 7000);
								L.rpc.declare({ object: 'clevis', method: 'status', expect: { unlocked_mappers: [] } })().then(function(status) {
									viewContext.unlockedMappers = status || [];
									m.render();
								});
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
				}, _('Lock') +' 🔒');

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

							var passInput = E('input', { 'type': 'password', 'class': 'cbi-input-text', 'style': 'width: 100%; margin-top: 8px;', 'placeholder': 'LUKS Passphrase' });
							
							L.showModal(_('Network Unlock Failed'), [
								E('p', _('The automated network binding failed to resolve. Please input the master disk passphrase to manually unlock this volume container locally:')),
								E('div', { 'class': 'cbi-value' }, [ passInput ]),
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
												L.ui.addNotification(null, E('p', _('Success: Cryptographic partition manually unlocked via passphrase entry!')), 'info', 10000);
												
												L.rpc.declare({ object: 'clevis', method: 'status', expect: { unlocked_mappers: [] } })().then(function(status) {
													viewContext.unlockedMappers = status || [];
													m.render();
												});
											} else {
												btnEl.disabled = false;
												L.ui.addNotification(null, E('p', _('Failure: ') + (fallbackRes.error || _('Invalid passphrase.'))), 'danger');
											}
										}).catch(function(err) { btnEl.classList.remove('spinning'); btnEl.disabled = false; L.ui.addNotification(null, E('p', err.message || err), 'danger'); });
									} }, _('Unlock Volume 🔑'))
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
											L.ui.addNotification(null, E('p', _('Success: Cryptographic partition successfully unlocked over the network!')), 'info', 10000);
											m.render();
										} else if (checks >= 6) {
											clearInterval(pollInterval);
											L.hideModal(); // Clear full-screen modal blocker before drawing fallback panel
											promptManualPassphraseModal();
										}
									});
								}, 1000);
							} else {
								promptManualPassphraseModal();
							}
						}).catch(function(err) { promptManualPassphraseModal(); });
					}
				}, _('Unlock') +' 🔑');
			}
		};

		// FIX: Correctly index the resolved Promise.all arrays to prevent object collision crashes
		var refreshInterval = setInterval(function() {
			if (!document.getElementById('maincontent')) {
				clearInterval(refreshInterval);
				return;
			}

			Promise.all([
				L.rpc.declare({ object: 'clevis', method: 'status', expect: { unlocked_mappers: [] } })(),
				L.rpc.declare({ object: 'clevis', method: 'mounts', expect: { mounted_mappers: [] } })()
			]).then(function(results) {
				// FIX STEP A: Explicitly target array positions [0] and [1] to isolate data streams safely! [INDEX]
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
