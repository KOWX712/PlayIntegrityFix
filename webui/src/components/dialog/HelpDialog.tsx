import { useRef, useCallback, useEffect } from 'react'
import { setupDialogAnimation } from '../../hooks/useDialogAnimation'
import { i18n } from '../../lib/I18n'
import { Cli } from '../../lib/Cli'
import type { MdDialog } from '@material/web/dialog/dialog.js'
import type { Terminal } from '../../lib/Terminal'

interface HelpDialogProps {
  dialogRef: (el: MdDialog | null) => void
  terminal: Terminal
  onDismiss?: () => void
}

export default function HelpDialog({ dialogRef, terminal, onDismiss }: HelpDialogProps) {
  const localRef = useRef<MdDialog | null>(null)
  const t = (key: string, fallback?: string, ...args: (string | number)[]) => i18n.t(key, fallback, ...args)

  useEffect(() => {
    if (localRef.current) setupDialogAnimation(localRef.current)
  }, [])

  const handleDialogClose = useCallback(() => {
    onDismiss?.()
  }, [onDismiss])

  useEffect(() => {
    const el = localRef.current
    if (!el) return
    el.addEventListener('close', handleDialogClose)
    return () => el.removeEventListener('close', handleDialogClose)
  }, [handleDialogClose])

  const handleRomSignCheck = useCallback(async () => {
    const sig = await Cli.checkRomSignature()
    if (sig) {
      terminal.output(sig)
    } else {
      terminal.output('[!] Could not determine ROM signature', true)
    }
  }, [terminal])

  return (
    <md-dialog
      id="help-dialog"
      ref={el => {
        dialogRef(el as MdDialog | null)
        localRef.current = el as MdDialog | null
      }}
    >
      <div slot="headline">{t('help_title', 'Help')}</div>
      <form id="form" slot="content" method="dialog">
        <div className="help-block mb-8">
          <p className="help-subtitle text-[1.3em] my-0">Spoof Build</p>
          <ul className="px-4">
            <li>{t('help_spoof_build')}</li>
          </ul>
        </div>
        <div className="help-block mb-8">
          <p className="help-subtitle text-[1.3em] my-0">Spoof Props</p>
          <ul className="px-4">
            <li>{t('help_spoof_props')}</li>
          </ul>
        </div>
        <div className="help-block mb-8">
          <p className="help-subtitle text-[1.3em] my-0">Spoof Provider</p>
          <ul className="px-4">
            <li>{t('help_spoof_provider')}</li>
          </ul>
        </div>
        <div className="help-block mb-8">
          <p className="help-subtitle text-[1.3em] my-0">Spoof Signature</p>
          <ul className="px-4">
            <li>{t('help_spoof_signature')}</li>
          </ul>
          <div className="flex items-center p-2 rounded-lg bg-surface-dim text-on-surface-variant break-all">
            <code>unzip -l /system/etc/security/otacerts.zip | grep -oE &quot;testkey|releasekey&quot;</code>
            <md-outlined-icon-button
              className="shrink-0!"
              style={{
                '--md-sys-shape-corner-full': '8px',
              } as React.CSSProperties}
              onClick={handleRomSignCheck}
            >
              <md-icon>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960">
                  <path d="M320-200v-560l440 280-440 280Z" />
                </svg>
              </md-icon>
            </md-outlined-icon-button>
          </div>
        </div>
        <div className="help-block mb-8">
          <p className="help-subtitle text-[1.3em] my-0">Spoof Sdk</p>
          <ul className="px-4">
            <li>{t('help_spoof_sdk')}</li>
          </ul>
        </div>
        <div className="help-block mb-8">
          <p className="help-subtitle text-[1.3em] my-0">Play Store?</p>
          <ul className="px-4">
            <li>{t('help_play_store')}</li>
          </ul>
        </div>
        <md-divider />
        <br />
        <div className="help-block mb-8">
          <p className="help-subtitle text-[1.3em] my-0">{t('action_fetch', 'Fetch')}</p>
          <ul className="px-4">
            <li>{t('help_fetch_github')}</li>
            <li>{t('help_fetch_autopif')}</li>
          </ul>
        </div>
        <div className="help-block mb-8">
          <p className="help-subtitle text-[1.3em] my-0">{t('action_view', 'View')}</p>
          <ul className="px-4">
            <li>{t('help_view')}</li>
          </ul>
        </div>
        <div className="help-block mb-8">
          <p className="help-subtitle text-[1.3em] my-0">{t('action_auto_security_patch', 'Auto security patch')}</p>
          <ul className="px-4">
            <li>{t('help_auto_security_patch')}</li>
          </ul>
        </div>
        <div className="help-block mb-8">
          <p className="help-subtitle text-[1.3em] my-0">{t('action_script_only_mode', 'Script only mode')}</p>
          <ul className="px-4">
            <li>{t('help_script_only_mode')}</li>
          </ul>
        </div>
      </form>
      <div slot="actions">
        <md-text-button onClick={() => localRef.current?.close()}>
          {t('help_close', 'Close')}
        </md-text-button>
      </div>
    </md-dialog>
  )
}
