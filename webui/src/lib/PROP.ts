import type { PifPropMap } from '../types'

export class PROP {
  static parse(prop: string): PifPropMap {
    const map: PifPropMap = {}
    if (!prop || typeof prop !== 'string') return map
    const lines = prop.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let value: string | number | boolean = trimmed.slice(eqIdx + 1).trim()
      if (value === 'true' || value === 'false') value = value === 'true'
      else if (/^\d+$/.test(value)) value = parseInt(value, 10)
      else if (/^\d+\.\d+$/.test(value)) value = parseFloat(value)
      map[key] = value
    }
    return map
  }

  static stringify(map: PifPropMap): string {
    if (!map || typeof map !== 'object') return ''
    return Object.entries(map)
      .map(([key, value]) => {
        if (typeof value === 'boolean') return `${key}=${value ? 'true' : 'false'}`
        return `${key}=${value}`
      })
      .join('\n')
  }
}
