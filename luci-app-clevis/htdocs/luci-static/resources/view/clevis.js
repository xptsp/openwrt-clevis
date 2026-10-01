'use strict';
'use ui';

// Statically pull required LuCI core modules
var rpc = L.require('rpc');
var ui = L.require('ui');

return L.view.extend({
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
			_('Configure automated cryptographic volume decryption utilizing Clevis metadata stanzas. Once unlocked, virtual devices appear inside /dev/mapper/ and can be natively assigned to mount paths under System ➔ Mount Points.'));

		// Global Timeout Config using TypedSection
		s = m.section(form.TypedSection, 'global', _('Global Settings'));
		s.anonymous = true;
		s.addremove = false;
		
		o = s.option(form.Value, 'network_timeout', _('Network Interface Timeout'), 
			_('Seconds to block-wait for connectivity prior to firing pinning operations. Ideal for remote Tang hook definitions. (0 to disable)'));
		o.datatype = 'uinteger';
		o.default = '30';

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

		return m.render();
	}
});
