import type { ViewId } from '../App';
import type { ConnectionPhase } from '../api/types';
import { useI18n } from '../i18n/LocaleContext';
import { PowerIcon } from './icons';
import { ConnectErrorAlert } from './ConnectErrorAlert';
import { SidebarUpdateBanner } from './SidebarUpdateBanner';
import type { ConnectFailure } from '../utils/connectError';
import { isVpnBusyPhase, isVpnOnPhase } from '../utils/connectionPhase';
import type { UpdateStatusPayload } from '../types/global';
import brandIcon from '../assets/brand-icon.png';
import navHome from '../assets/nav/home.svg';
import navServers from '../assets/nav/servers.svg';
import navRouting from '../assets/nav/routing.svg';
import navImport from '../assets/nav/import.svg';
import navSettings from '../assets/nav/settings.svg';
import navLogs from '../assets/nav/logs.svg';

interface LayoutProps {
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
  connectionPhase: ConnectionPhase;
  coreRunning: boolean;
  coreBusy: boolean;
  canCancelStart?: boolean;
  onToggleCore: () => Promise<void>;
  error?: string | null;
  connectError?: ConnectFailure | null;
  updateStatus?: UpdateStatusPayload;
  onOpenUpdateSettings?: () => void;
  onDownloadUpdate?: () => void;
  onInstallUpdate?: () => void;
  children: React.ReactNode;
}

function statusDotClass(phase: ConnectionPhase): string {
  if (phase === 'connecting' || phase === 'reconnecting') return 'status-dot busy';
  if (phase === 'no_link') return 'status-dot warn';
  if (phase === 'connected') return 'status-dot on';
  return 'status-dot off';
}

function sidebarVpnPillClass(phase: ConnectionPhase): string {
  if (phase === 'connecting' || phase === 'reconnecting') return 'sidebar-vpn-pill busy';
  if (phase === 'no_link') return 'sidebar-vpn-pill warn';
  if (phase === 'connected') return 'sidebar-vpn-pill on';
  return 'sidebar-vpn-pill off';
}

export function Layout({
  activeView,
  onViewChange,
  connectionPhase,
  coreRunning,
  coreBusy,
  canCancelStart = false,
  onToggleCore,
  error,
  connectError,
  updateStatus,
  onOpenUpdateSettings,
  onDownloadUpdate,
  onInstallUpdate,
  children,
}: LayoutProps) {
  const { t } = useI18n();
  const busyPhase = isVpnBusyPhase(connectionPhase);
  const vpnOn = isVpnOnPhase(connectionPhase);
  const isConnected = connectionPhase === 'connected';
  // Core down but session still desired — power button retries connect, not disconnect.
  const needsRetry = !coreRunning && (connectionPhase === 'no_link' || connectionPhase === 'reconnecting');
  // Allow cancel during connect; otherwise block while another toggle is in flight.
  const powerDisabled = coreBusy && !canCancelStart;

  const phaseTitle = canCancelStart
    ? t.layout.cancelConnect
    : connectionPhase === 'reconnecting'
      ? t.layout.reconnecting
      : connectionPhase === 'connecting'
        ? t.layout.connecting
        : connectionPhase === 'no_link'
          ? t.layout.noLink
          : connectionPhase === 'connected'
            ? t.layout.connected
            : t.layout.disconnected;

  const phasePill =
    connectionPhase === 'reconnecting'
      ? t.layout.reconnecting
      : connectionPhase === 'connecting'
        ? t.layout.connecting
        : connectionPhase === 'no_link'
          ? t.layout.noLink
          : connectionPhase === 'connected'
            ? t.layout.vpnOn
            : t.layout.vpnOff;

  const phaseSub =
    connectionPhase === 'no_link'
      ? t.layout.noLinkHint
      : connectionPhase === 'reconnecting'
        ? t.layout.reconnecting
        : connectionPhase === 'connecting'
          ? t.layout.connecting
          : connectionPhase === 'connected'
            ? t.layout.clickDisconnect
            : t.layout.clickConnect;

  const powerTitle = canCancelStart
    ? t.layout.cancelConnect
    : needsRetry
      ? t.layout.connectVpn
      : isConnected || (vpnOn && coreRunning)
        ? t.layout.disconnectVpn
        : t.layout.connectVpn;

  const navItems: Array<{ id: ViewId; label: string; title: string; icon: string }> = [
    { id: 'home', label: t.nav.home, title: t.nav.home, icon: navHome },
    { id: 'nodes', label: t.nav.nodes, title: t.nav.nodes, icon: navServers },
    { id: 'routing', label: t.nav.routing, title: t.nav.routing, icon: navRouting },
    { id: 'import', label: t.nav.import, title: t.nav.import, icon: navImport },
    { id: 'logs', label: t.nav.logs, title: t.nav.logs, icon: navLogs },
    { id: 'settings', label: t.nav.settings, title: t.nav.settings, icon: navSettings },
  ];

  const activeItem = navItems.find((item) => item.id === activeView) ?? navItems[0];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo brand-logo-image">
            <img src={brandIcon} alt="" width={38} height={38} draggable={false} />
          </span>
          <span className="brand-copy">
            <span className="brand-name">PawLink</span>
          </span>
        </div>

        <nav className="nav" aria-label={t.nav.aria}>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? 'active' : ''}`}
              onClick={() => onViewChange(item.id)}
              title={item.label}
            >
              <span className="nav-icon nav-icon-asset">
                <img src={item.icon} alt="" width={28} height={28} draggable={false} />
                {item.id === 'settings' &&
                  (updateStatus?.phase === 'available' || updateStatus?.phase === 'downloaded') && (
                  <span className="nav-update-dot" aria-hidden="true" />
                )}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-update-slot">
          {updateStatus && onOpenUpdateSettings && onDownloadUpdate && onInstallUpdate && (
            <SidebarUpdateBanner
              status={updateStatus}
              onOpenSettings={onOpenUpdateSettings}
              onDownload={onDownloadUpdate}
              onInstall={onInstallUpdate}
            />
          )}
        </div>

        <div className="sidebar-footer">
          <div className={sidebarVpnPillClass(connectionPhase)}>
            <span className={statusDotClass(connectionPhase)} />
            <span className="sidebar-vpn-pill-text">{phasePill}</span>
          </div>
          <button
            className={`core-status ${isConnected ? 'running' : ''} ${busyPhase ? 'connecting' : ''} ${connectionPhase === 'no_link' ? 'no-link' : ''}`}
            onClick={onToggleCore}
            disabled={powerDisabled}
            title={powerTitle}
            data-tour="connect-button"
          >
            <span className="core-status-icon">
              <PowerIcon size={17} />
            </span>
            <span className="core-status-text">
              <span className="core-status-title">
                {coreBusy && !busyPhase ? t.layout.wait : phaseTitle}
              </span>
              <span className="core-status-sub">{phaseSub}</span>
            </span>
          </button>
        </div>
      </aside>

      <section className="app-stage">
        <header className="app-topbar">
          <div>
            <span className="topbar-eyebrow">PAWLINK</span>
            <h1>{activeItem.title}</h1>
          </div>
        </header>

        <main className="content">
          {connectError ? (
            <ConnectErrorAlert failure={connectError} />
          ) : (
            error && <div className="alert alert-error global-alert">{error}</div>
          )}
          {children}
        </main>
      </section>
    </div>
  );
}
