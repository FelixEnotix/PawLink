export type HealthLevel = 'green' | 'yellow' | 'red';

import type { ConnectFailure } from '../utils/connectError';
import type { AppPreferences } from '../types/global';

export interface EndpointProfile {
  id: string;
  name: string;
  protocol: string;
  host: string;
  port: number;
  uuid?: string | null;
  password?: string | null;
  tls_sni?: string | null;
  tls_enabled: boolean;
  reality_public_key?: string | null;
  reality_short_id?: string | null;
  network?: string | null;
  flow?: string | null;
  extra: Record<string, unknown>;
  source?: string | null;
}

export interface NodeHealthStatus {
  profile_id: string;
  latency_ms?: number | null;
  packet_loss: number;
  health: HealthLevel;
  last_checked?: number | null;
  is_active: boolean;
}

export interface RoutingRule {
  rule_type: string;
  value: string;
  action: string;
  priority: number;
}

export interface RuleListInfo {
  name: string;
  rule_count: number;
  path: string;
  bundled: boolean;
}

export interface ApplyRuleListResult {
  name: string;
  added: number;
  updated: number;
  total: number;
  replace: boolean;
}

export interface ProcessTunnelEntry {
  executable: string;
  mode: 'include' | 'exclude';
}

export type RoutingMode = 'rule' | 'global' | 'direct';

export interface Subscription {
  id: string;
  url: string;
  name: string;
  added_at: number;
  last_refreshed?: number | null;
}

export interface SystemStatus {
  is_admin: boolean;
  wintun_available: boolean;
  tun_ready: boolean;
  tun_active: boolean;
  system_proxy_active: boolean;
  traffic_mode: 'off' | 'tun' | 'system_proxy' | 'tun+proxy';
  mixed_port: number;
  controller_port: number;
  ports_auto_selected: boolean;
  core_auto_recovery_paused: boolean;
  routing_mode: RoutingMode;
  browser_captured: boolean;
  core_binary_present: boolean;
}

export interface AutoSelectSettings {
  ping_min_ms: number;
  ping_max_ms: number;
  countries: string[];
  allow_fallback: boolean;
  auto_return: boolean;
}

export interface BlockedServer {
  id: string;
  name: string;
  host: string;
  port: number;
  profile_id?: string | null;
  added_at?: number;
}

export interface AutoSelectResult {
  active_profile_id: string | null;
  profile_name?: string | null;
  matched_criteria: boolean;
  needs_fallback_prompt: boolean;
  fallback_profile_id?: string | null;
  fallback_profile_name?: string | null;
  in_fallback: boolean;
  reason: string;
}

export type ConnectionPhase =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'no_link'
  | 'reconnecting';

export interface ApplicationState {
  profiles: EndpointProfile[];
  subscriptions: Subscription[];
  active_profile_id?: string | null;
  health_statuses: Record<string, NodeHealthStatus>;
  custom_rules: RoutingRule[];
  process_tunnels: ProcessTunnelEntry[];
  auto_select_enabled: boolean;
  auto_select?: AutoSelectSettings;
  auto_select_in_fallback?: boolean;
  blocked_servers?: BlockedServer[];
  connect_on_startup: boolean;
  routing_mode: RoutingMode;
  kill_switch_enabled?: boolean;
  kill_switch_engaged?: boolean;
  connection_phase?: ConnectionPhase;
  core_running: boolean;
  core_starting: boolean;
  tun_active: boolean;
  system_proxy_active: boolean;
  core_connected_at?: number | null;
  last_connect_error?: ConnectFailure | null;
}

export interface AppSettings {
  connect_on_startup: boolean;
  auto_select_enabled: boolean;
  auto_select?: AutoSelectSettings;
  kill_switch_enabled?: boolean;
}

export interface RunningProcess {
  pid: number;
  executable: string;
  name: string;
  exe_path?: string | null;
}

export interface InstalledApplication {
  name: string;
  executable: string;
  icon_path?: string | null;
  install_path?: string | null;
}

export interface TrafficStats {
  core_running: boolean;
  core_connected_at?: number | null;
  speed_up: number;
  speed_down: number;
  session_up: number;
  session_down: number;
  active_subscription_id?: string | null;
  active_subscription_up: number;
  active_subscription_down: number;
  subscriptions: Record<
    string,
    { name: string; total_up: number; total_down: number }
  >;
}

export interface ImportConfigResponse {
  count: number;
  profiles: EndpointProfile[];
}

export interface BackupSettingsSection {
  connect_on_startup: boolean;
  auto_select_enabled: boolean;
  auto_select: AutoSelectSettings;
  auto_select_in_fallback: boolean;
  blocked_servers: BlockedServer[];
  kill_switch_enabled?: boolean;
}

export interface BackupDataV2 {
  servers: {
    profiles: EndpointProfile[];
    subscriptions: Subscription[];
    active_profile_id?: string | null;
    subscription_traffic: Record<string, { total_up: number; total_down: number }>;
  };
  routing: {
    routing_mode: RoutingMode;
    custom_rules: RoutingRule[];
    process_tunnels: ProcessTunnelEntry[];
  };
  settings: BackupSettingsSection;
}

export interface BackupExport {
  format: string;
  version: number;
  exported_at: string;
  data: BackupDataV2;
  app_preferences?: AppPreferences;
}

export interface BackupImportResult {
  servers: number;
  rules: number;
  tunnels: number;
  settings: boolean;
  with_servers: boolean;
  with_rules: boolean;
  with_settings: boolean;
}
