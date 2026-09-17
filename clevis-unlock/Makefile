include $(TOPDIR)/rules.mk

PKG_NAME:=clevis-unlock
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_MAINTAINER:=Developer <developer@example.com>
PKG_LICENSE:=GPL-2.0-or-later

include $(INCLUDE_DIR)/package.mk

define Package/clevis-unlock
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=Automated non-blocking Clevis LUKS unlocker
  DEPENDS:=+clevis +cryptsetup +uuidgen +clevis-luks
endef

define Package/clevis-unlock/description
  An init.d helper script to automatically and concurrently unlock 
  LUKS partitions using Clevis during the OpenWrt boot cycle.
endef

define Build/Compile
	# Nothing to compile, scripts only
endef

define Package/clevis-unlock/install
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/clevis-unlock.init $(1)/etc/init.d/clevis-unlock

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DATA) ./files/clevis-unlock.config $(1)/etc/config/clevis-unlock
endef

$(eval $(call BuildPackage,clevis-unlock))
