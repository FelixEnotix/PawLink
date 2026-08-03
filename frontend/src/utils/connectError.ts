import type { Messages } from '../i18n/messages';

export type ConnectStage =
  | 'precheck'
  | 'binaries'
  | 'ports'
  | 'config'
  | 'mihomo_start'
  | 'mihomo_ready'
  | 'capture'
  | 'unknown';

export interface ConnectFailure {
  stage: ConnectStage;
  message: string;
  at?: number;
}

export class ConnectError extends Error {
  readonly stage: ConnectStage;

  readonly detail: ConnectFailure;

  constructor(stage: ConnectStage, message: string) {
    super(message);
    this.name = 'ConnectError';
    this.stage = stage;
    this.detail = { stage, message };
  }
}

export function isConnectFailure(value: unknown): value is ConnectFailure {
  if (!value || typeof value !== 'object') return false;
  const v = value as ConnectFailure;
  return typeof v.stage === 'string' && typeof v.message === 'string';
}

export function parseConnectDetail(raw: unknown): ConnectFailure | null {
  if (typeof raw === 'string' && raw.trim()) {
    return { stage: 'unknown', message: raw.trim() };
  }
  if (!isConnectFailure(raw)) return null;
  return { stage: raw.stage as ConnectStage, message: raw.message, at: raw.at };
}

export function toConnectFailure(err: unknown): ConnectFailure | null {
  if (err instanceof ConnectError) return err.detail;
  if (err instanceof Error) {
    const match = err.message.match(/API [^:]+: \d+ (.+)$/s);
    if (match?.[1]) {
      try {
        const parsed = JSON.parse(match[1]) as { detail?: unknown };
        const fromDetail = parseConnectDetail(parsed.detail);
        if (fromDetail) return fromDetail;
      } catch {
        return { stage: 'unknown', message: match[1] };
      }
    }
    return { stage: 'unknown', message: err.message };
  }
  return null;
}

export function connectStageLabel(t: Messages, stage: ConnectStage): string {
  return t.connect.stages[stage] ?? t.connect.stages.unknown;
}

export function formatConnectFailure(t: Messages, failure: ConnectFailure): string {
  const stage = connectStageLabel(t, failure.stage);
  return t.connect.failedAt(stage, failure.message);
}

export function notifyConnectFailure(t: Messages, failure: ConnectFailure): void {
  const title = t.connect.notifyTitle;
  const body = formatConnectFailure(t, failure);
  void window.pawlink?.showNotification?.({ title, body });
}
