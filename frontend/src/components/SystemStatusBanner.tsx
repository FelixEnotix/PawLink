import type { ConnectionPhase, SystemStatus } from '../api/types';
import { useI18n } from '../i18n/LocaleContext';
import type { Messages } from '../i18n/messages';

interface SystemStatusBannerProps {
  status: SystemStatus | null;
  coreRunning: boolean;
  connectionPhase?: ConnectionPhase;
  onRestartAsAdmin?: () => void;
  restarting?: boolean;
}

function trafficBadge(
  status: SystemStatus,
  coreRunning: boolean,
  phase: ConnectionPhase | undefined,
  t: Messages['system'],
) {
  if (!coreRunning) {
    return {
      text: t.captureOff,
      tone: 'muted' as const,
      title: t.captureOffTitle,
    };
  }
  const linkBroken = phase === 'no_link' || phase === 'reconnecting' || phase === 'connecting';
  if (status.tun_active && status.system_proxy_active) {
    return {
      text: t.tunProxy(status.mixed_port),
      tone: linkBroken ? ('warn' as const) : ('ok' as const),
      title: linkBroken ? t.captureInactiveTitle : t.tunProxyTitle,
    };
  }
  if (status.tun_active) {
    return {
      text: t.tunAll,
      tone: linkBroken ? ('warn' as const) : ('ok' as const),
      title: linkBroken ? t.captureInactiveTitle : t.tunAllTitle,
    };
  }
  if (status.system_proxy_active) {
    return {
      text: t.sysProxy(status.mixed_port),
      tone: linkBroken ? ('warn' as const) : ('ok' as const),
      title: linkBroken ? t.captureInactiveTitle : t.sysProxyTitle,
    };
  }
  if (status.is_admin && !status.wintun_available) {
    return {
      text: t.tunLoading,
      tone: 'warn' as const,
      title: t.tunLoadingTitle,
    };
  }
  return {
    text: t.captureInactive,
    tone: 'warn' as const,
    title: t.captureInactiveTitle,
  };
}

export function SystemStatusBanner({
  status,
  coreRunning,
  connectionPhase,
  onRestartAsAdmin,
  restarting,
}: SystemStatusBannerProps) {
  const { t } = useI18n();
  if (!status) return null;

  const traffic = trafficBadge(status, coreRunning, connectionPhase, t.system);

  return (
    <div className="system-status-panel compact">
      <div className="system-status-row">
        <span
          className={`sys-badge ${traffic.tone === 'ok' ? 'ok' : traffic.tone === 'warn' ? 'warn' : 'muted'}`}
          title={traffic.title}
        >
          {traffic.text}
        </span>
        <span
          className={`sys-badge ${status.is_admin ? 'ok' : 'warn'}`}
          title={status.is_admin ? t.system.adminOk : t.system.adminWarn}
        >
          {status.is_admin ? t.system.adminBadge : t.system.noAdminBadge}
        </span>
        {status.ports_auto_selected && coreRunning && (
          <span
            className="sys-badge warn"
            title={t.system.altPortsTitle(status.mixed_port, status.controller_port)}
          >
            {t.system.altPorts(status.mixed_port)}
          </span>
        )}
        {status.core_auto_recovery_paused && (
          <span className="sys-badge warn" title={t.system.recoveryPausedTitle}>
            {t.system.recoveryPaused}
          </span>
        )}
      </div>

      {!status.is_admin && onRestartAsAdmin && (
        <div className="system-status-action compact">
          <span className="system-status-note">{t.system.adminNote}</span>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={onRestartAsAdmin}
            disabled={restarting}
          >
            {restarting ? '…' : t.system.restartAdmin}
          </button>
        </div>
      )}
    </div>
  );
}
