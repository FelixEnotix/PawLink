import type { RoutingMode } from '../api/types';
import { useI18n } from '../i18n/LocaleContext';

interface RoutingModeSelectorProps {
  value: RoutingMode;
  disabled?: boolean;
  compact?: boolean;
  isAdmin?: boolean;
  onChange: (mode: RoutingMode) => void | Promise<void>;
}

export function RoutingModeSelector({
  value,
  disabled,
  compact,
  isAdmin = true,
  onChange,
}: RoutingModeSelectorProps) {
  const { t } = useI18n();

  const modes: Array<{ id: RoutingMode; label: string; hint: string; blocked?: boolean }> = [
    {
      id: 'rule',
      label: t.modes.rule,
      hint: isAdmin ? t.modes.ruleHint : t.modes.ruleHintNoAdmin,
      blocked: !isAdmin,
    },
    { id: 'global', label: t.modes.global, hint: t.modes.globalHint },
    { id: 'direct', label: t.modes.direct, hint: t.modes.directHint },
  ];

  return (
    <div className={`routing-mode-selector${compact ? ' compact' : ''}`}>
      {modes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          className={`routing-mode-btn ${value === mode.id ? 'active' : ''}${mode.blocked ? ' blocked' : ''}`}
          disabled={disabled || mode.blocked}
          title={mode.hint}
          onClick={() => onChange(mode.id)}
        >
          <span className="routing-mode-label">{mode.label}</span>
          {!compact && <span className="routing-mode-hint">{mode.hint}</span>}
        </button>
      ))}
    </div>
  );
}
