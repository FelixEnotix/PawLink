import type { ConnectionPhase } from '../api/types';

export function resolveConnectionPhase(
  phase: ConnectionPhase | undefined,
  coreRunning: boolean,
  coreStarting: boolean,
): ConnectionPhase {
  if (phase) return phase;
  if (coreStarting) return 'connecting';
  if (coreRunning) return 'connected';
  return 'disconnected';
}

export function isVpnBusyPhase(phase: ConnectionPhase): boolean {
  return phase === 'connecting' || phase === 'reconnecting';
}

export function isVpnOnPhase(phase: ConnectionPhase): boolean {
  return phase === 'connected' || phase === 'no_link' || isVpnBusyPhase(phase);
}
