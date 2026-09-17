include $(TOPDIR)/rules.mk

PKG_NAME:=luksmeta
PKG_VERSION:=9
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://github.com/latchset/luksmeta
PKG_HASH:=9737199fa688f172ff207b960c6d71b48995a0bc07604724a2cb9ba1a884ef24

PKG_MAINTAINER:=Your Name <your@email.com>
PKG_LICENSE:=LGPL-2.0+

PKG_FIXUP:=autoreconf

include $(INCLUDE_DIR)/package.mk

define Package/luksmeta
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=LUKSMeta metadata storage utility
  URL:=https://github.com/latchset/luksmeta
  DEPENDS:=+libcryptsetup
endef

define Package/luksmeta/description
  LUKSMeta is a utility for storing metadata in the LUKSv1 header gap.
endef

define Package/luksmeta/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/luksmeta $(1)/usr/bin/
	$(INSTALL_DIR) $(1)/usr/lib
	$(CP) $(PKG_BUILD_DIR)/.libs/libluksmeta.so* $(1)/usr/lib/
endef

$(eval $(call BuildPackage,luksmeta))
