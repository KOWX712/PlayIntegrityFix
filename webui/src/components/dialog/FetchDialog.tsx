import { useRef, useCallback, useEffect } from 'react'
import RadioItem from '../RadioItem'
import { setupDialogAnimation } from '../../hooks/useDialogAnimation'
import { i18n } from '../../lib/I18n'
import { Cli } from '../../lib/Cli'
import { spoofConfig } from '../../data/spoofConfig'
import type { MdDialog } from '@material/web/dialog/dialog.js'
import type { DeviceInfo } from '../../types'
import type { Update } from '../../lib/Update'
import type { PifConfig } from '../../lib/PifConfig'
import type { Terminal } from '../../lib/Terminal'

interface FetchDialogProps {
  dialogRef: (el: MdDialog | null) => void
  devices: DeviceInfo[]
  selectedDevice: DeviceInfo | null
  error: boolean
  onDeviceSelect: (device: DeviceInfo | null) => void
  updater: Update | null
  pifConfig: PifConfig | null
  terminal: Terminal
  onConfigValuesChange: (values: Record<string, boolean>) => void
  onDismiss?: () => void
}

export default function FetchDialog({
  dialogRef,
  devices,
  selectedDevice,
  error,
  onDeviceSelect,
  updater,
  pifConfig,
  onConfigValuesChange,
  onDismiss,
}: FetchDialogProps) {
  const t = (key: string, fallback?: string, ...args: (string | number)[]) => i18n.t(key, fallback, ...args)
  const localDialogRef = useRef<MdDialog | null>(null)

  useEffect(() => {
    if (localDialogRef.current) setupDialogAnimation(localDialogRef.current)
  }, [])

  const handleDialogClose = useCallback(() => {
    onDismiss?.()
  }, [onDismiss])

  useEffect(() => {
    const el = localDialogRef.current
    if (!el) return
    el.addEventListener('close', handleDialogClose)
    return () => el.removeEventListener('close', handleDialogClose)
  }, [handleDialogClose])

  const handleCancelFetch = useCallback(() => {
    localDialogRef.current?.close()
  }, [])

  const handleConfirmFetch = useCallback(async () => {
    if (!selectedDevice || !updater) return
    localDialogRef.current?.close()
    try {
      await updater.github(selectedDevice.product)
    } catch { /* handled in Update */ }
    Cli.killGms()
  }, [selectedDevice, updater])

  // Scroll selected device into view
  const scrollSelectedIntoView = useCallback(() => {
    const dialog = localDialogRef.current
    if (!dialog?.shadowRoot || !selectedDevice) return
    try {
      const scroller = dialog.shadowRoot.querySelector('.scroller') as HTMLElement | null
      if (!scroller) return
      const radios = Array.from(dialog.querySelectorAll('md-radio'))
      const radio = radios.find(r => (r as unknown as { value: string }).value === selectedDevice.product) as HTMLElement | null
      if (!radio) return
      const radioRect = radio.getBoundingClientRect()
      const scrollerRect = scroller.getBoundingClientRect()
      const visibleOffset = radioRect.top - scrollerRect.top
      scroller.scrollTo({ top: scroller.scrollTop + visibleOffset - 16, behavior: 'smooth' })
    } catch { /* ignore */ }
  }, [selectedDevice])

  useEffect(() => {
    scrollSelectedIntoView()
  }, [scrollSelectedIntoView])

  useEffect(() => {
    const el = localDialogRef.current
    if (!el) return
    el.addEventListener('opened', scrollSelectedIntoView)
    return () => el.removeEventListener('opened', scrollSelectedIntoView)
  }, [scrollSelectedIntoView])

  const handleAutopif = useCallback(async () => {
    if (!updater) return
    localDialogRef.current?.close()
    await updater.autopif(selectedDevice?.model, selectedDevice?.product)
    if (pifConfig) {
      const boolMap: Record<string, boolean> = {}
      spoofConfig.forEach(item => {
        boolMap[item.config] = !!pifConfig.getConfig(item.config)
      })
      onConfigValuesChange(boolMap)
    }
  }, [selectedDevice, updater, pifConfig, onConfigValuesChange])

  return (
    <md-dialog
      id="select-device-dialog"
      ref={el => {
        dialogRef(el as MdDialog | null)
        localDialogRef.current = el as MdDialog | null
      }}
      className="w-[calc(100%-32px)] max-w-200"
    >
      <div slot="headline">{t('device_list_title', 'Select Device')}</div>
      <form slot="content" method="dialog" id="device-list" className="flex flex-col gap-0.5">
        {/* Random option */}
        <RadioItem
          className="bg-surface-container-low"
          name="device"
          value="random"
          label={t('device_list_random', 'Random')}
          onChange={() => {
            if (devices.length > 0) {
              let ri: number
              do {
                ri = Math.floor(Math.random() * devices.length)
              } while (devices[ri].product === selectedDevice?.product && devices.length > 1)
              onDeviceSelect(devices[ri])
            } else {
              onDeviceSelect(null)
            }
          }}
          count={1}
        />
        <div className="pt-1" />
        {devices.length > 0 ? (
          devices.map((device, index) => (
            <RadioItem
              className="bg-surface-container-low"
              key={device.product}
              name="device"
              value={device.product}
              checked={selectedDevice?.product === device.product}
              label={device.model}
              index={index}
              count={devices.length}
              onChange={() => onDeviceSelect(device)}
            />
          ))
        ) : (
          <div id="device-list-status" className={error ? 'text-error font-medium' : ''}>
            {error ? t('device_list_load_failed') : t('device_list_loading', 'Loading...')}
          </div>
        )}
      </form>
      <form slot="actions" method="dialog" className='flex flex-row'>
        <md-text-button
          id="cancel-fetch"
          type="button"
          className="me-auto!"
          onClick={handleCancelFetch}
        >
          {t('device_list_button_cancel', 'Cancel')}
        </md-text-button>
        <md-outlined-button
          id="autopif"
          type="button"
          onClick={handleAutopif}
        >
          {t('device_list_button_autopif', 'Autopif')}
        </md-outlined-button>
        <md-filled-button
          id="confirm-fetch"
          type="button"
          disabled={!selectedDevice}
          onClick={handleConfirmFetch}
        >
          {t('device_list_button_github', 'GitHub')}
        </md-filled-button>
      </form>
    </md-dialog>
  )
}
