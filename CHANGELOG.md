# Changelog

Play Integrity Fix [INJECT] - fork by KOWX712

## v4.6

- Android 17 support.
- Improve method to find Zygisk provider module
- WebUI new language: Polish (@marcinmajsc, #12)

## v4.5

- Inline inject logic and stream payload over companion to avoid detection.
- Support resetprop compact.
- WebUI new language: Traditional Chinese (@mattchengg, #3), Turkish (@DogancanYr, #4), Indonesian (@yourbestregard, #5), Arabic (@ZG089, #6).
- Minor overall optimization.

## v4.4

- New WebUI interface, built-in help menu, rewrite with [Material Web Component](https://material-web.dev).
- New Fetch pif.prop via GitHub feature, exclusive for WebUI, not relying on curl/wget but using fetch api from browser.
- WebUI localization support, view [GUIDE.md](https://github.com/KOWX712/PlayIntegrityFix/blob/inject_s/webui/public/locales/GUIDE.md).
- Proper fix for zygisk cxa_atexit detection via [GitHub@5ec1cff/local_cxa_atexit_finalize_impl](https://github.com/5ec1cff/local_cxa_atexit_finalize_impl).

## v4.3

- Drop preview option
- Hide debug option in WebUI
- New script only mode, zygisk is still loaded but no injection, no need reboot to take effect.
- New spoofVendingBuild option, enable to spoof fingerprint field to Play Store.
- WebUI: view option - view current pif.prop
- WebUI: select device option - choose model that will be fetched
- WebUI: update color scheme, improved UI

## v4.2

- Fixed crash.

## v4.1

- Update fingerprint.
- Migrate from json to prop (pif.json -> pif.prop) for more optimized binary size.
- Added spoofBuild option.
- Auto reset pif.prop when the format is incorrect.
- Improved WebUI, fixed false error log.
- Added back module update.

## v3.3

- OTA update support for fp fetching script, now it can be updated without reboot, module's update will be less needed. (Thanks to @backslashxx)
- Magisk action redirect WebUI support, removed action button in KernelSU and APatch.
- Improved WebUI , better WebUI X support.

## v3.2

- update fingerprint.
- fix action failed to fetch `pif.json`.

## v3.1

- update fingerprint.
- add new ReZygisk directory on installation zygisk check.

## Diff with official inject v3

### v3-inject-vending

- based on official inject v3, no auto update
- added spoofVendingSdk
- added monet theme support in WebUI X

### v3-inject-manual

- based on `v3-inject-vending`
- removed auto config (tricky store and rom signature check)
- added manual conifg

---

## Known Issues

### Devices will experience degraded functionality in Play Store when spoofVendingSdk is enabled:

- Back gesture/nav button from within the Play Store exits directly to homescreen for all
- Blank account sign-in status and broken app updates for ROMs A14+
- Incorrect app variants may be served for all
- Full Play Store crashes for some setups
