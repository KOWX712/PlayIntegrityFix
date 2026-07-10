import { i18n } from '../lib/I18n'

interface FilterGroupProps {
  onFetch: () => void
  onView: () => void
  securityPatch: { supported: boolean; enabled: boolean }
  onSecurityPatchToggle: (enabled: boolean) => void
  scriptOnly: boolean
  onScriptOnlyToggle: (enabled: boolean) => void
  disabled: boolean
}

export default function FilterGroup({
  onFetch,
  onView,
  securityPatch,
  onSecurityPatchToggle,
  scriptOnly,
  onScriptOnlyToggle,
  disabled,
}: FilterGroupProps) {
  return (
    <div className="w-full max-w-200 shrink-0 landscape:max-w-none landscape:max-h-full landscape:overflow-auto">
      {/* Action buttons */}
      <md-chip-set className="pb-2">
        <md-assist-chip
          id="fetch"
          label={i18n.t('action_fetch', 'Fetch')}
          elevated
          disabled={disabled}
          onClick={onFetch}
        />
        <md-assist-chip
          id="view"
          label={i18n.t('action_view', 'View')}
          elevated
          disabled={disabled}
          onClick={onView}
        />
        {securityPatch.supported && (
          <md-filter-chip
            id="security-patch"
            label={i18n.t('action_auto_security_patch', 'Auto security patch')}
            selected={securityPatch.enabled}
            disabled={disabled}
            onClick={() => onSecurityPatchToggle(!securityPatch.enabled)}
          >
            <svg slot="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960">
              <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
            </svg>
          </md-filter-chip>
        )}
        <md-filter-chip
          id="script-only"
          label={i18n.t('action_script_only_mode', 'Script only mode')}
          selected={scriptOnly}
          disabled={disabled && !scriptOnly}
          onClick={() => onScriptOnlyToggle(!scriptOnly)}
        >
          <svg slot="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960">
            <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
          </svg>
        </md-filter-chip>
      </md-chip-set>
    </div>
  )
}
