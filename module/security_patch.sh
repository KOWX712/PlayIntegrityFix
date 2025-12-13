#!/bin/sh

# Tricky Store Security Patch Util

AUTO_FLAG="/data/adb/tricky_store/pif_auto_security_patch"

case "$1" in
    --enable) touch "$AUTO_FLAG";;
    --disable) rm -f "$AUTO_FLAG"; exit;;
esac

if [ -f "/data/adb/pif.prop" ]; then
    PIFPROP="/data/adb/pif.prop"
elif [ -f "/data/adb/modules/playintegrityfix/pif.prop" ]; then
    PIFPROP="/data/adb/modules/playintegrityfix/pif.prop"
else
    echo "! No pif.prop found, aborting..."
    exit 1
fi

TS_MODPROP="/data/adb/modules/tricky_store/module.prop"

if [ -f "$TS_MODPROP" ]; then
    # James Clef's TrickyStore fork (GitHub@qwq233/TrickyStore)
    if grep -q "James" "/data/adb/modules/tricky_store/module.prop" && ! grep -q "beakthoven" "/data/adb/modules/tricky_store/module.prop"; then
        FILE_NAME="devconfig.toml"
    else # Official behaviour, supported since 158 version, no extra checking here
        FILE_NAME="security_patch.txt"
    fi
else
    echo "! Tricky Store not found, aborting..."
    exit 1
fi

TARGET_FILE="/data/adb/tricky_store/$FILE_NAME"
SECURITY_PATCH="$(grep "^SECURITY_PATCH=" "$PIFPROP" | cut -d= -f2)"
SHORT_PATCH="$(echo "$SECURITY_PATCH" | awk -F- '{print $1 $2}')"

PIF_POST="/data/adb/modules/playintegrityfix/post-fs-data.sh"

if echo "$SECURITY_PATCH" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then

    if grep -q '^resetprop ro\.build\.version\.security_patch ' "$PIF_POST" 2>/dev/null; then
        sed -i "s|^resetprop ro\.build\.version\.security_patch .*|resetprop ro.build.version.security_patch $SECURITY_PATCH|" "$PIF_POST"
    else
        [ ! -s "$PIF_POST" ] && echo "#!/system/bin/sh" > "$PIF_POST"
        printf "\nresetprop ro.build.version.security_patch %s\n" "$SECURITY_PATCH" >> "$PIF_POST"
    fi

    if grep -q '^resetprop ro\.vendor\.build\.security_patch ' "$PIF_POST" 2>/dev/null; then
        sed -i "s|^resetprop ro\.vendor\.build\.security_patch .*|resetprop ro.vendor.build.security_patch $SECURITY_PATCH|" "$PIF_POST"
    else
        printf "\nresetprop ro.vendor.build.security_patch %s\n" "$SECURITY_PATCH" >> "$PIF_POST"
    fi

    chmod 0755 "$PIF_POST"
else
    echo "! Invalid SECURITY_PATCH='$SECURITY_PATCH', skipping post-fs-data.sh sync"
fi

# Some device might need `system=prop` to get integrity so we keep the previous behaviour
if [ -s "$TARGET_FILE" ] && grep -q "^system=prop" "$TARGET_FILE"; then
    SYSTEM="prop"
else
    SYSTEM="$SHORT_PATCH"
fi

if [ "$FILE_NAME" = "security_patch.txt" ]; then
    {
        echo "system=$SYSTEM"
        echo "boot=$SECURITY_PATCH"
        echo "vendor=$SECURITY_PATCH"
    } > "$TARGET_FILE"
elif [ "$FILE_NAME" = "devconfig.toml" ]; then
    if grep -q "^securityPatch" "$TARGET_FILE"; then
        sed -i "s/^securityPatch .*/securityPatch = \"$SECURITY_PATCH\"/" "$TARGET_FILE"
    else
        # This is no longer needed for newer version of qwq233 fork but keep it for compatibility
        if ! grep -q "^\\[deviceProps\\]" "$TARGET_FILE"; then
            echo "securityPatch = \"$SECURITY_PATCH\"" >> "$TARGET_FILE"
        else
            sed -i "s/^\[deviceProps\]/securityPatch = \"$SECURITY_PATCH\"\n&/" "$TARGET_FILE"
        fi
    fi
fi
