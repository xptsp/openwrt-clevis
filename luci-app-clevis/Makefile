include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for Clevis Automated Encryption Framework
LUCI_DEPENDS:=+clevis +clevis-luks +blkid
LUCI_PKGARCH:=all

PKG_NAME:=luci-app-clevis
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_LICENSE:=GPL-3.0-or-later

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
