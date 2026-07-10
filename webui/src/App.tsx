import { useEffect, useState, useRef, useCallback } from 'react'
import { i18n } from './lib/I18n'
import { Cli } from './lib/Cli'
import { File } from './lib/File'
import { Terminal } from './lib/Terminal'
import { PifConfig } from './lib/PifConfig'
import { Update } from './lib/Update'
import Header from './components/Header'
import FilterGroup from './components/FilterGroup'
import SwitchItem from './components/SwitchItem'
import TerminalView from './components/Terminal'
import Layout from './components/Layout'
import WarningDialog from './components/dialog/WarningDialog'
import FetchDialog from './components/dialog/FetchDialog'
import HelpDialog from './components/dialog/HelpDialog'
import type { MdDialog } from '@material/web/dialog/dialog.js'
import { spoofConfig } from './data/spoofConfig'
import { PROP } from './lib/PROP'
import type { DeviceInfo, OutputLine } from './types'
import { AUTO_SECURITY_PATCH_FLAG, SCRIPT_ONLY_FLAG } from './constant'
import { useHistory } from './hooks/useHistory'

export default function App() {
  const [terminal] = useState(() => new Terminal())
  const [pifConfig, setPifConfig] = useState<PifConfig | null>(null)
  const [updater, setUpdater] = useState<Update | null>(null)

  const [, setOutputLines] = useState<OutputLine[]>(terminal.lines)
  const [configValues, setConfigValues] = useState<Record<string, boolean>>({})
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | null>(null)
  const [securityPatch, setSecurityPatch] = useState({ supported: false, enabled: false })
  const [scriptOnly, setScriptOnly] = useState(false)
  const [shellRunning, setShellRunning] = useState(terminal.shellRunning)
  const [showWarning, setShowWarning] = useState(false)
  const [deviceListError, setDeviceListError] = useState(false)

  const deviceDialogRef = useRef<MdDialog | null>(null)
  const helpDialogRef = useRef<MdDialog | null>(null)
  const initialDeviceRef = useRef<string | null>(null)
  const history = useHistory()

  // Subscribe to terminal changes
  useEffect(() => {
    const unsubLines = terminal.subscribe(setOutputLines)
    const unsubShell = terminal.onShellStateChange(setShellRunning)
    return () => {
      unsubLines()
      unsubShell()
    }
  }, [terminal])

  const [translationRev, bumpTranslationRev] = useState(0)
  useEffect(() => {
    return i18n.subscribe(() => bumpTranslationRev(n => n + 1))
  }, [])

  // Init on mount
  useEffect(() => {
    const init = async () => {
      // Load translations first (needed for UI labels)
      await i18n.loadTranslations()
      // Init PifConfig (reads config in constructor, resets on failure)
      const pc = new PifConfig(terminal)
      setPifConfig(pc)
      await pc.waitForInit()

      // Init Update (starts autopif OTA in constructor)
      const up = new Update(terminal, pc)
      setUpdater(up)

      // Read config values for UI
      const boolMap: Record<string, boolean> = {}
      spoofConfig.forEach(item => {
        boolMap[item.config] = !!pc.getConfig(item.config)
      })
      setConfigValues(boolMap)

      const modelVal = pc.config.MODEL
      if (modelVal) {
        initialDeviceRef.current = String(modelVal)
      }

      // Tampered check
      try {
        const tampered = await Cli.checkTampered()
        if (tampered) setShowWarning(true)
      } catch { /* ignore */ }

      // Auto security patch
      try {
        const tsDir = await File.isDirectory('/data/adb/modules/tricky_store')
        const tsDisabled = await File.exist('/data/adb/modules/tricky_store/disable')
        const supported = tsDir && !tsDisabled
        const enabled = supported && await File.exist(AUTO_SECURITY_PATCH_FLAG)

        setSecurityPatch({ supported, enabled })
        if (!supported) await File.delete(AUTO_SECURITY_PATCH_FLAG).catch(() => {})
      } catch { /* ignore */ }

      // Script only
      try {
        const so = await File.exist(SCRIPT_ONLY_FLAG)
        setScriptOnly(so)
        if (so) terminal.setShellRunning(true)
      } catch { /* ignore */ }

      // Device list
      try {
        const devs = await up.fetchDeviceList()
        setDevices(devs)
        if (devs.length === 0) {
          setDeviceListError(true)
        } else if (initialDeviceRef.current) {
          const match = devs.find(d => d.model === initialDeviceRef.current || d.product === initialDeviceRef.current)
          if (match) setSelectedDevice(match)
        }
      } catch { setDeviceListError(true) }

      // Notifications
      try {
        const selinux = await Cli.checkSELinux()
        if (selinux === 'Permissive') {
          terminal.output('[!] ' + i18n.t('output_selinux_permissive'), true)
        }
      } catch { /* ignore */ }

      try {
        const outdated = await Cli.checkPropDate()
        if (outdated === 'outdated') {
          terminal.output('[!] ' + i18n.t('output_oudated_pif_prop'), true)
        }
      } catch { /* ignore */ }

      try {
        const sig = await Cli.checkRomSignature()
        if (sig) {
          const spoofSig = pc.getConfig('spoofSignature')
          if (sig === 'testkey' && !spoofSig) {
            terminal.output('[!] ' + i18n.t('output_testkey'))
          } else if (sig === 'releasekey' && spoofSig) {
            terminal.output('[+] ' + i18n.t('output_releasekey'))
          }
        }
      } catch { /* ignore */ }
    }

    init()
  }, [terminal])

  // Spoof config toggle
  const handleToggle = useCallback(async (config: string, value: boolean) => {
    if (shellRunning || scriptOnly) return
    const pc = pifConfig
    if (!pc) return

    terminal.setShellRunning(true)
    try {
      await pc.setConfig(config, value)
      Cli.killGms()
      setConfigValues(prev => ({ ...prev, [config]: value }))
      if (config === 'spoofSignature') {
        const sig = await Cli.checkRomSignature()
        if (sig === 'testkey' && value) {
          terminal.output('[!] ' + i18n.t('output_testkey'))
        } else if (sig === 'releasekey' && !value) {
          terminal.output('[+] ' + i18n.t('output_releasekey'))
        }
      }
      if ((config === 'spoofVendingBuild' || config === 'spoofVendingSdk') && pc.getConfig('spoofVendingBuild') && pc.getConfig('spoofVendingSdk')) {
        terminal.output('[!] ' + i18n.t('output_spoofVendingSdk_spoofVendingBuild'))
      }
    } catch {
      terminal.output(`[!] ${value ? i18n.t('output_error_enable_failed') : i18n.t('output_error_disable_failed')}: ${config}`, true)
    }
    terminal.setShellRunning(false)
  }, [shellRunning, scriptOnly, terminal, pifConfig])

  // Action: show device dialog
  const handleFetch = useCallback(() => {
    deviceDialogRef.current?.show()
    history.push('dialog-fetch', () => deviceDialogRef.current?.close())
  }, [history])

  // Action: view pif.prop
  const handleView = useCallback(async () => {
    const pc = pifConfig
    if (!pc) return
    const propText = PROP.stringify(pc.config)
    if (propText) {
      propText.split('\n').forEach(line => terminal.output(line))
      terminal.output('')
    } else {
      terminal.output('[!] ' + i18n.t('output_error_read_pif_prop'), true)
    }
  }, [terminal, pifConfig])

  // Security patch toggle
  const handleSecurityPatchToggle = useCallback(async (enabled: boolean) => {
    try {
      await Cli.toggleAutoSecurityPatch(enabled)
      setSecurityPatch(prev => ({ ...prev, enabled }))
      terminal.output(`[+] ${enabled ? i18n.t('output_enabled') : i18n.t('output_disabled')} auto security patch.`)
    } catch { /* ignore */ }
  }, [terminal])

  // Script only toggle
  const handleScriptOnlyToggle = useCallback(async (enabled: boolean) => {
    try {
      if (enabled) {
        await File.createFile(SCRIPT_ONLY_FLAG)
      } else {
        await File.delete(SCRIPT_ONLY_FLAG)
      }
      Cli.killGms()
      const isEnabled = await File.exist(SCRIPT_ONLY_FLAG)
      setScriptOnly(isEnabled)
      terminal.setShellRunning(isEnabled)
      terminal.output(`[+] ${isEnabled ? i18n.t('output_enabled') : i18n.t('output_disabled')} script only mode.`)
    } catch { /* ignore */ }
  }, [terminal])

  // Help button
  const handleHelpClick = useCallback(() => {
    helpDialogRef.current?.show()
    history.push('dialog-help', () => helpDialogRef.current?.close())
  }, [history])

  const isDisabled = shellRunning

  return (
    <Layout header={<Header onHelpClick={handleHelpClick} />}>
      <div className="w-full max-w-200 mx-auto landscape:flex-1 landscape:max-w-none landscape:mx-0 landscape:flex landscape:flex-col landscape:overflow-y-auto landscape:min-h-0">
        <FilterGroup
          key={translationRev}
          onFetch={handleFetch}
          onView={handleView}
          securityPatch={securityPatch}
          onSecurityPatchToggle={handleSecurityPatchToggle}
          scriptOnly={scriptOnly}
          onScriptOnlyToggle={handleScriptOnlyToggle}
          disabled={isDisabled}
        />
        {/* SpoofConfig toggles */}
        <div className="w-full max-w-200 landscape:max-w-none flex flex-col gap-0.5">
          {spoofConfig.map((item, index) => (
            <SwitchItem
              className='bg-surface-container-high'
              key={item.config}
              index={index}
              count={spoofConfig.length}
              label={item.label}
              playStore={item.playStore}
              selected={!!configValues[item.config]}
              disabled={isDisabled}
              onChange={(value) => handleToggle(item.config, value)}
            />
          ))}
        </div>
        <div className='hidden landscape:block pb-4 shrink-0' />
        <div className='hidden landscape:block pb-safe shrink-0' />
      </div>
      <TerminalView key={translationRev} terminal={terminal} />

      {/* Dialogs */}
      {showWarning && (
        <WarningDialog />
      )}
      <FetchDialog
        dialogRef={el => { deviceDialogRef.current = el }}
        devices={devices}
        selectedDevice={selectedDevice}
        error={deviceListError}
        onDeviceSelect={setSelectedDevice}
        updater={updater}
        pifConfig={pifConfig}
        terminal={terminal}
        onConfigValuesChange={setConfigValues}
        onDismiss={() => history.consume('dialog-fetch')}
      />
      <HelpDialog
        dialogRef={el => { helpDialogRef.current = el }}
        terminal={terminal}
        onDismiss={() => history.consume('dialog-help')}
      />
    </Layout>
  )
}
