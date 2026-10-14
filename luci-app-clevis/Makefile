include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for Clevis Automated Encryption Framework
LUCI_DEPENDS:=+clevis +clevis-luks +blkid
LUCI_PKGARCH:=all

PKG_NAME:=luci-app-clevis
PKG_VERSION:=1.1.0
PKG_RELEASE:=1
PKG_LICENSE:=GPL-3.0-or-later

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/luci/luci.mk

define Package/luci-app-clevis/postinst
#!/bin/sh
# Check if we are running inside a build host cross-compile phase
if [ -n "$${IPKG_INSTROOT}" ]; then
	exit 0
fi

# Ensure the configuration folder and file exist safely on flash
mkdir -p /etc/config
[ -f /etc/config/ucitrack ] || touch /etc/config/ucitrack

# Leverage named sections to atomically provision the service gate rules
uci set ucitrack.clevis=service
uci set ucitrack.clevis.init='clevis'
uci set ucitrack.clevis.config='clevis'
uci commit ucitrack

# Force the RPCD framework daemon to immediately reload its plugin directory
# This brings your 'clevis/status' object online instantly upon package installation!
/etc/init.d/rpcd reload

exit 0
endef

define Package/luci-app-clevis/postrm
#!/bin/sh
# Check if we are running inside a build host cross-compile phase
if [ -n "$${IPKG_INSTROOT}" ]; then
	exit 0
fi

# Dynamically locate the exact index position tracking your service name
idx=0
while true; do
	init_name=$$(uci -q get ucitrack.@service[$${idx}].init)
	[ -z "$${init_name}" ] && break

	if [ "$${init_name}" = "clevis" ]; then
		# Delete the target block configuration permanently from flash memory
		uci delete ucitrack.@service[$${idx}]
		uci commit ucitrack
		break
	fi
	idx=$$((idx + 1))
done

/etc/init.d/rpcd reload
exit 0
endef

# call BuildPackage - OpenWrt buildroot signature
