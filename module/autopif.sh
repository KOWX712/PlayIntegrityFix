#!/bin/sh

PATH=/data/adb/ap/bin:/data/adb/ksu/bin:/data/adb/magisk:/data/data/com.termux/files/usr/bin:$PATH
MODDIR=/data/adb/modules/playintegrityfix
version=$(grep "^version=" $MODDIR/module.prop | sed 's/version=//g')

. $MODDIR/common_func.sh

# lets try to use tmpfs for processing
TEMPDIR="$MODDIR/temp" #fallback
[ -w /sbin ] && TEMPDIR="/sbin/playintegrityfix"
[ -w /debug_ramdisk ] && TEMPDIR="/debug_ramdisk/playintegrityfix"
[ -w /dev ] && TEMPDIR="/dev/playintegrityfix"
mkdir -p "$TEMPDIR"
cd "$TEMPDIR"

echo "[+] PlayIntegrityFix $version"
echo "[+] $(basename "$0")"
printf "\n\n"

set_random_beta() {
	if [ "$(echo "$MODEL_LIST" | wc -l)" -ne "$(echo "$PRODUCT_LIST" | wc -l)" ]; then
		echo "Warning: MODEL_LIST and PRODUCT_LIST have different lengths, using Pixel 6 fallback"
		MODEL="Pixel 6"
		PRODUCT="oriole_beta"
	else
		count=$(echo "$MODEL_LIST" | wc -l)
		rand_index=$(( $$ % count ))
		MODEL=$(echo "$MODEL_LIST" | sed -n "$((rand_index + 1))p")
		PRODUCT=$(echo "$PRODUCT_LIST" | sed -n "$((rand_index + 1))p")
	fi
}

get_model_product_list() {
	printf "{\"model\":["
	count=0
	total=$(echo "$MODEL_LIST" | wc -l)
	echo "$MODEL_LIST" | while read -r model; do
		count=$((count + 1))
		printf "\"%s\"" "$model"
		[ $count -lt $total ] && printf ","
	done
	printf "],\"product\":["
	count=0
	total=$(echo "$PRODUCT_LIST" | wc -l)
	echo "$PRODUCT_LIST" | while read -r product; do
		count=$((count + 1))
		printf "\"%s\"" "$product"
		[ $count -lt $total ] && printf ","
	done
	printf "]}"

	rm -rf "$TEMPDIR"
	exit 0
}

# Get latest Pixel Canary information
download https://developer.android.com/about/versions PIXEL_VERSIONS_HTML
LATEST_URL=$(grep -o 'https://developer.android.com/about/versions/.*[0-9]"' PIXEL_VERSIONS_HTML | sort -ru | cut -d\" -f1 | head -n1)
download "$LATEST_URL" PIXEL_LATEST_HTML

# Get FI information
FI_URL="https://developer.android.com$(grep -o 'href=".*download.*"' PIXEL_LATEST_HTML | grep 'qpr' | cut -d\" -f2 | head -n1)"
download "$FI_URL" PIXEL_FI_HTML

# Extract device information
MODEL_LIST="$(grep -A1 'tr id=' PIXEL_FI_HTML | grep 'td' | sed 's;.*<td>\(.*\)</td>;\1;')"
PRODUCT_LIST="$(grep -o 'tr id="[^"]*"' PIXEL_FI_HTML | awk -F\" '{print $2 "_beta"}')"

# List available devices
if [ "$1" = "--list" ] || [ "$1" = "-l" ]; then
	get_model_product_list
fi

# Select and configure device
echo "- Selecting Pixel Canary device ..."
if [ -z "$PRODUCT" ] || ! echo "$PRODUCT_LIST" | grep -q "$PRODUCT"; then
	set_random_beta
fi
echo "$MODEL ($PRODUCT)"

# Get device fingerprint and security patch from Flash Tool and bulletins
DEVICE="$(echo "$PRODUCT" | sed 's/_beta//')"
download https://flash.android.com PIXEL_FLASH_HTML
FLASH_KEY=$(grep -o '<body data-client-config=.*' PIXEL_FLASH_HTML | cut -d\; -f2 | cut -d\& -f1)
if command -v curl > /dev/null 2>&1; then
	curl --connect-timeout 10 -H "Referer: https://flash.android.com" -s "https://content-flashstation-pa.googleapis.com/v1/builds?product=$PRODUCT&key=$FLASH_KEY" > PIXEL_STATION_JSON || download_fail "https://flash.android.com"
else
	busybox wget -T 10 --header "Referer: https://flash.android.com" -qO - "https://content-flashstation-pa.googleapis.com/v1/builds?product=$PRODUCT&key=$FLASH_KEY" > PIXEL_STATION_JSON || download_fail "https://flash.android.com"
fi
busybox tac PIXEL_STATION_JSON | busybox grep -m1 -A13 '"canary": true' > PIXEL_CANARY_JSON
ID="$(grep 'releaseCandidateName' PIXEL_CANARY_JSON | cut -d\" -f4)"
INCREMENTAL="$(grep 'buildId' PIXEL_CANARY_JSON | cut -d\" -f4)"
FINGERPRINT="google/$PRODUCT/$DEVICE:CANARY/$ID/$INCREMENTAL:user/release-keys"
download https://source.android.com/docs/security/bulletin/pixel PIXEL_SECBULL_HTML
CANARY_ID="$(grep '"id"' PIXEL_CANARY_JSON | sed -e 's;.*canary-\(.*\)".*;\1;' -e 's;^\(.\{4\}\);\1-;')"
SECURITY_PATCH="$(grep "<td>$CANARY_ID" PIXEL_SECBULL_HTML | sed 's;.*<td>\(.*\)</td>;\1;')"

# Validate required field to prevent empty pif.prop
if [ -z "$ID" ] || [ -z "$INCREMENTAL" ] || [ -z "$SECURITY_PATCH" ]; then
	echo "! Failed to get pif.prop"
	exit 1
fi

# Preserve previous setting
spoofConfig="spoofBuild spoofProps spoofProvider spoofSignature spoofVendingBuild spoofVendingSdk DEBUG"
for config in $spoofConfig; do
	if grep -q "$config=true" "$MODDIR/pif.prop"; then
		eval "$config=true"
	else
		eval "$config=false"
	fi
done

echo "- Dumping values to pif.prop ..."
echo ""
cat <<EOF | tee pif.prop
FINGERPRINT=$FINGERPRINT
MANUFACTURER=Google
MODEL=$MODEL
SECURITY_PATCH=$SECURITY_PATCH
spoofBuild=$spoofBuild
spoofProps=$spoofProps
spoofProvider=$spoofProvider
spoofSignature=$spoofSignature
spoofVendingBuild=$spoofVendingBuild
spoofVendingSdk=$spoofVendingSdk
DEBUG=$DEBUG
EOF

cat "$TEMPDIR/pif.prop" > /data/adb/pif.prop
echo ""
echo "- new pif.prop saved to /data/adb/pif.prop"

if [ -e "/data/adb/tricky_store/pif_auto_security_patch" ]; then
	sh "$MODDIR/security_patch.sh"
else
	rm -f $MODDIR/system.prop
fi

echo "- Cleaning up ..."
rm -rf "$TEMPDIR"

for i in $(busybox pidof com.google.android.gms.unstable com.android.vending); do
	echo "- Killing pid $i"
	kill -9 "$i"
done

echo "- Done!"
sleep_pause
