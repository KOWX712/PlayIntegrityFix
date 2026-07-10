import { exec, spawn, toast } from 'kernelsu-alt'
import { MODDIR, PIF_PROP_CUSTOM_PATH, PIF_PROP_DEFAULT_PATH } from '../constant'

export class Cli {
  static killGms(): void {
    spawn('kill', ['-9', '$(busybox pidof com.google.android.gms.unstable com.android.vending)'], {
      env: { PATH: '$PATH:/data/adb/ap/bin:/data/adb/ksu/bin:/data/adb/magisk' },
    })
  }

  static async loadVersion(): Promise<string> {
    const { errno, stdout } = await exec(`grep '^version=' ${MODDIR}/module.prop | cut -d'=' -f2`)
    if (errno === 0) return stdout.trim()
    return ''
  }

  static async checkTampered(): Promise<boolean> {
    const { errno } = await exec(`grep -q 'tampered' ${MODDIR}/module.prop`)
    return errno === 0
  }

  static async checkPropDate(): Promise<string> {
    const result = await exec(`
      prop_date="$(grep "^SECURITY_PATCH=" ${PIF_PROP_CUSTOM_PATH} ${PIF_PROP_DEFAULT_PATH} 2>/dev/null | cut -d'=' -f2 | head -n 1)"
      prop_epoch="$(busybox date -d "$prop_date" +%s)"
      current_epoch="$(busybox date +%s)"
      different="$(($current_epoch - $prop_epoch))"
      if [ $different -gt 5184000 ]; then echo "outdated"; fi
    `, { env: { PATH: '$PATH:/data/adb/ap/bin:/data/adb/ksu/bin:/data/adb/magisk' } },
    )
    if (result.stdout.includes('outdated')) return 'outdated'
    return ''
  }

  static async checkSELinux(): Promise<string> {
    const { errno, stdout } = await exec('getenforce')
    if (errno !== 0) return ''
    return stdout.trim()
  }

  static async checkRomSignature(): Promise<string> {
    const { errno, stdout } = await exec('unzip -l /system/etc/security/otacerts.zip | grep -oE "testkey|releasekey"')
    if (errno !== 0) return ''
    return stdout.trim()
  }

  static runSecurityPatch(): ReturnType<typeof exec> {
    return exec(`sh ${MODDIR}/security_patch.sh`)
  }

  static runAutopifScript(opts?: { env?: Record<string, string> }) {
    return spawn('sh', [`${MODDIR}/autopif.sh`], opts)
  }

  static runAutopifOta() {
    return spawn('sh', [`${MODDIR}/autopif_ota.sh`])
  }

  static openLink(url: string) {
    toast(`Redirecting to ${url}`)
    setTimeout(() => {
      exec(`am start -a android.intent.action.VIEW -d ${url}`)
        .then(({ errno }) => {
          if (errno !== 0) window.open(url, '_blank')
        })
        .catch(() => window.open(url, '_blank'))
    }, 100)
  }

  static async toggleAutoSecurityPatch(enable: boolean): Promise<void> {
    await exec(`sh ${MODDIR}/security_patch.sh --${enable ? 'enable' : 'disable'}`, {
      env: { PATH: '/data/adb/magisk:/data/adb/ksu/bin:/data/adb/ap/bin:$PATH' },
    })
  }

}
