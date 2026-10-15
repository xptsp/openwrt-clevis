# [Clevis for OpenWRT](https://github.com/xptsp/openwrt-clevis)

## [What is Clevis?](https://manpages.ubuntu.com/manpages/focal/man1/clevis.1.html#overview)

>Clevis is a framework for automated decryption policy. It allows you to define a policy at encryption time that must be satisfied for the data to decrypt. Once this policy is met, the data is decrypted.
>
>Clevis is pluggable. Our plugins are called pins. The job of a pin is to take a policy as its first argument and plaintext on standard input and to encrypt the data so that it can be automatically decrypted if the policy is met.

## Why these packages?

While OpenWrt is traditionally built for lightweight, immutable consumer network routers, it is increasingly deployed on modern hardware platforms—such as x86_64 mini-PCs, Raspberry Pis, and single-board computers (SBCs)—equipped with large attached storage arrays, USB drives, or sensitive local data configurations.

Official OpenWrt feeds lack an upstream package for Clevis because it heavily relies on the desktop/server systemd architecture, bash, and dense cryptographic frameworks (jose).  These packages closes that gap. It decouples Clevis from its systemd assumptions, porting its pluggable binding logic to work seamlessly with OpenWrt’s lightweight procd initialization system.

### Key Use Cases

- Encrypted NAS & Edge Storage: Automatically unlock high-capacity LUKS2 external storage drives or network-attached shares at boot time without storing the keys in plaintext on the router.
- Tamper-Resistant Routers (Physical Theft Protection): Protect configurations, wireguard keys, or local logs on devices deployed in unmanaged, physically vulnerable locations (e.g., remote cell towers, public kiosks, field kits). If the device is stolen and disconnected from the local network, the data remains cryptographically locked.
- Automated Redundancy: Leverage network-bound disk encryption (NBDE) via Tang servers or hardware keys via TPM 2.0 to ensure your head-less OpenWrt hardware boots unattended after a power outage, completely avoiding manual SSH passcode entry.

## Available Packages

- **clevis** - This package provides the decoding pins (except for TPM2).  Requires **jose**, **bash**, **coreutils**, **curl**, and **jansson**.
- **clevis-luks** - This package provides the command starting **clevis-luks**.  Requires **clevis**, **cryptsetup** and **luksmeta**.
- **clevis-tpm2** - This package provides TPM2 pins.  Requires **clevis**, **tpm2-tools**, **kmod-tpm**, and **kmod-tpm-tis**.
- **luksmeta** - This package provides a C library and command-line utility used to store and manage pre-unlock metadata inside the LUKSv1 header gap.  Requires **cryptsetup**, **libdevmapper**, and **libuuid**.

Packages **tpm2-tools** and **tpm2-tss** are available for compilation at [https://github.com/justarandomgeek/tpm2-packages](https://github.com/justarandomgeek/tpm2-packages), but are provided on the release page for these tools.

## Screenshots

![screenshot_1.webp](https://github.com/xptsp/openwrt-clevis/blob/main/screenshot_1.webp?raw=true)
---
![screenshot_2.webp](https://github.com/xptsp/openwrt-clevis/blob/main/screenshot_2.webp?raw=true)
---
![screenshot_3.webp](https://github.com/xptsp/openwrt-clevis/blob/main/screenshot_3.webp?raw=true)
---
![screenshot_4.webp](https://github.com/xptsp/openwrt-clevis/blob/main/screenshot_4.webp?raw=true)
