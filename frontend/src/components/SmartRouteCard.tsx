import type { AutoSelectResult } from '../api/types';
import { useI18n } from '../i18n/LocaleContext';
import navSettings from '../assets/nav/settings.svg';
import { BoltIcon, RefreshIcon } from './icons';
import { formatCountriesSummary } from '../utils/countries';
import { resolveAutoSelectSettings } from '../utils/autoSelect';
import type { AutoSelectSettings } from '../api/types';

interface SmartRouteCardProps {
  settings: AutoSelectSettings | undefined;
  autoSelectEnabled: boolean;
  inFallback: boolean;
  autoSelecting: boolean;
  profilesCount: number;
  locale: 'ru' | 'en';
  onToggleEnabled: (enabled: boolean) => void;
  onOpenSettings: () => void;
  onPickOnce: () => void;
}

export function SmartRouteCard({
  settings,
  autoSelectEnabled,
  inFallback,
  autoSelecting,
  profilesCount,
  locale,
  onToggleEnabled,
  onOpenSettings,
  onPickOnce,
}: SmartRouteCardProps) {
  const { t } = useI18n();
  const resolved = resolveAutoSelectSettings(settings);
  const countryHint = formatCountriesSummary(resolved.countries, locale);
  const hint = inFallback
    ? t.home.smartRouteFallback
    : `${countryHint} · ${resolved.ping_min_ms}–${resolved.ping_max_ms} ms`;

  return (
    <div className={`smart-route-card smart-route-panel ${inFallback ? 'is-fallback' : ''}`}>
      <div className="smart-route-panel-head">
        <span className="smart-route-icon">
          <BoltIcon size={20} />
        </span>
        <div className="smart-route-copy">
          <strong>{t.home.smartRoute}</strong>
          <small>{hint}</small>
        </div>
        <div className="smart-route-actions-top">
          <label
            className="setting-switch smart-route-toggle"
            title={t.home.autoSelectToggle}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={autoSelectEnabled}
              onChange={(e) => onToggleEnabled(e.target.checked)}
            />
            <span className="setting-switch-track" aria-hidden="true" />
          </label>
          <button
            type="button"
            className="smart-route-gear"
            title={t.home.autoSelectSettings}
            onClick={onOpenSettings}
          >
            <img src={navSettings} alt="" width={24} height={24} draggable={false} />
          </button>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-secondary smart-route-pick-btn"
        disabled={autoSelecting || profilesCount === 0}
        onClick={onPickOnce}
      >
        <RefreshIcon size={15} className={autoSelecting ? 'spin' : undefined} />
        {autoSelecting ? t.home.autoSelectPicking : t.home.autoSelectPickOnce}
      </button>
    </div>
  );
}

export type { AutoSelectResult };
