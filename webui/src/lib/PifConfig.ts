import { i18n } from './I18n'
import type { PifPropMap } from '../types'
import { GITHUB_CDN, GITHUB_RAW, GITHUB_MIRROR, BRANCH, PIF_PROP_DEFAULT_PATH, PIF_PROP_CUSTOM_PATH } from '../constant'
import { spoofConfig } from '../data/spoofConfig'
import { fallbackFetch } from './fetch'
import { File } from './File'
import { Terminal } from './Terminal'
import { PROP } from './PROP'

/**
 * Holds the state of each pif.prop toggle.
 * Read happens once in constructor, if failed calls #reset (private).
 */
export class PifConfig {
  #config: PifPropMap = {}
  #terminal: Terminal
  #initPromise: Promise<void>

  constructor(terminal: Terminal) {
    this.#terminal = terminal
    this.#initPromise = this.#init()
  }

  /** Wait for async constructor init to complete */
  async waitForInit(): Promise<void> {
    await this.#initPromise
  }

  /**
   * Getter for internal config object (shallow copy)
   * @returns {PifPropMap} The internal config object
   */
  get config(): PifPropMap {
    return { ...this.#config }
  }

  /**
   * Get a specific config value by name
   * @param {string} name - The name of the config value to get
   * @returns {string | number | boolean | undefined} The value of the config value
   */
  getConfig(name: string): string | number | boolean | undefined {
    return this.#config[name]
  }

  /** Re-read config from file(s) */
  async read(): Promise<void> {
    this.#config = await this.#loadFromFile()
  }

  /**
   * Write complete prop content to pif files, merge with current config.
   * @param result - The content of the prop file to write
   * @returns {Promise<void>} A promise that resolves when the prop file has been written
   */
  async write(): Promise<void>
  async write(result: string): Promise<void>
  async write(result?: string): Promise<void> {
    if (result !== undefined) {
      const newMap = PROP.parse(result)
      this.#config = { ...this.#config, ...newMap }
    }
    const mergedProp = PROP.stringify(this.#config)
    const files = await this.#findPifFiles()
    for (const file of files) {
      await File.write(file, mergedProp)
    }
    if (files.length === 0) {
      await File.write(PIF_PROP_DEFAULT_PATH, mergedProp)
    }
  }

  /**
   * Set a single config value: read-modify-write on all pif.prop files.
   * @param {string} name - The name of the config value to set
   * @param {boolean} value - The value of the config value to set
   * @returns {Promise<void>} A promise that resolves when the config value has been set
   */
  async setConfig(name: string, value: boolean): Promise<void> {
    this.#config[name] = value
    await this.write()
  }

  async #init(): Promise<void> {
    try {
      this.#config = await this.#loadFromFile()
    } catch {
      this.#terminal.output('[!] ' + i18n.t('output_error_load_spoof_config'), true)
      this.#terminal.output('[!] ' + i18n.t('output_warning_third_party_tools'), true)
      await this.#reset()
    }
  }

  async #loadFromFile(): Promise<PifPropMap> {
    let content: string
    if (await File.exist(PIF_PROP_CUSTOM_PATH)) {
      content = await File.read(PIF_PROP_CUSTOM_PATH)
    } else {
      content = await File.read(PIF_PROP_DEFAULT_PATH)
    }
    const map = PROP.parse(content)
    // Ensure all spoofConfig fields exist, default to false if missing
    for (const item of spoofConfig) {
      if (!(item.config in map)) {
        map[item.config] = false
      }
    }
    return map
  }

  async #reset(): Promise<void> {
    try {
      const filePath = 'module/pif.prop'
      const text = await (await fallbackFetch([
        `${GITHUB_CDN}@${BRANCH}/${filePath}`,
        `${GITHUB_RAW}/${BRANCH}/${filePath}`,
        `${GITHUB_MIRROR}/${BRANCH}/${filePath}`,
      ])).text()
      const pifProp = text.trim()
      await File.write(PIF_PROP_DEFAULT_PATH, pifProp)
      if (await File.exist(PIF_PROP_CUSTOM_PATH)) {
        await File.delete(PIF_PROP_CUSTOM_PATH)
      }
      this.#config = PROP.parse(pifProp)
      this.#terminal.output('[+] ' + i18n.t('output_reset_pif_prop'))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      this.#terminal.output('[!] ' + i18n.t('output_error_reset_failed') + ': ' + msg, true)
    }
  }

  async #findPifFiles(): Promise<string[]> {
    const files: string[] = [PIF_PROP_DEFAULT_PATH]
    if (await File.exist(PIF_PROP_CUSTOM_PATH)) {
      files.push(PIF_PROP_CUSTOM_PATH)
    }
    return files
  }
}
