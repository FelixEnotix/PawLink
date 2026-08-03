import type {
  ApplicationState,
  ApplyRuleListResult,
  BackupExport,
  BackupImportResult,
  EndpointProfile,
  InstalledApplication,
  ImportConfigResponse,
  NodeHealthStatus,
  ProcessTunnelEntry,
  RuleListInfo,
  RoutingMode,
  RoutingRule,
  RunningProcess,
  SystemStatus,
  TrafficStats,
  AppSettings,
  Subscription,
  AutoSelectSettings,
  AutoSelectResult,
  BlockedServer,
} from './types';
import { ConnectError, parseConnectDetail } from '../utils/connectError';

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8765';

let baseUrl = DEFAULT_BACKEND_URL;
let apiToken = '';
let connectionReady: Promise<void> | null = null;

async function resolveConnection(): Promise<void> {
  if (!window.pawlink) {
    baseUrl = DEFAULT_BACKEND_URL;
    apiToken = '';
    return;
  }
  if (!connectionReady) {
    connectionReady = Promise.all([
      window.pawlink.getBackendUrl(),
      window.pawlink.getBackendToken(),
    ])
      .then(([url, token]) => {
        baseUrl = url || DEFAULT_BACKEND_URL;
        apiToken = token || '';
      })
      .catch(() => {
        baseUrl = DEFAULT_BACKEND_URL;
        apiToken = '';
      });
  }
  await connectionReady;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  await resolveConnection();
  const url = `${baseUrl}${path}`;
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (apiToken) {
    headers.set('X-PawLink-Token', apiToken);
  }
  const res = await fetch(url, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    let detail = text;
    try {
      const payload = JSON.parse(text) as { detail?: unknown };
      const failure = parseConnectDetail(payload.detail);
      if (failure && failure.stage !== 'unknown') {
        throw new ConnectError(failure.stage, failure.message);
      }
      if (typeof payload.detail === 'string') detail = payload.detail;
      else if (failure) detail = failure.message;
    } catch (err) {
      if (err instanceof ConnectError) throw err;
      // Keep the plain-text response.
    }
    throw new Error(`API ${path}: ${res.status} ${detail || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getState: () => request<ApplicationState>('/api/state'),

  getSystemStatus: () => request<SystemStatus>('/api/system/status'),

  getSettings: () => request<AppSettings>('/api/settings'),

  updateSettings: (patch: Partial<Omit<AppSettings, 'auto_select'>> & { auto_select?: Partial<AutoSelectSettings> }) =>
    request<AppSettings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  setRoutingMode: (mode: RoutingMode) =>
    request<{ routing_mode: RoutingMode }>('/api/routing/mode', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),

  importConfig: (body: {
    raw?: string;
    subscription_url?: string;
  }) =>
    request<ImportConfigResponse>('/api/config/import', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  exportBackup: () => request<BackupExport>('/api/backup/export'),

  importBackup: (body: {
    raw: string;
    with_servers?: boolean;
    with_rules?: boolean;
    with_settings?: boolean;
  }) =>
    request<BackupImportResult>('/api/backup/import', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  factoryReset: (wipe_data = false) =>
    request<{ ok: boolean; wipe_data: boolean; settings: AppSettings }>('/api/factory-reset', {
      method: 'POST',
      body: JSON.stringify({ wipe_data }),
    }),

  getHealth: () => request<Record<string, NodeHealthStatus>>('/api/nodes/health'),

  refreshHealth: () =>
    request<Record<string, NodeHealthStatus>>('/api/nodes/health/refresh', {
      method: 'POST',
    }),

  autoSelect: (forceFallback = false) =>
    request<AutoSelectResult>('/api/nodes/auto-select', {
      method: 'POST',
      body: JSON.stringify({ force_fallback: forceFallback }),
    }),

  getBlockedServers: () =>
    request<{ blocked_servers: BlockedServer[] }>('/api/auto-select/blocked'),

  setBlockedServers: (blocked_servers: BlockedServer[]) =>
    request<{ blocked_servers: BlockedServer[] }>('/api/auto-select/blocked', {
      method: 'PUT',
      body: JSON.stringify({ blocked_servers }),
    }),

  setAutoSelectEnabled: (enabled: boolean) =>
    request<{ auto_select_enabled: boolean; active_profile_id: string | null }>(
      '/api/nodes/auto-select/toggle',
      {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      },
    ),

  switchNode: (profileId: string) =>
    request<{ active_profile_id: string }>('/api/nodes/switch', {
      method: 'POST',
      body: JSON.stringify({ profile_id: profileId }),
    }),

  removeNode: (profileId: string) =>
    request<{ profiles: EndpointProfile[]; active_profile_id: string | null }>(
      `/api/nodes/${encodeURIComponent(profileId)}`,
      { method: 'DELETE' },
    ),

  refreshSubscriptions: (url?: string) =>
    request<{ sources: number; profiles: number; errors: Record<string, string> }>(
      '/api/subscriptions/refresh',
      {
        method: 'POST',
        body: JSON.stringify(url ? { url } : {}),
      },
    ),

  removeSubscriptionGroup: (source: string) =>
    request<{
      removed: number;
      profiles: EndpointProfile[];
      subscriptions: Subscription[];
      active_profile_id: string | null;
    }>('/api/subscriptions', {
      method: 'DELETE',
      body: JSON.stringify({ source }),
    }),

  addRule: (input: string, action = 'PROXY') =>
    request<RoutingRule>('/api/rules', {
      method: 'POST',
      body: JSON.stringify({ input, action }),
    }),

  listRules: () => request<RoutingRule[]>('/api/rules'),

  removeRule: (index: number) =>
    request<RoutingRule[]>(`/api/rules/${index}`, { method: 'DELETE' }),

  clearRules: () => request<{ ok: boolean; removed: number }>('/api/rules', { method: 'DELETE' }),

  listRuleLists: () => request<RuleListInfo[]>('/api/rule-lists'),

  getRuleListsDirectory: () => request<{ path: string }>('/api/rule-lists/directory'),

  openRuleListsDirectory: () =>
    request<{ ok: boolean; path: string }>('/api/rule-lists/open-directory', { method: 'POST' }),

  applyRuleList: (name: string, replace = false) =>
    request<ApplyRuleListResult>(`/api/rule-lists/${encodeURIComponent(name)}/apply`, {
      method: 'POST',
      body: JSON.stringify({ replace }),
    }),

  importRuleList: (name: string, content: string) =>
    request<RuleListInfo>('/api/rule-lists/import', {
      method: 'POST',
      body: JSON.stringify({ name, content }),
    }),

  downloadRuleList: (name: string, url: string) =>
    request<RuleListInfo>('/api/rule-lists/download', {
      method: 'POST',
      body: JSON.stringify({ name, url }),
    }),

  deleteRuleList: (name: string) =>
    request<{ ok: boolean; name: string }>(`/api/rule-lists/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),

  listProcesses: () => request<RunningProcess[]>('/api/processes'),

  listInstalledApps: () => request<InstalledApplication[]>('/api/apps/installed'),

  getTrafficStats: () => request<TrafficStats>('/api/traffic/stats'),

  addProcessTunnel: (executable: string, mode: 'include' | 'exclude') =>
    request<{ entries: ProcessTunnelEntry[] }>('/api/process-tunnel', {
      method: 'POST',
      body: JSON.stringify({ executable, mode }),
    }),

  removeProcessTunnel: (executable: string) =>
    request<{ entries: ProcessTunnelEntry[] }>(
      `/api/process-tunnel/${encodeURIComponent(executable)}`,
      { method: 'DELETE' },
    ),

  getProcessTunnel: () => request<ProcessTunnelEntry[]>('/api/process-tunnel'),

  startCore: () => request<{ running: boolean }>('/api/core/start', { method: 'POST' }),
  stopCore: () => request<{ running: boolean }>('/api/core/stop', { method: 'POST' }),
  syncGeo: () => request<Record<string, string>>('/api/geo/sync', { method: 'POST' }),
};
