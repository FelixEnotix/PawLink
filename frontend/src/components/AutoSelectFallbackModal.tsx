import { useI18n } from '../i18n/LocaleContext';
import { stripLeadingFlag } from '../utils/format';

interface AutoSelectFallbackModalProps {
  serverName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AutoSelectFallbackModal({
  serverName,
  onConfirm,
  onCancel,
}: AutoSelectFallbackModalProps) {
  const { t } = useI18n();
  const label = stripLeadingFlag(serverName);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-card auto-select-fallback-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auto-select-fallback-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="auto-select-fallback-title">{t.home.fallbackPromptTitle}</h3>
        <p>{t.home.fallbackPromptBody}</p>
        <p className="auto-select-fallback-server">{label}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t.home.fallbackPromptCancel}
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            {t.home.fallbackPromptConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
