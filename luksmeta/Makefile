include $(TOPDIR)/rules.mk

PKG_NAME:=luksmeta
PKG_VERSION:=9
PKG_RELEASE:=1

# Tell OpenWrt to use Git to clone the source code
PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/latchset/luksmeta
PKG_SOURCE_VERSION:=v$(PKG_VERSION)
PKG_MIRROR_HASH:=skip

PKG_MAINTAINER:=Your Name <your@email.com>
PKG_LICENSE:=LGPL-2.0+

PKG_FIXUP:=autoreconf

include $(INCLUDE_DIR)/package.mk

define Package/luksmeta
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=LUKSMeta metadata storage utility
  URL:=https://github.com
  DEPENDS:=+cryptsetup +libdevmapper +libuuid
endef

define Package/luksmeta/description
  LUKSMeta is a utility for storing metadata in the LUKSv1 header gap.
endef

# FIX: Manually pass the path variables to bypass pkg-config failures
TARGET_CFLAGS += -I$(STAGING_DIR)/usr/include
TARGET_LDFLAGS += -L$(STAGING_DIR)/usr/lib -lcryptsetup -ldevmapper

CONFIGURE_VARS += \
	cryptsetup_CFLAGS="-I$(STAGING_DIR)/usr/include" \
	cryptsetup_LIBS="-L$(STAGING_DIR)/usr/lib -lcryptsetup -ldevmapper"

define Package/luksmeta/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/luksmeta $(1)/usr/bin/
	$(INSTALL_DIR) $(1)/usr/lib
	$(CP) $(PKG_BUILD_DIR)/.libs/libluksmeta.so* $(1)/usr/lib/
endef

$(eval $(call BuildPackage,luksmeta))
