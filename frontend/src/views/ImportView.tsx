import { useState } from 'react';
import type { useBackendState } from '../api/useBackend';
import { LinkIcon, FolderIcon, ImportIcon } from '../components/icons';
import { HelpTip } from '../components/HelpTip';
import { useI18n } from '../i18n/LocaleContext';

interface ImportViewProps {
  backend: ReturnType<typeof useBackendState>;
}

export function ImportView({ backend }: ImportViewProps) {
  const { t } = useI18n();
  const { importConfig, state } = backend;
  const [raw, setRaw] = useState('');
  const [subscriptionUrl, setSubscriptionUrl] = useState('');
  const [filePath, setFilePath] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const profileCount = state?.profiles.length ?? 0;

  const handleImport = async () => {
    if (!raw.trim() && !subscriptionUrl.trim()) {
      setError(t.import.needInput);
      return;
    }
    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await importConfig({
        raw: raw.trim() || undefined,
        subscription_url: subscriptionUrl.trim() || undefined,
      });
      if (result.count === 0) {
        setError(t.import.noneFound);
        return;
      }
      setSuccess(t.import.imported(result.count));
      setRaw('');
      setSubscriptionUrl('');
      setFilePath('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.import.importError);
    } finally {
      setImporting(false);
    }
  };

  const handlePickFile = async () => {
    setError(null);
    if (!window.pawlink) {
      setError(t.import.pickDesktopOnly);
      return;
    }
    try {
      const selected = await window.pawlink.pickConfigFile();
      if (!selected) return;
      setFilePath(selected.path);
      setRaw(selected.raw);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.import.readFailed);
    }
  };

  return (
    <div className="view import-view">
      <header className="view-header">
        <p className="subtitle">{t.import.subtitle}</p>
        {profileCount > 0 && <span className="badge badge-green">{t.import.nodesBadge(profileCount)}</span>}
      </header>

      <div className="import-grid">
        <section className="panel import-section" data-tour="import-subscription">
          <div className="panel-title">
            <LinkIcon size={15} />
            {t.import.subscription}
            <HelpTip text={t.help.importSubscription} label={t.settings.helpLabel} />
          </div>
          <input
            type="text"
            className="input"
            placeholder="https://example.com/subscribe"
            value={subscriptionUrl}
            onChange={(e) => setSubscriptionUrl(e.target.value)}
          />
          <p className="hint">{t.import.subscriptionHint}</p>
        </section>

        <section className="panel import-section" data-tour="import-file">
          <div className="panel-title">
            <FolderIcon size={15} />
            {t.import.file}
            <HelpTip text={t.help.importFile} label={t.settings.helpLabel} />
          </div>
          <div className="toolbar toolbar-flush">
            <input
              type="text"
              className="input"
              placeholder={t.import.noFile}
              value={filePath}
              readOnly
            />
            <button className="btn btn-ghost" type="button" onClick={handlePickFile}>
              {t.import.browse}
            </button>
          </div>
          <p className="hint">{t.import.fileHint}</p>
        </section>

        <section className="panel import-section full-width">
          <div className="panel-title">
            <ImportIcon size={15} />
            {t.import.raw}
          </div>
          <textarea
            className="input textarea"
            placeholder={t.import.rawPlaceholder}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={8}
          />
        </section>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <button className="btn btn-primary btn-lg" onClick={handleImport} disabled={importing}>
        <ImportIcon size={17} />
        {importing ? t.import.importing : t.import.importBtn}
      </button>
    </div>
  );
}
