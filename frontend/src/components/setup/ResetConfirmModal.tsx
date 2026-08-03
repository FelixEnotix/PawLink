import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/LocaleContext';

export type ResetMode = 'settings' | 'factory';

interface ResetConfirmModalProps {
  mode: ResetMode;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onBackupFirst?: () => void;
}

export function ResetConfirmModal({
  mode,
  busy,
  onCancel,
  onConfirm,
  onBackupFirst,
}: ResetConfirmModalProps) {
  const { t } = useI18n();
  const isFactory = mode === 'factory';

  return createPortal(
    <div className="modal-backdrop" onClick={onCancel} role="presentation">
      <div
        className="modal-card reset-confirm-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h3 id="reset-confirm-title">
            {isFactory ? t.settings.resetFactoryTitle : t.settings.resetSettingsTitle}
          </h3>
        </header>
        <p className="reset-confirm-body">
          {isFactory ? t.settings.resetFactoryBody : t.settings.resetSettingsBody}
        </p>
        {isFactory && <p className="reset-confirm-warn">{t.settings.resetFactoryWarn}</p>}
        <div className="modal-actions reset-confirm-actions">
          {isFactory && onBackupFirst && (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onBackupFirst}>
              {t.settings.resetBackupFirst}
            </button>
          )}
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
            {t.settings.resetCancel}
          </button>
          <button
            type="button"
            className={`btn ${isFactory ? 'btn-danger' : 'btn-primary'}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? t.settings.resetting : t.settings.resetConfirm}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
