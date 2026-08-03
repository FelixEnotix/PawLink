import { useState, useEffect, useRef, useCallback } from 'react';
import { useBackendState } from './api/useBackend';
import { Layout } from './components/Layout';
import { HomeView } from './views/HomeView';
import { NodesView } from './views/NodesView';
import { RoutingView } from './views/RoutingView';
import { ImportView } from './views/ImportView';
import { SettingsView } from './views/SettingsView';
import { LogsView } from './views/LogsView';
import { SetupWelcome } from './components/setup/SetupWelcome';
import { SetupTour } from './components/setup/SetupTour';
import { useI18n } from './i18n/LocaleContext';
import brandIcon from './assets/brand-icon.png';
import { isVpnStartBlocked } from './utils/vpnPolicy';
import { resolveConnectionPhase } from './utils/connectionPhase';
import { useAppUpdater } from './hooks/useAppUpdater';
import {
  ConnectError,
  formatConnectFailure,
  notifyConnectFailure,
  toConnectFailure,
  type ConnectFailure,
} from './utils/connectError';

export type ViewId = 'home' | 'nodes' | 'routing' | 'import' | 'logs' | 'settings';

export default function App() {
  const { t } = useI18n();
  const backend = useBackendState();
  const updater = useAppUpdater();
  const [view, setView] = useState<ViewId>('home');
  const [settingsScrollTarget, setSettingsScrollTarget] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [restartingAdmin, setRestartingAdmin] = useState(false);
  const [coreBusy, setCoreBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<ConnectFailure | null>(null);
  const lastAutoConnectErrorAt = useRef<number | null>(null);
  const [setupPhase, setSetupPhase] = useState<'loading' | 'welcome' | 'tour' | 'done'>('loading');

  const markSetupDone = useCallback(async () => {
    setSetupPhase('done');
    try {
      if (window.pawlink?.setPreferences) {
        await window.pawlink.setPreferences({ setupWizardCompleted: true });
      }
    } catch {
      // ignore — UI already closed
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      if (!window.pawlink?.getPreferences) {
        if (!cancelled) setSetupPhase('done');
        return;
      }
      try {
        const prefs = await window.pawlink.getPreferences();
        if (cancelled) return;
        setSetupPhase(prefs.setupWizardCompleted ? 'done' : 'welcome');
      } catch {
        if (!cancelled) setSetupPhase('done');
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSettingsScroll = useCallback((section: string) => {
    setSettingsScrollTarget(section);
    setView('settings');
  }, []);

  useEffect(() => {
    const err = backend.state?.last_connect_error;
    if (!err || backend.state?.core_running || coreBusy) return;
    const at = typeof err.at === 'number' ? err.at : null;
    if (at !== null && at === lastAutoConnectErrorAt.current) return;
    if (at !== null) lastAutoConnectErrorAt.current = at;
    setConnectError(err);
    setActionError(formatConnectFailure(t, err));
    notifyConnectFailure(t, err);
  }, [backend.state?.last_connect_error, backend.state?.core_running, coreBusy, t]);

  const retryBackend = async () => {
    setRestarting(true);
    setActionError(null);
    try {
      if (window.pawlink) {
        await window.pawlink.restartBackend();
      }
      await backend.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t.app.restartBackendFailed);
    } finally {
      setRestarting(false);
    }
  };

  const restartAsAdmin = async () => {
    if (!window.pawlink?.restartAsAdmin) {
      setActionError(t.app.restartAdminOnly);
      return;
    }
    setRestartingAdmin(true);
    setActionError(null);
    try {
      await window.pawlink.restartAsAdmin();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t.app.restartAdminFailed);
      setRestartingAdmin(false);
    }
  };

  const connectionPhase = resolveConnectionPhase(
    backend.state?.connection_phase,
    Boolean(backend.state?.core_running),
    Boolean(backend.state?.core_starting),
  );
  // Busy spinner for first connect / recovery; no_link stays clickable.
  const coreConnecting = coreBusy || connectionPhase === 'connecting';
  const canCancelStart =
    !backend.state?.core_running &&
    (connectionPhase === 'connecting' || Boolean(backend.state?.core_starting));

  const toggleCore = async () => {
    setActionError(null);
    setConnectError(null);

    // Impatient cancel: stop must preempt an in-flight start (tray/UI spam-safe).
    if (canCancelStart) {
      try {
        await backend.stopCore();
        void window.pawlink?.refreshTray();
      } catch (err) {
        const failure =
          err instanceof ConnectError
            ? err.detail
            : toConnectFailure(err) ??
              ({ stage: 'unknown', message: t.app.coreToggleFailed } as ConnectFailure);
        setConnectError(failure);
        setActionError(formatConnectFailure(t, failure));
      }
      return;
    }

    if (coreBusy) return;
    setCoreBusy(true);
    try {
      const phase = resolveConnectionPhase(
        backend.state?.connection_phase,
        Boolean(backend.state?.core_running),
        Boolean(backend.state?.core_starting),
      );
      const needsRetry =
        !backend.state?.core_running && (phase === 'no_link' || phase === 'reconnecting');
      if (backend.state?.core_running && !needsRetry) {
        await backend.stopCore();
      } else {
        if (!backend.state?.profiles.length) {
          throw new Error(t.app.noNodes);
        }
        const routingMode = backend.state?.routing_mode ?? 'rule';
        if (isVpnStartBlocked(routingMode, backend.systemStatus)) {
          throw new Error(t.app.rulesModeNeedsAdmin);
        }
        await backend.startCore();
      }
      void window.pawlink?.refreshTray();
    } catch (err) {
      const failure =
        err instanceof ConnectError
          ? err.detail
          : toConnectFailure(err) ??
            ({ stage: 'unknown', message: t.app.coreToggleFailed } as ConnectFailure);
      setConnectError(failure);
      setActionError(formatConnectFailure(t, failure));
      if (!(err instanceof ConnectError)) {
        notifyConnectFailure(t, failure);
      }
      throw err;
    } finally {
      setCoreBusy(false);
    }
  };

  if (backend.loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-logo brand-logo-image">
          <img src={brandIcon} alt="" width={48} height={48} draggable={false} />
        </div>
        <div className="spinner" />
        <p>{t.app.starting}</p>
      </div>
    );
  }

  if (backend.error && !backend.state) {
    return (
      <div className="app-error">
        <h2>{t.app.startFailed}</h2>
        <p>{actionError ?? backend.error}</p>
        <button className="btn btn-primary" onClick={() => void retryBackend()} disabled={restarting}>
          {restarting ? t.app.startingBusy : t.app.retry}
        </button>
        <div className="app-error-logs">
          <LogsView />
        </div>
      </div>
    );
  }

  return (
    <>
    <Layout
      activeView={view}
      onViewChange={setView}
      connectionPhase={coreBusy && connectionPhase === 'disconnected' ? 'connecting' : connectionPhase}
      coreRunning={backend.state?.core_running ?? false}
      coreBusy={coreBusy}
      canCancelStart={canCancelStart}
      onToggleCore={toggleCore}
      error={actionError ?? backend.error}
      connectError={connectError}
      updateStatus={updater.status}
      onOpenUpdateSettings={() => {
        setSettingsScrollTarget('updates');
        setView('settings');
      }}
      onDownloadUpdate={() => void updater.downloadUpdate()}
      onInstallUpdate={() => void updater.installUpdate()}
    >
      {view === 'home' && (
        <HomeView
          backend={backend}
          coreBusy={coreBusy}
          coreConnecting={coreConnecting}
          onToggleCore={toggleCore}
          onNavigate={setView}
          onOpenSettingsSection={(section) => {
            setSettingsScrollTarget(section);
            setView('settings');
          }}
          onRestartAsAdmin={restartAsAdmin}
          restartingAdmin={restartingAdmin}
        />
      )}
      {view === 'nodes' && <NodesView backend={backend} />}
      {view === 'routing' && <RoutingView backend={backend} />}
      {view === 'import' && <ImportView backend={backend} />}
      {view === 'logs' && <LogsView />}
      {view === 'settings' && (
        <SettingsView
          backend={backend}
          scrollTarget={settingsScrollTarget}
          onScrollTargetHandled={() => setSettingsScrollTarget(null)}
          updateStatus={updater.status}
          onCheckForUpdates={updater.checkForUpdates}
          onDownloadUpdate={updater.downloadUpdate}
          onInstallUpdate={updater.installUpdate}
          onOpenUpdateFolder={updater.openUpdateFolder}
          onStartSetupGuide={() => setSetupPhase('tour')}
        />
      )}
    </Layout>
      {setupPhase === 'welcome' && (
        <SetupWelcome
          onHelp={() => setSetupPhase('tour')}
          onSkip={() => void markSetupDone()}
        />
      )}
      <SetupTour
        active={setupPhase === 'tour'}
        onNavigate={setView}
        onSettingsScroll={onSettingsScroll}
        onFinish={() => void markSetupDone()}
      />
    </>
  );
}
