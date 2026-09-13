#!/bin/sh

PATH=/data/adb/ap/bin:/data/adb/ksu/bin:/data/adb/magisk:/data/data/com.termux/files/usr/bin:$PATH
MODDIR=/data/adb/modules/playintegrityfix

REPOSITORY="KOWX712/PlayIntegrityFix"
BRANCH="inject_s"
AUTOPIF_PATH="$BRANCH/module/autopif.sh"
GITHUB_CDN="https://fastly.jsdelivr.net/gh/$REPOSITORY"
GITHUB_RAW="https://raw.githubusercontent.com/$REPOSITORY"
GITHUB_MIRROR="https://gh.sevencdn.com/$GITHUB_RAW"

# lets try to use tmpfs for processing
TEMPDIR="$MODDIR/temp" #fallback
[ -w /sbin ] && TEMPDIR="/sbin/playintegrityfix"
[ -w /debug_ramdisk ] && TEMPDIR="/debug_ramdisk/playintegrityfix"
[ -w /dev ] && TEMPDIR="/dev/playintegrityfix"
mkdir -p "$TEMPDIR"

download() { busybox wget -T 10 --no-check-certificate -qO - "$1" > "$2"; }
if command -v curl > /dev/null 2>&1; then
    download() { curl --connect-timeout 10 -Ls "$1" > "$2"; }
fi

# fetch script
fetch_autopif() {
    if download "$1" "$TEMPDIR/temp_autopif.sh"; then
        if ! grep -q "^#!/bin/sh" $TEMPDIR/temp_autopif.sh; then
            return 1
        fi

        # hash
        curhash="$(cat $MODDIR/autopif.sh | busybox crc32)"
        newhash="$(cat $TEMPDIR/temp_autopif.sh | busybox crc32)"

        if [ ! "$newhash" = "$curhash" ]; then
            cat "$TEMPDIR/temp_autopif.sh" > "$MODDIR/autopif.sh"
            echo "[+] autopif has been updated"
        fi

        return 0
    else
        return 1
    fi
}

if fetch_autopif "$GITHUB_CDN@$AUTOPIF_PATH"; then
    true
elif fetch_autopif "$GITHUB_RAW/$AUTOPIF_PATH"; then
    true
elif fetch_autopif "$GITHUB_MIRROR/$AUTOPIF_PATH"; then
    true
else
    echo "[!] OTA failed, skipping autopif update."
fi

rm -rf "$TEMPDIR"

# EOF
