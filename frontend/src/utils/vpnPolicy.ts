import type { RoutingMode, SystemStatus } from '../api/types';

/** Rule mode needs TUN/process capture — unavailable without administrator rights. */
export function isVpnStartBlocked(
  routingMode: RoutingMode,
  systemStatus: SystemStatus | null | undefined,
): boolean {
  return routingMode === 'rule' && Boolean(systemStatus && !systemStatus.is_admin);
}
