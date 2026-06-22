#!/bin/sh

# LeafOS "gmscompat: Dynamically spoof props for GMS"
# https://review.leafos.org/c/LeafOS-Project/android_frameworks_base/+/4416
# https://review.leafos.org/c/LeafOS-Project/android_frameworks_base/+/4417/5
if [ -f /data/system/gms_certified_props.json ]; then
	resetprop -p --delete persist.sys.spoof.gms
	resetprop -c $(resetprop -Z persist.sys.spoof.gms) >/dev/null 2>&1 || true
fi

resetprop -c >/dev/null 2>&1 || true
