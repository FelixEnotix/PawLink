import { useI18n } from '../i18n/LocaleContext';
import { connectStageLabel, type ConnectFailure } from '../utils/connectError';

interface ConnectErrorAlertProps {
  failure: ConnectFailure;
}

export function ConnectErrorAlert({ failure }: ConnectErrorAlertProps) {
  const { t } = useI18n();
  const stage = connectStageLabel(t, failure.stage);

  return (
    <div className="alert alert-error connect-error-alert" role="alert">
      <div className="connect-error-title">{t.connect.notifyTitle}</div>
      <div className="connect-error-stage">
        {t.connect.stageLabel}: <strong>{stage}</strong>
      </div>
      <div className="connect-error-message">{failure.message}</div>
    </div>
  );
}
