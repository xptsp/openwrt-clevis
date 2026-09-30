'use strict';
/* sysauth: root */

'require form';
'require fs';
'require ui';

return L.view.extend({
	// Query the system blkid data natively to feed both drop-down combo box layers
	load: function() {
		return Promise.all([
			fs.exec('/usr/sbin/blkid').then(function(res) { return res.stdout || ''; }).catch(function() { return ''; })
		]);
	},

	render: function(data) {
		// Unpack the blkid string output data from the promise response
		var blkidData = data[0]; 
		var m, s, o;

		// Initialize the Map object cleanly using the form module dependency
		m = new form.Map('clevis', _('Clevis Storage Unlocking'),
			_('Configure automated cryptographic volume unlocking using Clevis at boot time.'));

		// Global Options Settings Section
		s = m.section(form.TypedSection, 'global', _('Global Settings'));
		s.anonymous = true;
		s.addremove = false;
		s.rmempty = false;

		o = s.option(form.Value, 'network_timeout', _('Network Wait Timeout'),
			_('Seconds to wait for an IP address before running decryption (critical if using remote Tang Servers).'));
		o.datatype = 'uinteger';
		o.placeholder = '30';
		o.rmempty = false;

		// Encrypted Drives Matrix Configuration Grid
		s = m.section(form.GridSection, 'drive', _('Encrypted Volume Targets'));
		s.addremove = true;
		s.anonymous = true;

		// Active Toggle Switch Flag Control
		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.rmempty = false;
		o.default = '0';

		// Editable Input text combo box setup targeting Drive UUIDs
		o = s.option(form.Value, 'uuid', _('Drive UUID'),
			_('Type or paste a custom UUID manually, or click the dropdown arrow to choose a detected partition.'));
		o.widget = 'combobox'; 
		o.datatype = 'string';
		o.rmempty = true;
		
		// Parse lines for UUID dropdown data
		var lines = blkidData.split('\n');
		for (var i = 0; i < lines.length; i++) {
			var line = lines[i];
			var devMatch = line.match(/^([^:]+):/);
			var uuidMatch = line.match(/UUID="([^"]+)"/);
			
			if (devMatch && uuidMatch) {
				var devPath = devMatch[1];
				var uuidVal = uuidMatch[1];
				var labelMatch = line.match(/LABEL="([^"]+)"/);
				var typeMatch = line.match(/TYPE="([^"]+)"/);
				var labelText = labelMatch ? ' (' + labelMatch[1] + ')' : '';
				var typeText = typeMatch ? ' [' + typeMatch[1] + ']' : '';
				
				o.value(uuidVal, uuidVal + ' - ' + devPath + labelText + typeText);
			}
		}

		// FIXED: Converted Drive Label to an editable combo box input with automated label parsing
		o = s.option(form.Value, 'label', _('Drive Label'),
			_('Type a custom label manually, or click the dropdown arrow to choose a detected filesystem label.'));
		o.widget = 'combobox';
		o.datatype = 'string';
		o.rmempty = true;

		// Parse lines for Label dropdown data
		for (var i = 0; i < lines.length; i++) {
			var line = lines[i];
			var devMatch = line.match(/^([^:]+):/);
			var labelMatch = line.match(/LABEL="([^"]+)"/);
			
			if (devMatch && labelMatch) {
				var devPath = devMatch[1];
				var labelVal = labelMatch[1];
				var uuidMatch = line.match(/UUID="([^"]+)"/);
				var typeMatch = line.match(/TYPE="([^"]+)"/);
				var uuidText = uuidMatch ? ' (UUID: ' + uuidMatch[1] + ')' : '';
				var typeText = typeMatch ? ' [' + typeMatch[1] + ']' : '';
				
				o.value(labelVal, labelVal + ' - ' + devPath + uuidText + typeText);
			}
		}

		// Mapper Output Layer Destination Property
		o = s.option(form.Value, 'mapper', _('Mapper Name'),
			_('The unlocked device name (accessible via /dev/mapper/NAME).'));
		o.datatype = 'alnum';
		o.rmempty = false;

		// Storage Target Destination Mount Directory Parameters
		o = s.option(form.Value, 'mount_point', _('Mount Point'),
			_('Optional target directory destination path to mount the volume.'));
		o.datatype = 'directory';

		o = s.option(form.ListValue, 'fstype', _('Filesystem Type'));
		o.value('ext4', 'ext4');
		o.value('btrfs', 'btrfs');
		o.value('f2fs', 'f2fs');
		o.value('xfs', 'xfs');
		o.default = 'ext4';

		return m.render();
	}
});
