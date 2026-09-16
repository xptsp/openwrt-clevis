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

include $(INCLUDE_DIR)/package.mk
include $(INCLUDE_DIR)/meson.mk

define Package/clevis
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=Automated Encryption Framework
  URL:=https://github.com/latchset/clevis
  DEPENDS:=+jose +bash +coreutils +curl +luksmeta +libcryptsetup
endef

define Package/clevis/description
  Clevis is a pluggable framework for automated decryption.
  It allows locking and unlocking data using network servers (Tang) or TPM2 chips.
endef

# Cleaned up: Removed all unknown options to satisfy strict Meson validation checks
MESON_ARGS +=

define Build/Configure
	# Forcefully drop test subdirectories to bypass cross-compilation environment errors
	sed -i "/subdir('tests')/d" $(PKG_BUILD_DIR)/src/luks/meson.build
	sed -i "/subdir('tests')/d" $(PKG_BUILD_DIR)/src/pins/tang/meson.build
	sed -i "/subdir('tests')/d" $(PKG_BUILD_DIR)/src/pins/tpm2/meson.build
	$(call Build/Configure/Meson)
endef

define Package/clevis/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_DIR) $(1)/usr/libexec
	
	# Only copy core utilities and binaries
	$(CP) $(PKG_INSTALL_DIR)/usr/bin/* $(1)/usr/bin/
	
	# Only copy libexec helpers if they exist
	if [ -d $(PKG_INSTALL_DIR)/usr/libexec ]; then \
		$(CP) $(PKG_INSTALL_DIR)/usr/libexec/* $(1)/usr/libexec/; \
	fi
endef

$(eval $(call BuildPackage,clevis))

