import { useRef, useEffect } from 'react'
import { setupDialogAnimation } from '../../hooks/useDialogAnimation'
import { Cli } from '../../lib/Cli'
import { REPOSITORY } from '../../constant'
import type { MdDialog } from '@material/web/dialog/dialog.js'

export default function WarningDialog() {
  const dialogRef = useRef<MdDialog | null>(null)

  useEffect(() => {
    if (dialogRef.current) setupDialogAnimation(dialogRef.current)
  }, [])

  const handleGithubRedirect = () => {
    Cli.openLink(`https://github.com/${REPOSITORY}/releases/latest`)
  }

  return (
    <md-dialog
      id="unofficial-warning"
      ref={dialogRef}
      open
      className="[&]:pointer-events-none"
      style={{
        '--md-dialog-container-color': 'var(--md-sys-color-error-container)',
        '--md-dialog-headline-color': 'var(--md-sys-color-on-error-container)',
        '--md-dialog-content-color': 'var(--md-sys-color-on-error-container)',
        '--md-dialog-supporting-text-color': 'var(--md-sys-color-on-error-container)',
      } as React.CSSProperties}
    >
      <div slot="headline">⚠️ Warning</div>
      <form slot="content" method="dialog">
        <p>This module has been tampered</p>
        <p>Please install from official source to proceed</p>
      </form>
      <form slot="actions" method="dialog">
        <md-filled-button
          id="github-btn"
          type="button"
          className="w-full!"
          onClick={handleGithubRedirect}
          style={{
            pointerEvents: 'all',
            '--md-sys-color-primary': 'var(--md-sys-color-tertiary)',
            '--md-sys-color-on-primary': 'var(--md-sys-color-on-tertiary)',
          } as React.CSSProperties}
        >
          Download from GitHub
        </md-filled-button>
      </form>
    </md-dialog>
  )
}
