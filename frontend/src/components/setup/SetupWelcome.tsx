import { createPortal } from 'react-dom';
import brandIcon from '../../assets/brand-icon.png';
import { useI18n } from '../../i18n/LocaleContext';

interface SetupWelcomeProps {
  onHelp: () => void;
  onSkip: () => void;
}

export function SetupWelcome({ onHelp, onSkip }: SetupWelcomeProps) {
  const { t } = useI18n();

  return createPortal(
    <div className="setup-welcome-backdrop" role="presentation">
      <div
        className="setup-welcome-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-welcome-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="setup-welcome-brand brand-logo-image">
          <img src={brandIcon} alt="" width={56} height={56} draggable={false} />
        </div>
        <h2 id="setup-welcome-title">{t.setup.welcomeTitle}</h2>
        <p>{t.setup.welcomeBody}</p>
        <div className="setup-welcome-actions">
          <button type="button" className="btn btn-primary" onClick={onHelp}>
            {t.setup.helpMe}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onSkip}>
            {t.setup.myself}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
