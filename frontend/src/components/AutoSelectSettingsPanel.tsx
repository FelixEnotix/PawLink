import type { AutoSelectSettings, BlockedServer, EndpointProfile } from '../api/types';
import { useI18n } from '../i18n/LocaleContext';
import { CountryPicker } from './CountryPicker';
import { BlockedServersPanel } from './BlockedServersPanel';
import { DEFAULT_AUTO_SELECT, resolveAutoSelectSettings } from '../utils/autoSelect';

interface AutoSelectSettingsPanelProps {
  settings: AutoSelectSettings | undefined;
  autoSelectEnabled: boolean;
  profiles: EndpointProfile[];
  blockedServers: BlockedServer[];
  disabled?: boolean;
  onSave: (patch: Partial<AutoSelectSettings>) => Promise<void>;
  onToggleEnabled: (enabled: boolean) => Promise<void>;
  onBlockedChange: (blocked: BlockedServer[]) => Promise<void>;
}

export function AutoSelectSettingsPanel({
  settings,
  autoSelectEnabled,
  profiles,
  blockedServers,
  disabled,
  onSave,
  onToggleEnabled,
  onBlockedChange,
}: AutoSelectSettingsPanelProps) {
  const { t } = useI18n();
  const resolved = resolveAutoSelectSettings(settings);

  const savePing = async (field: 'ping_min_ms' | 'ping_max_ms', raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed)) return;
    const value = Math.max(0, Math.min(10_000, parsed));
    let pingMin = field === 'ping_min_ms' ? value : resolved.ping_min_ms;
    let pingMax = field === 'ping_max_ms' ? value : resolved.ping_max_ms;
    if (pingMin > pingMax) {
      if (field === 'ping_min_ms') pingMax = pingMin;
      else pingMin = pingMax;
    }
    await onSave({ ping_min_ms: pingMin, ping_max_ms: pingMax });
  };

  const resetDefaults = async () => {
    await onSave({ ...DEFAULT_AUTO_SELECT });
  };

  return (
    <div className="auto-select-settings" id="auto-select-settings">
      <div className="auto-select-header-row">
        <div>
          <strong>{t.settings.autoSelectEnabledTitle}</strong>
          <p className="settings-hint">{t.settings.autoSelectEnabledDesc}</p>
        </div>
        <label className={`setting-switch standalone ${disabled ? 'disabled' : ''}`}>
          <input
            type="checkbox"
            checked={autoSelectEnabled}
            disabled={disabled}
            onChange={(e) => void onToggleEnabled(e.target.checked)}
          />
          <span className="setting-switch-track" aria-hidden="true" />
        </label>
      </div>

      <div className="auto-select-grid">
        <label className="auto-select-field">
          <span>{t.settings.autoSelectPingMin}</span>
          <input
            type="number"
            min={0}
            max={10000}
            key={`min-${resolved.ping_min_ms}`}
            defaultValue={resolved.ping_min_ms}
            disabled={disabled}
            onBlur={(e) => void savePing('ping_min_ms', e.target.value)}
          />
        </label>
        <label className="auto-select-field">
          <span>{t.settings.autoSelectPingMax}</span>
          <input
            type="number"
            min={0}
            max={10000}
            key={`max-${resolved.ping_max_ms}`}
            defaultValue={resolved.ping_max_ms}
            disabled={disabled}
            onBlur={(e) => void savePing('ping_max_ms', e.target.value)}
          />
        </label>
      </div>
      <p className="settings-hint">{t.settings.autoSelectPingHint}</p>

      <div className="auto-select-section">
        <strong>{t.settings.autoSelectCountriesTitle}</strong>
        <CountryPicker
          selected={resolved.countries}
          disabled={disabled}
          onChange={(countries) => onSave({ countries })}
        />
      </div>

      <div className="auto-select-section">
        <strong>{t.settings.blockedServersTitle}</strong>
        <BlockedServersPanel
          profiles={profiles}
          blocked={blockedServers}
          disabled={disabled}
          onChange={onBlockedChange}
        />
      </div>

      <div className="auto-select-options">
        <label className="auto-select-option">
          <span>
            <strong>{t.settings.autoSelectAllowFallback}</strong>
            <small>{t.settings.autoSelectAllowFallbackDesc}</small>
          </span>
          <input
            type="checkbox"
            checked={resolved.allow_fallback}
            disabled={disabled}
            onChange={(e) => void onSave({ allow_fallback: e.target.checked })}
          />
        </label>
        <label className="auto-select-option">
          <span>
            <strong>{t.settings.autoSelectAutoReturn}</strong>
            <small>{t.settings.autoSelectAutoReturnDesc}</small>
          </span>
          <input
            type="checkbox"
            checked={resolved.auto_return}
            disabled={disabled}
            onChange={(e) => void onSave({ auto_return: e.target.checked })}
          />
        </label>
      </div>

      <button
        type="button"
        className="btn btn-secondary auto-select-reset"
        disabled={disabled}
        onClick={() => void resetDefaults()}
      >
        {t.settings.autoSelectReset}
      </button>
    </div>
  );
}
