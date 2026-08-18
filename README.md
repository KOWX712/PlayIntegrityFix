# Play Integrity Fix

This module tries to fix Play Integrity verdicts to get a valid attestation.

## NOTE

This module is not made to hide root, nor to avoid detections in other apps. It only serves to pass Device verdict in the Play Integrity tests and certify your device.

## Tutorial

You will need root and Zygisk. Enable Magisk's built-in Zygisk or use [ZygiskNext](https://github.com/Dr-TSNG/ZygiskNext) / [NeoZygisk](https://github.com/JingMatrix/NeoZygisk) / [ReZygisk](https://github.com/PerformanC/ReZygisk).

## Options

- **spoofBuild**: spoof fingerprint field, enabled by default.
- **spoofProvider**: custom keystore provider, enable when not using [TrickyStore](https://github.com/5ec1cff/TrickyStore).
- **spoofProps**: spoof prop when gms read from system prop, enable when not using [TrickyStore](https://github.com/5ec1cff/TrickyStore).
- **spoofSignature**: spoof rom signature, enable when your rom is signed by testkey. You can check your rom signature by running this command in terminal.
  ```sh
  unzip -l /system/etc/security/otacerts.zip | grep -oE "testkey|releasekey"
  ```
- **spoofVendingSdk**: spoof sdk version to 32 to Play Store if your device runs Android 13 or higher, this option will not take effect if your device is running Android 12 or lower.
  - Known issue: 
    - Back gesture/nav button from within the Play Store exits directly to homescreen for all
    - Blank account sign-in status and broken app updates for ROMs A14+
    - Incorrect app variants may be served for all
    - Full Play Store crashes for some setups
  - pixel_beta fingerprint can no longer get device verdict even on legacy check, so enabling this option won't help you to get device verdict anymore.

## Variety

- **inject-vending**: Based on the official inject branch, with the added spoofVendingSdk option.
- **inject-manual**: Based on inject-vending, with auto config (detect TrickyStore and ROM signature) removed.
- **inject-s**: Based on inject-manual, lightweight since it dropped the JSON format (pif.json -> pif.prop).

> [!NOTE]
> **inject-vending** and **inject-manual** branches are discontinued, but the branches will not be removed.

> [!WARNING]
> Do not use third-party tools to fetch fingerprints to avoid conflicts.
> The WebUI provides full control for configurable options.

### About official PIF by chiteroman

- The [official PIF by chiteroman](https://github.com/chiteroman/PlayIntegrityFix) has been removed from GitHub.
  - Official untouched main branch: https://github.com/KOWX712/PlayIntegrityFix/tree/main
  - Official untouched inject branch: https://github.com/KOWX712/PlayIntegrityFix/tree/inject
  - All tags from the official PIF repo are also preserved in this repo.

## Acknowledgments

- [kdrag0n](https://github.com/kdrag0n/safetynet-fix) & [Displax](https://github.com/Displax/safetynet-fix) for the original idea.
- This project is forked from the official chiteroman's PIF repo.
- [osm0sis](https://github.com/osm0sis) for his original [autopif2.sh](https://github.com/osm0sis/PlayIntegrityFork/blob/main/module/autopif2.sh) script, and [backslashxx](https://github.com/backslashxx) & [KOWX712](https://github.com/KOWX712) for improving it ([action.sh](https://github.com/chiteroman/PlayIntegrityFix/blob/main/module/action.sh)).
