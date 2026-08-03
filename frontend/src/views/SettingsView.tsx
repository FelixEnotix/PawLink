import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { useBackendState } from '../api/useBackend';
import { useI18n } from '../i18n/LocaleContext';
import type { Locale } from '../i18n/messages';
import { AutoSelectSettingsPanel } from '../components/AutoSelectSettingsPanel';
import { HelpTip } from '../components/HelpTip';
import { ResetConfirmModal, type ResetMode } from '../components/setup/ResetConfirmModal';
import {
  DEFAULT_AUTO_SELECT,
  focusSettingsByTarget,
  SETTINGS_SCROLL_KEY,
} from '../utils/autoSelect';
import type { AutoSelectSettings, BackupExport, BlockedServer } from '../api/types';
import type {
  AppPreferences,
  AutostartInfrastructureStatus,
  UpdateCheckIntervalHours,
  UpdateStatusPayload,
} from '../types/global';

const UPDATE_INTERVAL_OPTIONS: UpdateCheckIntervalHours[] = [6, 12, 24, 48, 168];

interface SettingsViewProps {
  backend: ReturnType<typeof useBackendState>;
  scrollTarget?: string | null;
  onScrollTargetHandled?: () => void;
  updateStatus?: UpdateStatusPayload;
  onCheckForUpdates?: () => Promise<UpdateStatusPayload>;
  onDownloadUpdate?: () => Promise<UpdateStatusPayload>;
  onInstallUpdate?: () => Promise<void>;
  onOpenUpdateFolder?: () => Promise<void>;
  onStartSetupGuide?: () => void;
}

interface SettingRowProps {
  title: string;
  description: string;
  help?: string;
  helpLabel?: string;
  checked: boolean;
  disabled?: boolean;
  tourId?: string;
  onChange: (value: boolean) => void;
}

function SettingRow({
  title,
  description,
  help,
  helpLabel,
  checked,
  disabled,
  tourId,
  onChange,
}: SettingRowProps) {
  return (
    <div className={`setting-row ${disabled ? 'disabled' : ''}`} data-tour={tourId}>
      <span className="setting-row-copy">
        <strong>
          {title}
          {help ? <HelpTip text={help} label={helpLabel} /> : null}
        </strong>
        <span>{description}</span>
      </span>
      <label className="setting-switch">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="setting-switch-track" aria-hidden="true" />
      </label>
    </div>
  );
}

const DEFAULT_PREFS: AppPreferences = {
  autostart: false,
  minimizeToTray: false,
  startMinimized: false,
  closeToTray: false,
  language: 'ru',
  autoUpdate: true,
  updateCheckIntervalHours: 24,
  autoRefreshSubscriptions: false,
  subscriptionRefreshIntervalHours: 24,
  setupWizardCompleted: true,
};

function downloadBlob(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pickBackupFileBrowser(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsText(file, 'utf-8');
    };
    input.click();
  });
}

export function SettingsView({
  backend,
  scrollTarget,
  onScrollTargetHandled,
  updateStatus,
  onCheckForUpdates,
  onDownloadUpdate,
  onInstallUpdate,
  onOpenUpdateFolder,
  onStartSetupGuide,
}: SettingsViewProps) {
  const { t, locale, setLocale } = useI18n();
  const { state, updateSettings, refresh, setBlockedServers, setAutoSelectEnabled } = backend;
  const [prefs, setPrefs] = useState<AppPreferences>(DEFAULT_PREFS);
  const [prefsReady, setPrefsReady] = useState(!window.pawlink);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [importWithRules, setImportWithRules] = useState(true);
  const [importWithServers, setImportWithServers] = useState(true);
  const [importWithSettings, setImportWithSettings] = useState(true);
  const [autostartInfra, setAutostartInfra] = useState<AutostartInfrastructureStatus | null>(null);
  const [resetMode, setResetMode] = useState<ResetMode | null>(null);
  const isDesktop = Boolean(window.pawlink);

  const refreshAutostartInfra = async () => {
    if (!window.pawlink?.getAutostartInfra) {
      setAutostartInfra(null);
      return;
    }
    try {
      setAutostartInfra(await window.pawlink.getAutostartInfra());
    } catch {
      setAutostartInfra(null);
    }
  };

  useEffect(() => {
    if (!window.pawlink?.getPreferences) {
      setPrefsReady(true);
      return;
    }
    window.pawlink
      .getPreferences()
      .then(setPrefs)
      .catch(() => setPrefs(DEFAULT_PREFS))
      .finally(() => setPrefsReady(true));
    void refreshAutostartInfra();
  }, []);

  const patchPref = async <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => {
    if (!window.pawlink?.setPreferences) return;
    setBusyKey(String(key));
    setError(null);
    try {
      const next = await window.pawlink.setPreferences({ [key]: value });
      setPrefs(next);
      if (key === 'autostart') {
        await refreshAutostartInfra();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.settings.saveFailed);
    } finally {
      setBusyKey(null);
    }
  };

  const handleLanguage = async (next: Locale) => {
    if (next === locale) return;
    setBusyKey('language');
    setError(null);
    try {
      await setLocale(next);
      setPrefs((prev) => ({ ...prev, language: next }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.settings.saveFailed);
    } finally {
      setBusyKey(null);
    }
  };

  useEffect(() => {
    if (!prefsReady) return;

    let target = scrollTarget ?? null;
    if (!target) {
      try {
        target = sessionStorage.getItem(SETTINGS_SCROLL_KEY);
        if (target) sessionStorage.removeItem(SETTINGS_SCROLL_KEY);
      } catch {
        target = null;
      }
    }
    if (
      target !== 'auto-select' &&
      target !== 'updates' &&
      target !== 'app' &&
      target !== 'vpn' &&
      target !== 'setup' &&
      target !== 'reset'
    ) {
      return;
    }

    let attempts = 0;
    let timer: number | undefined;

    const tryFocus = () => {
      const focused = focusSettingsByTarget(target!);
      if (focused) {
        onScrollTargetHandled?.();
        return;
      }
      attempts += 1;
      if (attempts < 12) {
        timer = window.setTimeout(tryFocus, 50);
      } else {
        onScrollTargetHandled?.();
      }
    };

    timer = window.setTimeout(tryFocus, 0);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [prefsReady, scrollTarget, onScrollTargetHandled]);

  const patchAutoSelectEnabled = async (enabled: boolean) => {
    setBusyKey('auto_select_enabled');
    setError(null);
    try {
      await setAutoSelectEnabled(enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.settings.saveFailed);
    } finally {
      setBusyKey(null);
    }
  };

  const patchBlockedServers = async (blocked: BlockedServer[]) => {
    setBusyKey('blocked_servers');
    setError(null);
    try {
      await setBlockedServers(blocked);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.settings.saveFailed);
    } finally {
      setBusyKey(null);
    }
  };

  const patchAutoSelect = async (patch: Partial<AutoSelectSettings>) => {
    setBusyKey('auto_select');
    setError(null);
    try {
      await updateSettings({ auto_select: patch });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.settings.saveFailed);
    } finally {
      setBusyKey(null);
    }
  };

  const patchVpn = async (key: 'connect_on_startup' | 'kill_switch_enabled', value: boolean) => {
    setBusyKey(key);
    setError(null);
    try {
      await updateSettings({ [key]: value });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.settings.saveFailed);
    } finally {
      setBusyKey(null);
    }
  };

  const handleCheckUpdates = async () => {
    if (!onCheckForUpdates) return;
    setBusyKey('updates_check');
    setError(null);
    try {
      await onCheckForUpdates();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.settings.updatesFailed);
    } finally {
      setBusyKey(null);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!onDownloadUpdate) return;
    setBusyKey('updates_download');
    setError(null);
    try {
      await onDownloadUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.settings.updatesFailed);
    } finally {
      setBusyKey(null);
    }
  };

  const handleInstallUpdate = async () => {
    if (!onInstallUpdate) return;
    await onInstallUpdate();
  };

  const applyDefaultPreferences = async () => {
    if (!window.pawlink?.setPreferences) return prefs;
    const next = await window.pawlink.setPreferences({
      ...DEFAULT_PREFS,
      language: prefs.language,
      setupWizardCompleted: true,
    });
    setPrefs(next);
    return next;
  };

  const handleConfirmReset = async () => {
    if (!resetMode) return;
    setBusyKey('reset');
    setError(null);
    setInfo(null);
    try {
      const wipe = resetMode === 'factory';
      await api.factoryReset(wipe);
      await applyDefaultPreferences();
      await refresh();
      await refreshAutostartInfra();
      setInfo(wipe ? t.settings.resetFactoryDone : t.settings.resetSettingsDone);
      setResetMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.settings.resetFailed);
    } finally {
      setBusyKey(null);
    }
  };

  const GITHUB_URL = 'https://github.com/FelixEnotix/PawLink';

  const openGithub = async () => {
    try {
      if (window.pawlink?.openExternal) {
        const ok = await window.pawlink.openExternal(GITHUB_URL);
        if (ok) return;
      }
      window.open(GITHUB_URL, '_blank', 'noopener,noreferrer');
    } catch {
      window.open(GITHUB_URL, '_blank', 'noopener,noreferrer');
    }
  };

  const handleExport = async () => {
    setBusyKey('export');
    setError(null);
    setInfo(null);
    try {
      const backup = await api.exportBackup();
      const enriched: BackupExport = { ...backup };
      if (window.pawlink?.getPreferences) {
        enriched.app_preferences = await window.pawlink.getPreferences();
      }
      const content = JSON.stringify(enriched, null, 2);
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `pawlink-backup-${stamp}.json`;
      if (window.pawlink?.saveTextFile) {
        const path = await window.pawlink.saveTextFile(filename, content);
        if (path) setInfo(t.settings.exportSaved(path));
      } else {
        downloadBlob(filename, content);
        setInfo(t.settings.exportDownloaded);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.settings.exportFailed);
    } finally {
      setBusyKey(null);
    }
  };

  const handleImport = async () => {
    if (!importWithRules && !importWithServers && !importWithSettings) {
      setError(t.settings.importNeedOne);
      return;
    }
    setBusyKey('import');
    setError(null);
    setInfo(null);
    try {
      let raw: string | null = null;
      if (window.pawlink?.pickConfigFile) {
        const picked = await window.pawlink.pickConfigFile();
        raw = picked?.raw ?? null;
      } else {
        raw = await pickBackupFileBrowser();
      }
      if (!raw) return;

      let parsed: BackupExport | null = null;
      try {
        parsed = JSON.parse(raw) as BackupExport;
      } catch {
        parsed = null;
      }

      const result = await api.importBackup({
        raw,
        with_rules: importWithRules,
        with_servers: importWithServers,
        with_settings: importWithSettings,
      });

      if (
        importWithSettings &&
        parsed?.app_preferences &&
        window.pawlink?.setPreferences
      ) {
        const next = await window.pawlink.setPreferences(parsed.app_preferences);
        setPrefs(next);
        if (next.language !== locale) {
          await setLocale(next.language);
        }
      }

      await refresh();
      void window.pawlink?.refreshTray();
      const parts: string[] = [];
      if (result.with_servers) parts.push(t.settings.serversPart(result.servers));
      if (result.with_rules) {
        parts.push(t.settings.rulesPart(result.rules));
        parts.push(t.settings.appsPart(result.tunnels));
      }
      if (result.with_settings && result.settings) parts.push(t.settings.settingsPart);
      setInfo(t.settings.importDone(parts.join(', ')));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.settings.importFailed);
    } finally {
      setBusyKey(null);
    }
  };

  const quitApp = async () => {
    if (!window.pawlink?.quitApp) return;
    await window.pawlink.quitApp();
  };

  const handleRemoveAutostartInfra = async () => {
    if (!window.pawlink?.removeAutostartInfra) return;
    setBusyKey('removeAutostartInfra');
    setError(null);
    setInfo(null);
    try {
      const result = await window.pawlink.removeAutostartInfra();
      if (result.ok) {
        setInfo(t.settings.autostartInfraRemoved);
        if (window.pawlink.getPreferences) {
          setPrefs(await window.pawlink.getPreferences());
        }
      } else if (result.code === 'nothing_to_remove') {
        setInfo(t.settings.autostartInfraNothingToRemove);
      } else if (result.code === 'unsupported') {
        setError(t.settings.autostartInfraUnsupported);
      } else {
        setError(result.message ?? t.settings.saveFailed);
      }
      await refreshAutostartInfra();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.settings.saveFailed);
    } finally {
      setBusyKey(null);
    }
  };

  const handleRestoreAutostartInfra = async () => {
    if (!window.pawlink?.restoreAutostartInfra) return;
    setBusyKey('restoreAutostartInfra');
    setError(null);
    setInfo(null);
    try {
      const result = await window.pawlink.restoreAutostartInfra();
      if (result.ok) {
        setInfo(t.settings.autostartInfraRestored);
        if (window.pawlink.getPreferences) {
          setPrefs(await window.pawlink.getPreferences());
        }
      } else if (result.code === 'already_exists') {
        setInfo(t.settings.autostartInfraAlreadyExists);
      } else if (result.code === 'unsupported') {
        setError(t.settings.autostartInfraUnsupported);
      } else {
        setError(result.message ?? t.settings.autostartInfraRestoreFailed);
      }
      await refreshAutostartInfra();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.settings.autostartInfraRestoreFailed);
    } finally {
      setBusyKey(null);
    }
  };

  const infraSupported = autostartInfra?.supported ?? false;
  const infraReady = autostartInfra?.ready ?? false;
  const infraHasParts = Boolean(
    autostartInfra?.taskRegistered || autostartInfra?.launcherFilesPresent,
  );
  const canRemoveInfra =
    infraSupported && infraHasParts && busyKey !== 'removeAutostartInfra';
  const canRestoreInfra =
    infraSupported && !infraReady && busyKey !== 'restoreAutostartInfra';

  const infraStatusText = !infraSupported
    ? t.settings.autostartInfraUnsupported
    : infraReady
      ? t.settings.autostartInfraReady
      : infraHasParts
        ? t.settings.autostartInfraPartial
        : t.settings.autostartInfraMissing;

  if (!prefsReady) {
    return (
      <div className="settings-view">
        <div className="settings-loading">
          <div className="spinner" />
          <p>{t.settings.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-view">
      {error && <div className="alert alert-error">{error}</div>}
      {info && <div className="alert alert-success">{info}</div>}

      <section className="settings-section">
        <div className="settings-section-head">
          <h2>{t.settings.language}</h2>
          <p>{t.settings.languageDesc}</p>
        </div>
        <div className="settings-card settings-language-card">
          <div className="settings-language-row" role="group" aria-label={t.settings.language}>
            <button
              type="button"
              className={`settings-lang-btn ${locale === 'ru' ? 'active' : ''}`}
              disabled={busyKey === 'language'}
              onClick={() => void handleLanguage('ru')}
            >
              {t.settings.languageRu}
            </button>
            <button
              type="button"
              className={`settings-lang-btn ${locale === 'en' ? 'active' : ''}`}
              disabled={busyKey === 'language'}
              onClick={() => void handleLanguage('en')}
            >
              {t.settings.languageEn}
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section" id="settings-setup-section">
        <div className="settings-section-head">
          <h2>{t.settings.setupGuideTitle}</h2>
          <p>{t.settings.setupGuideDesc}</p>
        </div>
        <div className="settings-card">
          <div className="settings-backup-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!onStartSetupGuide}
              onClick={() => onStartSetupGuide?.()}
            >
              {t.settings.setupGuideStart}
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section" id="settings-app-section">
        <div className="settings-section-head">
          <h2>{t.settings.app}</h2>
          <p>{t.settings.appDesc}</p>
        </div>
        <div className="settings-card">
          <SettingRow
            title={t.settings.autostart}
            description={t.settings.autostartDesc}
            help={t.settings.helpAutostart}
            helpLabel={t.settings.helpLabel}
            tourId="settings-autostart"
            checked={prefs.autostart}
            disabled={!isDesktop || busyKey === 'autostart'}
            onChange={(v) => void patchPref('autostart', v)}
          />
          <SettingRow
            title={t.settings.closeToTray}
            description={t.settings.closeToTrayDesc}
            help={t.settings.helpCloseToTray}
            helpLabel={t.settings.helpLabel}
            checked={prefs.closeToTray}
            disabled={!isDesktop || busyKey === 'closeToTray'}
            onChange={(v) => void patchPref('closeToTray', v)}
          />
          <SettingRow
            title={t.settings.minimizeToTray}
            description={t.settings.minimizeToTrayDesc}
            help={t.settings.helpMinimizeToTray}
            helpLabel={t.settings.helpLabel}
            checked={prefs.minimizeToTray}
            disabled={!isDesktop || busyKey === 'minimizeToTray'}
            onChange={(v) => void patchPref('minimizeToTray', v)}
          />
          <SettingRow
            title={t.settings.startMinimized}
            description={t.settings.startMinimizedDesc}
            help={t.settings.helpStartMinimized}
            helpLabel={t.settings.helpLabel}
            checked={prefs.startMinimized}
            disabled={!isDesktop || busyKey === 'startMinimized'}
            onChange={(v) => void patchPref('startMinimized', v)}
          />
        </div>
        {isDesktop && (
          <div className="settings-card settings-autostart-infra" data-tour="settings-autostart-infra">
            <div className="settings-infra-head">
              <strong>
                {t.settings.autostartInfraTitle}
                <HelpTip text={t.settings.helpAutostartInfra} label={t.settings.helpLabel} />
              </strong>
              <span>{t.settings.autostartInfraDesc}</span>
            </div>
            <p className={`settings-infra-status ${infraReady ? 'ready' : ''}`}>{infraStatusText}</p>
            <div className="settings-backup-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!canRemoveInfra}
                title={
                  !infraHasParts && infraSupported
                    ? t.settings.autostartInfraNothingToRemove
                    : undefined
                }
                onClick={() => void handleRemoveAutostartInfra()}
              >
                {busyKey === 'removeAutostartInfra'
                  ? t.settings.removingAutostartInfra
                  : t.settings.removeAutostartInfra}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canRestoreInfra}
                title={infraReady ? t.settings.autostartInfraAlreadyExists : undefined}
                onClick={() => void handleRestoreAutostartInfra()}
              >
                {busyKey === 'restoreAutostartInfra'
                  ? t.settings.restoringAutostartInfra
                  : t.settings.restoreAutostartInfra}
              </button>
            </div>
          </div>
        )}
        {!isDesktop && <p className="settings-hint">{t.settings.desktopOnly}</p>}
      </section>

      <section className="settings-section" id="settings-updates-section" data-tour="settings-updates">
        <div className="settings-section-head">
          <h2>
            {t.settings.updatesTitle}
            <HelpTip text={t.settings.helpUpdatesAutoCheck} label={t.settings.helpLabel} />
          </h2>
          <p>{t.settings.updatesDesc}</p>
        </div>
        <div className="settings-card settings-updates-card">
          <p className="settings-updates-version">
            {t.settings.updatesCurrentVersion(updateStatus?.currentVersion ?? '…')}
          </p>
          {!isDesktop && <p className="settings-hint">{t.settings.updatesDevHint}</p>}
          {isDesktop && (
            <>
              <SettingRow
                title={t.settings.updatesAutoCheck}
                description={t.settings.updatesAutoCheckDesc}
                help={t.settings.helpUpdatesAutoCheck}
                helpLabel={t.settings.helpLabel}
                checked={prefs.autoUpdate}
                disabled={busyKey === 'autoUpdate'}
                onChange={(v) => void patchPref('autoUpdate', v)}
              />
              {prefs.autoUpdate && (
                <label className="settings-pref-select-row">
                  <span className="settings-pref-select-copy">
                    <strong>{t.settings.updatesInterval}</strong>
                    <span>{t.settings.updatesIntervalDesc}</span>
                  </span>
                  <select
                    className="settings-pref-select"
                    value={prefs.updateCheckIntervalHours}
                    disabled={busyKey === 'updateCheckIntervalHours'}
                    onChange={(e) =>
                      void patchPref(
                        'updateCheckIntervalHours',
                        Number(e.target.value) as UpdateCheckIntervalHours,
                      )
                    }
                  >
                    {UPDATE_INTERVAL_OPTIONS.map((hours) => (
                      <option key={hours} value={hours}>
                        {t.settings.updatesIntervalOption(hours)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="settings-updates-status">
                {busyKey === 'updates_check' && t.settings.updatesChecking}
                {busyKey !== 'updates_check' && updateStatus?.phase === 'not-available' && t.settings.updatesUpToDate}
                {busyKey !== 'updates_check' &&
                  updateStatus?.phase === 'available' &&
                  t.settings.updatesAvailable(updateStatus.availableVersion ?? '')}
                {updateStatus?.phase === 'downloading' &&
                  `${t.settings.updatesDownloading} ${Math.round(updateStatus.progress ?? 0)}%`}
                {busyKey !== 'updates_check' &&
                  updateStatus?.phase === 'downloaded' &&
                  t.settings.updatesReady(updateStatus.availableVersion ?? '')}
                {updateStatus?.phase === 'installing' && t.settings.updatesInstalling}
                {busyKey !== 'updates_check' &&
                  updateStatus?.phase === 'error' &&
                  (updateStatus.error ?? t.settings.updatesFailed)}
              </p>
              <div className="settings-backup-actions settings-app-update-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={
                    !onCheckForUpdates ||
                    busyKey === 'updates_check' ||
                    updateStatus?.phase === 'downloading' ||
                    updateStatus?.phase === 'installing'
                  }
                  onClick={() => void handleCheckUpdates()}
                >
                  {busyKey === 'updates_check' ? t.settings.updatesChecking : t.settings.updatesCheckNow}
                </button>
                {updateStatus?.phase === 'available' && onDownloadUpdate && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busyKey === 'updates_download'}
                    onClick={() => void handleDownloadUpdate()}
                  >
                    {t.settings.updatesDownload}
                  </button>
                )}
                {updateStatus?.phase === 'downloaded' && onInstallUpdate && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void handleInstallUpdate()}
                  >
                    {t.settings.updatesInstall}
                  </button>
                )}
                {(updateStatus?.phase === 'downloaded' ||
                  updateStatus?.phase === 'error' ||
                  updateStatus?.phase === 'installing') &&
                  onOpenUpdateFolder && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void onOpenUpdateFolder()}
                    >
                      {t.settings.updatesOpenFolder}
                    </button>
                  )}
              </div>
              <div className="settings-updates-divider" aria-hidden />
              <SettingRow
                title={t.settings.subsAutoRefresh}
                description={t.settings.subsAutoRefreshDesc}
                help={t.settings.helpSubsAutoRefresh}
                helpLabel={t.settings.helpLabel}
                checked={prefs.autoRefreshSubscriptions}
                disabled={busyKey === 'autoRefreshSubscriptions'}
                onChange={(v) => void patchPref('autoRefreshSubscriptions', v)}
              />
              {prefs.autoRefreshSubscriptions && (
                <label className="settings-pref-select-row">
                  <span className="settings-pref-select-copy">
                    <strong>{t.settings.subsRefreshInterval}</strong>
                    <span>{t.settings.subsRefreshIntervalDesc}</span>
                  </span>
                  <select
                    className="settings-pref-select"
                    value={prefs.subscriptionRefreshIntervalHours}
                    disabled={busyKey === 'subscriptionRefreshIntervalHours'}
                    onChange={(e) =>
                      void patchPref(
                        'subscriptionRefreshIntervalHours',
                        Number(e.target.value) as UpdateCheckIntervalHours,
                      )
                    }
                  >
                    {UPDATE_INTERVAL_OPTIONS.map((hours) => (
                      <option key={hours} value={hours}>
                        {t.settings.updatesIntervalOption(hours)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </div>
      </section>

      <section className="settings-section" id="settings-vpn-section">
        <div className="settings-section-head">
          <h2>{t.settings.vpn}</h2>
          <p>{t.settings.vpnDesc}</p>
        </div>
        <div className="settings-card">
          <SettingRow
            title={t.settings.connectOnStartup}
            description={t.settings.connectOnStartupDesc}
            help={t.settings.helpConnectOnStartup}
            helpLabel={t.settings.helpLabel}
            tourId="settings-connect-on-startup"
            checked={state?.connect_on_startup ?? false}
            disabled={busyKey === 'connect_on_startup'}
            onChange={(v) => void patchVpn('connect_on_startup', v)}
          />
          <SettingRow
            title={t.settings.killSwitch}
            description={t.settings.killSwitchDesc}
            help={t.settings.helpKillSwitch}
            helpLabel={t.settings.helpLabel}
            tourId="settings-kill-switch"
            checked={state?.kill_switch_enabled ?? true}
            disabled={busyKey === 'kill_switch_enabled'}
            onChange={(v) => void patchVpn('kill_switch_enabled', v)}
          />
        </div>
      </section>

      <section className="settings-section" id="settings-auto-select-section" data-tour="settings-auto-select">
        <div className="settings-section-head">
          <h2>
            {t.settings.autoSelectTitle}
            <HelpTip text={t.settings.helpAutoSelect} label={t.settings.helpLabel} />
          </h2>
          <p>{t.settings.autoSelectDesc}</p>
        </div>
        <div className="settings-card settings-card-auto-select">
          <AutoSelectSettingsPanel
            settings={state?.auto_select}
            autoSelectEnabled={state?.auto_select_enabled ?? false}
            profiles={state?.profiles ?? []}
            blockedServers={state?.blocked_servers ?? []}
            disabled={busyKey === 'auto_select' || busyKey === 'blocked_servers' || busyKey === 'auto_select_enabled'}
            onSave={patchAutoSelect}
            onToggleEnabled={patchAutoSelectEnabled}
            onBlockedChange={patchBlockedServers}
          />
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <h2>
            {t.settings.backup}
            <HelpTip text={t.settings.helpBackup} label={t.settings.helpLabel} />
          </h2>
          <p>{t.settings.backupDesc}</p>
        </div>
        <div className="settings-card">
          <SettingRow
            title={t.settings.importRules}
            description={t.settings.importRulesDesc}
            checked={importWithRules}
            disabled={busyKey === 'export' || busyKey === 'import'}
            onChange={setImportWithRules}
          />
          <SettingRow
            title={t.settings.importServers}
            description={t.settings.importServersDesc}
            checked={importWithServers}
            disabled={busyKey === 'export' || busyKey === 'import'}
            onChange={setImportWithServers}
          />
          <SettingRow
            title={t.settings.importSettings}
            description={t.settings.importSettingsDesc}
            checked={importWithSettings}
            disabled={busyKey === 'export' || busyKey === 'import'}
            onChange={setImportWithSettings}
          />
          <div className="settings-backup-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busyKey === 'export' || busyKey === 'import'}
              onClick={() => void handleExport()}
            >
              {busyKey === 'export' ? t.settings.exporting : t.settings.export}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busyKey === 'export' || busyKey === 'import'}
              onClick={() => void handleImport()}
            >
              {busyKey === 'import' ? t.settings.importing : t.settings.import}
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section" id="settings-reset-section">
        <div className="settings-section-head">
          <h2>{t.settings.resetTitle}</h2>
          <p>{t.settings.resetDesc}</p>
        </div>
        <div className="settings-card">
          <div className="settings-backup-actions settings-reset-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busyKey === 'reset'}
              onClick={() => setResetMode('settings')}
            >
              {t.settings.resetSettingsBtn}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busyKey === 'reset'}
              onClick={() => setResetMode('factory')}
            >
              {t.settings.resetFactoryBtn}
            </button>
          </div>
        </div>
      </section>

      {isDesktop && (
        <section className="settings-section">
          <div className="settings-section-head">
            <h2>{t.settings.quit}</h2>
            <p>{t.settings.quitDesc}</p>
          </div>
          <button type="button" className="btn btn-secondary settings-quit-btn" onClick={() => void quitApp()}>
            {t.settings.quitBtn}
          </button>
        </section>
      )}

      <section className="settings-section" id="settings-about-section">
        <div className="settings-section-head">
          <h2>{t.settings.aboutTitle}</h2>
          <p>{t.settings.aboutDesc}</p>
        </div>
        <div className="settings-card">
          <div className="settings-backup-actions settings-about-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void openGithub()}>
              {t.settings.aboutGithub}
            </button>
            <span className="settings-hint settings-about-hint">{t.settings.aboutGithubHint}</span>
          </div>
        </div>
      </section>

      {resetMode && (
        <ResetConfirmModal
          mode={resetMode}
          busy={busyKey === 'reset'}
          onCancel={() => setResetMode(null)}
          onConfirm={() => void handleConfirmReset()}
          onBackupFirst={() => {
            setResetMode(null);
            void handleExport();
          }}
        />
      )}
    </div>
  );
}
