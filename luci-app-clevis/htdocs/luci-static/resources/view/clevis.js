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

	// Fetch both the Form library and our live RPCD active mapper data concurrently
	load: function() {
		return Promise.all([
			L.resolveDefault(L.require('form')),
			L.rpc.declare({
				object: 'clevis',
				method: 'status',
				expect: { unlocked_mappers: [] }
			})()
		]);
	},

	render: function(data) {
		// Properly unpack Promise.all sequential indices
		var form = data[0];
		var unlockedMappers = data[1]; 
		var m, s, o;

		m = new form.Map('clevis', _('Clevis Decryption'),
			_('Configure automated cryptographic volume decryption utilizing Clevis metadata stanzas. Once unlocked, virtual devices appear inside') + 
			' <strong>/dev/mapper/</strong> ' + _('and can be natively assigned to mount paths under') + 
			' <a href="/cgi-bin/luci/admin/system/mounts">' + _('System ➔ Mount Points') + '</a>.');

		// Global Timeout Config using TypedSection
		s = m.section(form.TypedSection, 'global', _('Global Settings'));
		s.anonymous = true;
		s.addremove = false;
		
		o = s.option(form.Value, 'network_timeout', _('Network Interface Timeout'), 
			_('Seconds to block-wait for connectivity prior to firing pinning operations. Ideal for remote Tang hook definitions. (0 to disable)'));
		o.datatype = 'uinteger';
		o.default = '30';

		// THE WORKING POPULATE DRIVES TRIGGER BUTTON
		o = s.option(form.Button, '_populate', _('Populate Drives'));
		o.inputtitle = _('Scan & Populate Drives');
		o.inputstyle = 'apply';
		o.onclick = L.bind(function(ev) {
			L.showModal(null, [ E('p', { 'class': 'spinning' }, _('Scanning hardware block layers and generating partition profile registries...')) ]);
			
			this.rpcClevisPopulate().then(L.bind(function(result) {
				L.hideModal();
				L.showModal(_('Scan Complete'), [
					E('p', _('Encrypted target drives have been successfully discovered and appended to your configuration settings!')),
					E('div', { 'class': 'right' }, [ 
						E('button', { 'class': 'btn cbi-button-action primary', 'click': function() { L.hideModal(); window.location.reload(); } }, _('OK')) 
					])
				]);
			}, this)).catch(function(err) { 
				L.hideModal(); 
				L.ui.addNotification(null, E('p', { 'class': 'notice danger' }, _('Failed to discover storage targets: ') + (err.message || err))); 
			});
		}, this);

		// Drive Map Grid Section
		s = m.section(form.GridSection, 'drive', _('Encrypted Volume Targets'));
		s.anonymous = true;
		s.addremove = true;

		// LIVE STATUS BADGE COLUMN
		o = s.option(form.DummyValue, '_status', _('Status'));
		o.modalonly = false;

		// Step A: Calculate the true status state string for this row section
		o.cfgvalue = function(section_id) {
			var mapperName = L.uci.get('clevis', section_id, 'mapper');
			if (!mapperName) {
				return 'unsaved';
			}
			return (unlockedMappers.indexOf(mapperName) !== -1) ? 'unlocked' : 'locked';
		};

		// Step B: Direct the table renderer on exactly how to display that value state string
		o.textvalue = function(section_id) {
			var state = this.cfgvalue(section_id);

			if (state === 'unlocked') {
				return E('span', { 'class': 'label success', 'style': 'display:inline-block;' }, _('Unlocked 🔓'));
			} else if (state === 'locked') {
				return E('span', { 'class': 'label danger', 'style': 'display:inline-block;' }, _('Locked 🔒'));
			} else {
				return E('em', _('Unsaved Profile'));
			}
		};

		// Toggle Profile State
		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.default = o.enabled;

		// Virtual Device Mapper Moniker
		o = s.option(form.Value, 'mapper', _('Mapper Moniker'));
		o.rmempty = false;

		// Hardware Identity (UUID)
		o = s.option(form.Value, 'uuid', _('Device UUID'));
		o.rmempty = true;

		// Alternative Label Identity
		o = s.option(form.Value, 'label', _('Device Label'));
		o.rmempty = true;

		// Custom text fields for User hooks (exposed on the Edit modal sub-menu overlay)
		o = s.option(form.Value, 'pre_mount', _('Pre-Mount Hook'),
			_('Shell commands to execute exactly AFTER decryption succeeds, but BEFORE the filesystem is attached.'));
		o.modalonly = true; 
		o.rmempty = true;

		o = s.option(form.Value, 'post_unlock', _('Post-Unlock Hook'),
			_('Shell commands to execute exactly AFTER the block mount command completes.'));
		o.modalonly = true; 
		o.rmempty = true;

		return m.render();
	}
});
