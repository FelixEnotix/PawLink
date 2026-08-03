import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client';
import type { RuleListInfo } from '../api/types';
import { FolderIcon, LinkIcon, PlusIcon, RefreshIcon, TrashIcon } from './icons';

import { useI18n } from '../i18n/LocaleContext';

interface RuleListsModalProps {
  open: boolean;
  onClose: () => void;
  onApplied: () => Promise<void> | void;
}

export function RuleListsModal({ open, onClose, onApplied }: RuleListsModalProps) {
  const { t } = useI18n();
  const [lists, setLists] = useState<RuleListInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showDownload, setShowDownload] = useState(false);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [dlName, setDlName] = useState('');
  const [dlUrl, setDlUrl] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [items, dir] = await Promise.all([
        api.listRuleLists(),
        api.getRuleListsDirectory().catch(() => null),
      ]);
      setLists(items);
      if (dir?.path) setFolderPath(dir.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.ruleLists.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setMessage(null);
    setShowDownload(false);
    void load();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleApply = async (name: string, replace: boolean) => {
    setBusy(`${name}:${replace ? 'replace' : 'merge'}`);
    setError(null);
    setMessage(null);
    try {
      const result = await api.applyRuleList(name, replace);
      setMessage(
        replace
          ? t.ruleLists.appliedReplace(name, result.total)
          : t.ruleLists.appliedMerge(name, result.added, result.updated, result.total),
      );
      setBusy(null);
      // Don't hold the modal busy while parent refreshes state.
      void onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.ruleLists.applyFailed);
      setBusy(null);
    }
  };

  const handleOpenFolder = async () => {
    setBusy('folder');
    setError(null);
    setMessage(null);
    try {
      const result = await api.openRuleListsDirectory();
      setFolderPath(result.path);
      setMessage(t.ruleLists.folderOpened);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.ruleLists.openFolderFailed);
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dlName.trim() || !dlUrl.trim()) return;
    setBusy('download');
    setError(null);
    setMessage(null);
    try {
      const info = await api.downloadRuleList(dlName.trim(), dlUrl.trim());
      setMessage(t.ruleLists.downloaded(info.name, info.rule_count));
      setShowDownload(false);
      setDlName('');
      setDlUrl('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.ruleLists.downloadFailed);
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(t.ruleLists.deleteConfirm(name))) {
      return;
    }
    setBusy(`del:${name}`);
    setError(null);
    try {
      await api.deleteRuleList(name);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.ruleLists.deleteFailed);
    } finally {
      setBusy(null);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card rule-lists-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rule-lists-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="rule-lists-title">{t.routing.ruleListPreset}</h2>
            <p className="hint">{t.ruleLists.subtitle}</p>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label={t.ruleLists.close}>
            ×
          </button>
        </header>

        <div className="rule-lists-help">
          <strong>{t.ruleLists.howTitle}</strong>
          <ol>
            <li>{t.ruleLists.howStep1}</li>
            <li>
              {t.ruleLists.howStep2} (<code>Work.txt</code>).
            </li>
            <li>
              {t.ruleLists.howStep3}: <code>TYPE,value,ACTION</code>
            </li>
          </ol>
          <p className="rule-lists-examples">
            {t.ruleLists.examples}
            <br />
            <code>DOMAIN-SUFFIX,youtube.com,VPN</code>
            <br />
            <code>DOMAIN-KEYWORD,telegram,VPN</code>
            <br />
            <code>PROCESS-NAME,chrome.exe,DIRECT</code>
          </p>
          <p className="hint">
            {t.ruleLists.actionHint}
            {folderPath ? (
              <>
                {' '}
                {t.ruleLists.currentFolder} <code className="rule-lists-path">{folderPath}</code>
              </>
            ) : null}
          </p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}

        <div className="rule-lists-actions">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => void handleOpenFolder()}
            disabled={busy !== null}
            title={t.ruleLists.openFolder}
          >
            <FolderIcon size={14} />
            {t.ruleLists.folder}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setShowDownload((v) => !v)}
            disabled={busy !== null}
          >
            <LinkIcon size={14} />
            {t.ruleLists.byUrl}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => void load()}
            disabled={busy !== null || loading}
            title={t.ruleLists.refreshFiles}
          >
            <RefreshIcon size={14} className={loading ? 'spin' : undefined} />
            {t.ruleLists.refresh}
          </button>
        </div>

        {showDownload && (
          <form className="rule-lists-download" onSubmit={handleDownload}>
            <input
              className="input"
              placeholder={t.ruleLists.namePlaceholder}
              value={dlName}
              onChange={(e) => setDlName(e.target.value)}
            />
            <input
              className="input"
              placeholder="https://…/rules.txt"
              value={dlUrl}
              onChange={(e) => setDlUrl(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-sm btn-primary"
              disabled={busy !== null || !dlName.trim() || !dlUrl.trim()}
            >
              {busy === 'download' ? '…' : t.ruleLists.download}
            </button>
          </form>
        )}

        <div className="rule-lists-body">
          {loading && lists.length === 0 ? (
            <div className="empty-state compact">
              <div className="spinner rule-lists-spinner" />
              <span className="hint">{t.ruleLists.loading}</span>
            </div>
          ) : lists.length === 0 ? (
            <div className="empty-state compact">
              <PlusIcon size={22} />
              <p className="empty-state-title">{t.ruleLists.emptyTitle}</p>
              <span className="hint">{t.ruleLists.emptyHint}</span>
            </div>
          ) : (
            lists.map((item) => (
              <div key={item.name} className="rule-list-row">
                <div className="rule-list-meta">
                  <span className="rule-list-name">{item.name}</span>
                  <span className="hint">
                    {t.ruleLists.rulesCount(item.rule_count)}
                    {item.bundled ? t.ruleLists.bundled : ''}
                  </span>
                </div>
                <div className="rule-list-btns">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={busy !== null}
                    onClick={() => void handleApply(item.name, false)}
                  >
                    {busy === `${item.name}:merge` ? '…' : t.ruleLists.add}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={busy !== null}
                    onClick={() => void handleApply(item.name, true)}
                    title={t.ruleLists.replaceTitle}
                  >
                    {busy === `${item.name}:replace` ? '…' : t.ruleLists.replace}
                  </button>
                  {!item.bundled && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      disabled={busy !== null}
                      onClick={() => void handleDelete(item.name)}
                      title={t.ruleLists.deleteFileTitle}
                    >
                      <TrashIcon size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
