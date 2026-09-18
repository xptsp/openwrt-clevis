include $(TOPDIR)/rules.mk

PKG_NAME:=clevis
PKG_VERSION:=21
PKG_RELEASE:=4

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/latchset/clevis
PKG_SOURCE_VERSION:=v$(PKG_VERSION)
PKG_MIRROR_HASH:=skip

PKG_MAINTAINER:=OpenWrt Developer <dev@openwrt.org>
PKG_LICENSE:=GPL-3.0-or-later
PKG_LICENSE_FILES:=COPYING

PKG_BUILD_DEPENDS:=libcryptsetup luksmeta jose jansson cryptsetup/host

include $(INCLUDE_DIR)/package.mk
include $(INCLUDE_DIR)/meson.mk

define Package/clevis
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=Automated Encryption Framework
  URL:=https://github.com/latchset/clevis
  DEPENDS:=+jose +bash +coreutils +curl +luksmeta +cryptsetup +jansson
endef

define Package/clevis-luks
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=Clevis LUKS integration
  DEPENDS:=+clevis +cryptsetup +luksmeta
endef

define Package/clevis-tpm2
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=Clevis TPM2 integration
  DEPENDS:=+clevis +tpm2-tools +kmod-tpm +kmod-tpm-tis
endef

define Package/clevis/description
  Clevis is a pluggable framework for automated decryption.
  It allows locking and unlocking data using network servers (Tang) or TPM2 chips.
endef

define Package/clevis-luks/description
  Provides LUKS disk binding and unlocking integration for Clevis.
endef

define Package/clevis-tpm2/description
  Provides TPM2 binding and unlocking integration for Clevis.
endef

MESON_ARGS += \
	-Dluksmeta_data:OLD_CRYPTSETUP=0

define Build/Configure
	echo "" > $(PKG_BUILD_DIR)/src/luks/tests/meson.build
	$(call Build/Configure/Meson)
endef

define Package/clevis/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(CP) $(PKG_INSTALL_DIR)/usr/bin/clevis $(1)/usr/bin/
	$(CP) $(PKG_INSTALL_DIR)/usr/bin/clevis-decrypt $(1)/usr/bin/
	$(CP) $(PKG_INSTALL_DIR)/usr/bin/clevis-decrypt-null $(1)/usr/bin/
	$(CP) $(PKG_INSTALL_DIR)/usr/bin/clevis-decrypt-sss $(1)/usr/bin/
	$(CP) $(PKG_INSTALL_DIR)/usr/bin/clevis-decrypt-tang $(1)/usr/bin/
	$(CP) $(PKG_INSTALL_DIR)/usr/bin/clevis-encrypt-null $(1)/usr/bin/
	$(CP) $(PKG_INSTALL_DIR)/usr/bin/clevis-encrypt-sss $(1)/usr/bin/
	$(CP) $(PKG_INSTALL_DIR)/usr/bin/clevis-encrypt-tang $(1)/usr/bin/
endef

define Package/clevis-luks/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(CP) $(PKG_BUILD_DIR)/src/luks/clevis-luks-bind $(1)/usr/bin/
	$(CP) $(PKG_BUILD_DIR)/src/luks/clevis-luks-edit $(1)/usr/bin/
	$(CP) $(PKG_BUILD_DIR)/src/luks/clevis-luks-list $(1)/usr/bin/
	$(CP) $(PKG_BUILD_DIR)/src/luks/clevis-luks-pass $(1)/usr/bin/
	$(CP) $(PKG_BUILD_DIR)/src/luks/clevis-luks-regen $(1)/usr/bin/
	$(CP) $(PKG_BUILD_DIR)/src/luks/clevis-luks-report $(1)/usr/bin/
	$(CP) $(PKG_BUILD_DIR)/src/luks/clevis-luks-unbind.in $(1)/usr/bin/clevis-luks-unbind
	sed -i -e 's|@PATH@|/usr/bin:/bin|g' $(1)/usr/bin/clevis-luks-unbind
endef

define Package/clevis-tpm2/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(CP) $(PKG_INSTALL_DIR)/usr/bin/clevis-decrypt-tpm2 $(1)/usr/bin/
	$(CP) $(PKG_INSTALL_DIR)/usr/bin/clevis-encrypt-tpm2 $(1)/usr/bin/
endef

$(eval $(call BuildPackage,clevis))
$(eval $(call BuildPackage,clevis-luks))
$(eval $(call BuildPackage,clevis-tpm2))
