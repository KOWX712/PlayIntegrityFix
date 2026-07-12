import { Terminal } from './Terminal'
import { PifConfig } from './PifConfig'
import { Cli } from './Cli'
import { File } from './File'
import { MODDIR, GITHUB_CDN, GITHUB_RAW, GITHUB_MIRROR, AUTO_SECURITY_PATCH_FLAG } from '../constant'
import { fallbackFetch } from './fetch'
import { i18n } from './I18n'
import type { DeviceInfo } from '../types'
import { PROP } from './PROP'

/**
 * Handles all fetch/update operations:
 * - github: fetch pif.prop from GitHub device tree → pifConfig.write()
 * - autopif: run autopif.sh → re-read config
 * - fetchDeviceList: device list from GitHub
 * Constructor runs #selfUpdate (autopif OTA script update).
 */
export class Update {
  #terminal: Terminal
  #pifConfig: PifConfig

  constructor(terminal: Terminal, pifConfig: PifConfig) {
    this.#terminal = terminal
    this.#pifConfig = pifConfig
    // Background autopif OTA update
    this.#selfUpdate()
  }

  /**
   * Fetch pif.prop from GitHub device tree, write via pifConfig, return fetched content.
   */
  async github(product: string): Promise<string> {
    this.#terminal.output('[+] ' + i18n.t('output_fetching_from_github'))
    this.#terminal.output('')

    try {
      const filePath = `bot/device_prop/${product}.prop`
      const result = await (await fallbackFetch([
        `${GITHUB_CDN}@${filePath}`,
        `${GITHUB_RAW}/${filePath}`,
        `${GITHUB_MIRROR}/${filePath}`,
      ])).text()

      try {
        await this.#pifConfig.write(result)
        PROP.stringify(this.#pifConfig.config).split('\n').forEach((line) => this.#terminal.output(line))
        this.#terminal.output('')
        this.#terminal.output('- new pif.prop saved to /data/adb/pif.prop')
        this.#terminal.output('')
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        this.#terminal.output(`[!] ${i18n.t('output_error_write_pif_prop')}: ${msg}`, true)
      }

      // security_patch.sh
      const TS_DIR = '/data/adb/modules/tricky_store'
      const [tsDir, tsDisabled, autoPatch] = await Promise.all([
        File.isDirectory(TS_DIR),
        File.exist(`${TS_DIR}/disable`),
        File.exist(AUTO_SECURITY_PATCH_FLAG)
      ])
      if (tsDir && !tsDisabled && autoPatch) {
        await Cli.runSecurityPatch()
      } else {
        await File.delete(`${MODDIR}/system.prop`).catch(() => {})
      }

      return result
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      this.#terminal.output(`[!] ${i18n.t('output_error_fetching_pif_prop')}: ${msg}`, true)
      throw error
    }
  }

  /**
   * Run autopif.sh via spawn, re-read config on exit.
   */
  async autopif(model?: string | null, product?: string | null): Promise<void> {
    this.#terminal.setShellRunning(true)

    const opts: Record<string, unknown> = {}
    if (model && product) {
      opts.env = { MODEL: `"${model}"`, PRODUCT: `"${product}"` }
    }

    const scriptOutput = Cli.runAutopifScript(opts)
    scriptOutput.stdout.on('data', (data: string) => this.#terminal.output(data))
    scriptOutput.stderr.on('data', (data: string) => this.#terminal.output(data, true))

    return new Promise<void>((resolve) => {
      scriptOutput.on('exit', async () => {
        this.#terminal.output('')
        try {
          await this.#pifConfig.read()
        } catch { /* config re-read handled silently */ }
        this.#terminal.setShellRunning(false)
        resolve()
      })
    })
  }

  /**
   * Fetch device list from GitHub.
   */
  async fetchDeviceList(): Promise<DeviceInfo[]> {
    try {
      const filePath = `bot/device_list.json`
      const devices: DeviceInfo[] = await (await fallbackFetch([
        `${GITHUB_CDN}@${filePath}`,
        `${GITHUB_RAW}/${filePath}`,
        `${GITHUB_MIRROR}/${filePath}`,
      ])).json()

      if (!Array.isArray(devices)) throw new Error('Invalid device list format')
      return devices.filter((d): d is DeviceInfo => !!(d.model && d.product))
    } catch {
      return []
    }
  }

  /** Update autopif OTA script in background */
  async #selfUpdate(): Promise<void> {
    try {
      const scriptOutput = Cli.runAutopifOta()
      scriptOutput.stdout.on('data', (data: string) => this.#terminal.output(data))
      scriptOutput.stderr.on('data', (data: string) => this.#terminal.output(data, true))
    } catch { /* background update failure is non-fatal */ }
  }
}
