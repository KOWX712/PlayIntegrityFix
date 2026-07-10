import type { SpoofConfigItem } from '../types'

export const spoofConfig: SpoofConfigItem[] = [
  { config: 'spoofBuild', label: 'Spoof Build' },
  { config: 'spoofVendingBuild', label: 'Spoof Build', playStore: true },
  { config: 'spoofProps', label: 'Spoof Props' },
  { config: 'spoofProvider', label: 'Spoof Provider' },
  { config: 'spoofSignature', label: 'Spoof Signature' },
  { config: 'spoofVendingSdk', label: 'Spoof Sdk', playStore: true },
]
