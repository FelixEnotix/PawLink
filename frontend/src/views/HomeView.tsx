import { useEffect, useRef, useState } from 'react';
import type { useBackendState } from '../api/useBackend';
import type { ViewId } from '../App';
import type { RoutingMode } from '../api/types';
import { RoutingModeSelector } from '../components/RoutingModeSelector';
import { SystemStatusBanner } from '../components/SystemStatusBanner';
import type { EndpointProfile, Subscription } from '../api/types';
import { useI18n } from '../i18n/LocaleContext';
import { getFlag, formatDuration, formatLatency, formatBytes, formatSpeed, stripLeadingFlag } from '../utils/format';
import { resolveAutoSelectSettings } from '../utils/autoSelect';
import { AutoSelectFallbackModal } from '../components/AutoSelectFallbackModal';
import { SmartRouteCard } from '../components/SmartRouteCard';
import type { AutoSelectResult } from '../api/types';
import {
  PowerIcon,
  ClockIcon,
  ChevronRightIcon,
  RefreshIcon,
  ServersIcon,
  ShieldIcon,
  SignalIcon,
} from '../components/icons';
import { resolveConnectionPhase } from '../utils/connectionPhase';

interface HomeViewProps {
  backend: ReturnType<typeof useBackendState>;
  coreBusy: boolean;
  coreConnecting: boolean;
  onToggleCore: () => Promise<void>;
  onNavigate: (view: ViewId) => void;
  onOpenSettingsSection?: (section: string) => void;
  onRestartAsAdmin?: () => void;
  restartingAdmin?: boolean;
}

function resolveActiveSubscriptionName(
  activeProfile: EndpointProfile | null,
  subscriptions: Subscription[],
  trafficName: string | null | undefined,
  noSubscription: string,
): string | null {
  if (trafficName) return trafficName;
  if (!activeProfile) {
    if (subscriptions.length === 1) return subscriptions[0].name;
    return null;
  }
  const source = activeProfile.source;
  if (source?.startsWith('http://') || source?.startsWith('https://')) {
    const matched = subscriptions.find((sub) => sub.url === source);
    if (matched?.name) return matched.name;
    try {
      return new URL(source).hostname;
    } catch {
      return source.slice(0, 48);
    }
  }
  return noSubscription;
}

export function HomeView({
  backend,
  coreBusy,
  coreConnecting,
  onToggleCore,
  onNavigate,
  onOpenSettingsSection,
  onRestartAsAdmin,
  restartingAdmin,
}: HomeViewProps) {
  const { t, locale } = useI18n();
  const { state, health, systemStatus, trafficStats, autoSelect, refreshHealth, setRoutingMode, setAutoSelectEnabled } =
    backend;
  const [elapsed, setElapsed] = useState(0);
  const [autoSelecting, setAutoSelecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modeBusy, setModeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [fallbackPrompt, setFallbackPrompt] = useState<AutoSelectResult | null>(null);

  const coreRunning = state?.core_running ?? false;
  const connectedAt = state?.core_connected_at ?? trafficStats?.core_connected_at ?? null;
  const profiles = state?.profiles ?? [];
  const subscriptions = state?.subscriptions ?? [];
  const routingMode: RoutingMode = state?.routing_mode ?? 'rule';
  const isAdmin = systemStatus?.is_admin ?? true;
  const activeProfile = profiles.find((p) => p.id === state?.active_profile_id) ?? null;
  const activeHealth = activeProfile ? health[activeProfile.id] : undefined;
  const rulesCount = state?.custom_rules.length ?? 0;
  const canConnect = profiles.length > 0 || coreRunning;
  const traffic = trafficStats;
  const trafficSubName =
    traffic?.active_subscription_id && traffic.subscriptions[traffic.active_subscription_id]
      ? traffic.subscriptions[traffic.active_subscription_id].name
      : traffic?.active_subscription_id === '__manual__'
        ? t.home.noSubscription
        : null;
  const activeSubName = resolveActiveSubscriptionName(
    activeProfile,
    subscriptions,
    trafficSubName,
    t.home.noSubscription,
  );

  // Persist session start locally so brief core restarts / poll glitches
  // do not freeze the timer at 00:00 while VPN is still up.
  const sessionStartedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!coreRunning) {
      sessionStartedAtRef.current = null;
      setElapsed(0);
      return;
    }
    if (connectedAt != null) {
      const fromBackend = connectedAt * 1000;
      // Prefer the earliest known start (backend may briefly go null mid-reload).
      if (sessionStartedAtRef.current == null || fromBackend < sessionStartedAtRef.current) {
        sessionStartedAtRef.current = fromBackend;
      }
    } else if (sessionStartedAtRef.current == null) {
      sessionStartedAtRef.current = Date.now();
    }

    const tick = () => {
      const started = sessionStartedAtRef.current;
      if (started == null) {
        setElapsed(0);
        return;
      }
      setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [coreRunning, connectedAt]);

  const handleConnect = async () => {
    if (!canConnect) {
      setError(t.home.needImport);
      onNavigate('import');
      return;
    }
    setError(null);
    try {
      await onToggleCore();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.home.toggleFailed);
    }
  };

  const handleRoutingMode = async (mode: RoutingMode) => {
    if (mode === routingMode) return;
    setModeBusy(true);
    setError(null);
    try {
      await setRoutingMode(mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.home.modeFailed);
    } finally {
      setModeBusy(false);
    }
  };

  const autoSelectSettings = resolveAutoSelectSettings(state?.auto_select);
  const inFallback = state?.auto_select_in_fallback ?? false;
  const autoSelectEnabled = state?.auto_select_enabled ?? false;

  const handleAutoSelect = async (forceFallback = false) => {
    setAutoSelecting(true);
    setError(null);
    setInfo(null);
    try {
      const result = await autoSelect(forceFallback);
      if (result.needs_fallback_prompt && result.fallback_profile_name) {
        setFallbackPrompt(result);
        return;
      }
      if (result.active_profile_id && result.profile_name) {
        setInfo(
          result.matched_criteria
            ? t.home.autoSelectMatched(stripLeadingFlag(result.profile_name))
            : t.home.autoSelectFallbackMatched(stripLeadingFlag(result.profile_name)),
        );
      } else if (result.reason === 'no_available_servers') {
        setError(t.home.autoSelectNoMatch);
      } else if (result.reason === 'no_criteria_match') {
        setError(t.home.autoSelectNoCriteria);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.home.autoSelectFailed);
    } finally {
      setAutoSelecting(false);
    }
  };

  const confirmFallback = async () => {
    setFallbackPrompt(null);
    await handleAutoSelect(true);
  };

  const handleToggleAutoSelect = async (enabled: boolean) => {
    setError(null);
    try {
      await setAutoSelectEnabled(enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.home.autoSelectFailed);
    }
  };

  const openAutoSelectSettings = () => {
    if (onOpenSettingsSection) {
      onOpenSettingsSection('auto-select');
      return;
    }
    onNavigate('settings');
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await refreshHealth();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.home.pingFailed);
    } finally {
      setRefreshing(false);
    }
  };

  const connectionPhase = resolveConnectionPhase(
    state?.connection_phase,
    coreRunning,
    Boolean(state?.core_starting) || (coreConnecting && !coreRunning),
  );
  const needsRetry =
    !coreRunning && (connectionPhase === 'no_link' || connectionPhase === 'reconnecting');
  const canCancelStart =
    !coreRunning && (connectionPhase === 'connecting' || Boolean(state?.core_starting));
  const connectDisabled =
    (coreBusy && !canCancelStart) || (!canConnect && !needsRetry && !canCancelStart);
  const connectLabel = canCancelStart
    ? t.home.cancelConnect
    : connectionPhase === 'connecting'
      ? t.home.connecting
      : connectionPhase === 'reconnecting'
        ? t.home.reconnecting
        : coreBusy
          ? t.home.wait
          : connectionPhase === 'connected' || (coreRunning && connectionPhase !== 'no_link')
            ? t.home.disconnect
            : t.home.connect;
  const toolbarClass =
    connectionPhase === 'connecting' || connectionPhase === 'reconnecting'
      ? 'home-toolbar is-connecting'
      : connectionPhase === 'no_link'
        ? 'home-toolbar is-no-link'
        : connectionPhase === 'connected'
          ? 'home-toolbar is-connected'
          : 'home-toolbar';
  const statusDot =
    connectionPhase === 'connecting' || connectionPhase === 'reconnecting'
      ? 'status-dot busy'
      : connectionPhase === 'no_link'
        ? 'status-dot warn'
        : connectionPhase === 'connected'
          ? 'status-dot on'
          : 'status-dot off';
  const statusTitle =
    connectionPhase === 'reconnecting'
      ? t.home.reconnecting
      : connectionPhase === 'connecting'
        ? t.home.connecting
        : connectionPhase === 'no_link'
          ? t.home.noLink
          : connectionPhase === 'connected'
            ? t.home.connected
            : t.home.disconnected;
  const linkOk = connectionPhase === 'connected';

  return (
    <div className="view home-view">
      <header className={toolbarClass}>
        <div className="home-toolbar-main">
          <span className={statusDot} />
          <div className="home-toolbar-status">
            <strong>{statusTitle}</strong>
            <span className="home-toolbar-meta">
              {connectionPhase === 'connecting' ? (
                <>
                  <span className="home-connect-spinner" aria-hidden />
                  {t.home.connectingHint}
                </>
              ) : connectionPhase === 'reconnecting' ? (
                <>
                  <span className="home-connect-spinner" aria-hidden />
                  {t.home.reconnectingHint}
                </>
              ) : connectionPhase === 'no_link' ? (
                t.home.noLinkHint
              ) : linkOk ? (
                <>
                  <ClockIcon size={13} />
                  {formatDuration(elapsed)}
                  {activeSubName && (
                    <>
                      <span className="home-toolbar-sep">·</span>
                      <span className="home-toolbar-sub" title={activeSubName}>
                        {activeSubName}
                      </span>
                    </>
                  )}
                </>
              ) : activeSubName ? (
                <span className="home-toolbar-sub" title={activeSubName}>
                  {activeSubName}
                </span>
              ) : profiles.length === 0 ? (
                t.home.noServers
              ) : (
                t.home.serversCount(profiles.length)
              )}
            </span>
          </div>
        </div>
        <button
          type="button"
          className={`btn btn-sm home-connect-btn ${linkOk ? 'connected' : ''} ${connectionPhase === 'no_link' ? 'no-link' : ''}`}
          onClick={handleConnect}
          disabled={connectDisabled}
          title={
            canCancelStart
              ? t.home.cancelConnect
              : !canConnect && !needsRetry
                ? t.home.addServerFirst
                : needsRetry
                  ? t.home.connectVpn
                  : linkOk || (coreRunning && connectionPhase !== 'no_link')
                    ? t.home.disconnectVpn
                    : t.home.connectVpn
          }
        >
          <PowerIcon size={16} strokeWidth={2.2} />
          {connectLabel}
        </button>
      </header>

      {profiles.length > 0 && (
        <div className={`home-traffic-panel ${linkOk ? 'is-connected' : ''}`}>
          {coreRunning && traffic && (
            <>
              <div className="home-traffic-speed">
                <span>↓ {formatSpeed(traffic.speed_down)}</span>
                <span>↑ {formatSpeed(traffic.speed_up)}</span>
              </div>
              <div className="home-traffic-grid">
                <div className="home-traffic-item">
                  <span className="home-traffic-label">{t.home.session}</span>
                  <span className="home-traffic-value">
                    ↓ {formatBytes(traffic.session_down)} · ↑ {formatBytes(traffic.session_up)}
                  </span>
                </div>
                {activeSubName && (
                  <div className="home-traffic-item">
                    <span className="home-traffic-label">
                      {activeSubName} · {t.home.total}
                    </span>
                    <span className="home-traffic-value">
                      ↓ {formatBytes(traffic.active_subscription_down)} · ↑{' '}
                      {formatBytes(traffic.active_subscription_up)}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
          <div className="home-traffic-toolbar">
            <div className="home-ping-chip">
              <SignalIcon size={15} />
              <span className="home-ping-value">
                {activeHealth ? formatLatency(activeHealth.latency_ms) : '—'}
              </span>
              <span className="home-ping-label">{t.home.ping}</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm home-ping-refresh"
              onClick={handleRefresh}
              disabled={refreshing}
              title={t.home.refreshPing}
            >
              <RefreshIcon size={15} className={refreshing ? 'spin' : undefined} />
              {refreshing ? t.home.checking : t.home.refresh}
            </button>
          </div>
        </div>
      )}

      <SystemStatusBanner
        status={systemStatus}
        coreRunning={coreRunning}
        connectionPhase={connectionPhase}
        onRestartAsAdmin={onRestartAsAdmin}
        restarting={restartingAdmin}
      />

      {error && <div className="alert alert-error">{error}</div>}
      {info && <div className="alert alert-success">{info}</div>}

      {fallbackPrompt?.fallback_profile_name && (
        <AutoSelectFallbackModal
          serverName={fallbackPrompt.fallback_profile_name}
          onConfirm={() => void confirmFallback()}
          onCancel={() => setFallbackPrompt(null)}
        />
      )}

      <div className="home-control-grid">
        {activeProfile ? (
          <button type="button" className="home-node-card" onClick={() => onNavigate('nodes')}>
            <span className="home-node-flag">{getFlag(activeProfile.name)}</span>
            <span className="home-node-info">
              <span className="home-node-label">{t.home.server}</span>
              <span className="home-node-name">{stripLeadingFlag(activeProfile.name)}</span>
              <span className="home-node-meta">
                {activeProfile.protocol.toUpperCase()}
                {activeHealth?.latency_ms != null && ` · ${formatLatency(activeHealth.latency_ms)}`}
              </span>
            </span>
            <ChevronRightIcon className="home-node-chevron" size={20} />
          </button>
        ) : (
          <button type="button" className="home-node-card empty" onClick={() => onNavigate('import')}>
            <span className="home-node-flag">
              <ServersIcon size={22} />
            </span>
            <span className="home-node-info">
              <span className="home-node-label">{t.home.start}</span>
              <span className="home-node-name">{t.home.addServer}</span>
              <span className="home-node-meta">{t.home.addServerMeta}</span>
            </span>
            <ChevronRightIcon className="home-node-chevron" size={20} />
          </button>
        )}

        <SmartRouteCard
          settings={autoSelectSettings}
          autoSelectEnabled={autoSelectEnabled}
          inFallback={inFallback}
          autoSelecting={autoSelecting}
          profilesCount={profiles.length}
          locale={locale}
          onToggleEnabled={(enabled) => void handleToggleAutoSelect(enabled)}
          onOpenSettings={openAutoSelectSettings}
          onPickOnce={() => void handleAutoSelect()}
        />
      </div>

      <div className="panel routing-panel compact">
        <div className="panel-inline">
          <span className="panel-title compact">
            <ShieldIcon size={14} />
            {t.home.vpnMode}
          </span>
          <RoutingModeSelector
            compact
            value={routingMode}
            isAdmin={isAdmin}
            disabled={modeBusy || coreBusy || coreConnecting}
            onChange={handleRoutingMode}
          />
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon">
            <ServersIcon size={19} />
          </span>
          <span>
            <span className="stat-value">{profiles.length}</span>
            <span className="stat-label">{t.home.servers}</span>
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">
            <ShieldIcon size={19} />
          </span>
          <span>
            <span className="stat-value">{rulesCount}</span>
            <span className="stat-label">{t.home.rules}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
