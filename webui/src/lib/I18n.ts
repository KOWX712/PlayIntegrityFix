const rtlLang = [
  'ar',
  'fa',
  'he',
  'ur',
  'ps',
  'sd',
  'ku',
  'yi',
  'dv',
]

interface TranslationMap {
  [key: string]: string
}

/**
 * I18n service class managing translations and language detection.
 */
export class I18n {
  private translations: TranslationMap = {}
  private baseTranslations: TranslationMap = {}
  private availableLanguages: string[] = ['en']
  private listeners = new Set<() => void>()

  lang = 'en'

  constructor() {
    (window as unknown as { loadTranslations: (lang?: string) => Promise<void> }).loadTranslations = this.loadTranslations.bind(this)
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private notify(): void {
    this.listeners.forEach(cb => cb())
  }

  /**
   * Parse XML translation file into a JavaScript object
   */
  private parseTranslationsXML(xmlText: string): TranslationMap {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml')
    const strings = xmlDoc.getElementsByTagName('string')
    const translations: TranslationMap = {}

    for (let i = 0; i < strings.length; i++) {
      const string = strings[i]
      const name = string.getAttribute('name')
      const value = string.textContent
      if (name) translations[name] = value ?? ''
    }

    return translations
  }

  /**
   * Detect user's default language
   */
  private async detectUserLanguage(): Promise<string> {
    const userLang = navigator.language || (navigator as { userLanguage?: string }).userLanguage || 'en'
    const langCode = userLang.split('-')[0]

    try {
      const availableResponse = await fetch('locales/languages.json')
      const availableData = await availableResponse.json()
      this.availableLanguages = Object.keys(availableData)

      if (this.availableLanguages.includes(userLang)) return userLang
      if (this.availableLanguages.includes(langCode)) return langCode
      return 'en'
    } catch {
      return 'en'
    }
  }

  /**
   * Load translations dynamically based on the selected language
   */
  async loadTranslations(lang?: string): Promise<void> {
    try {
      const baseResponse = await fetch('./locales/strings/en.xml')
      const baseXML = await baseResponse.text()
      this.baseTranslations = this.parseTranslationsXML(baseXML)

      if (!lang) lang = await this.detectUserLanguage()
      this.lang = lang

      if (lang !== 'en') {
        const response = await fetch(`locales/strings/${lang}.xml`)
        const userXML = await response.text()
        const userTranslations = this.parseTranslationsXML(userXML)
        this.translations = { ...this.baseTranslations, ...userTranslations }
      } else {
        this.translations = { ...this.baseTranslations }
      }

      const isRTL = rtlLang.includes(lang.split('-')[0])
      document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr')
    } catch {
      this.translations = { ...this.baseTranslations }
    }
    this.notify()
  }

  /**
   * Get a translated string by key with optional fallback and formatting.
   * Formatting: translate key "count: {}" → t('count', null, 5) → "count: 5"
   * @param {string} key - The key of the translation to get
   * @param {string} fallback - The fallback translation to use if the key is not found
   * @param {...(string | number)[]} args - Optional arguments to format the translation
   * @returns {string} The translated string
   */
  t(key: string, fallback?: string, ...args: (string | number)[]): string {
    let text = this.translations[key] ?? fallback ?? key
    for (const arg of args) {
      text = text.replace('{}', String(arg))
    }
    return text
  }
}

export const i18n = new I18n()
