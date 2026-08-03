import { memo, useMemo, useState } from 'react';
import type { useBackendState } from '../api/useBackend';
import type { EndpointProfile, NodeHealthStatus, Subscription } from '../api/types';
import {
  getFlag,
  formatLatency,
  sortProfiles,
  stripLeadingFlag,
  type NodeSortMode,
} from '../utils/format';
import {
  CheckIcon,
  RefreshIcon,
  BoltIcon,
  ServersIcon,
  ChevronDownIcon,
  SignalIcon,
  TrashIcon,
} from '../components/icons';
import { formatSpeed } from '../utils/format';
import { useI18n } from '../i18n/LocaleContext';
import { AutoSelectFallbackModal } from '../components/AutoSelectFallbackModal';
import type { AutoSelectResult } from '../api/types';

interface NodesViewProps {
  backend: ReturnType<typeof useBackendState>;
}

type ServerGroup = {
  id: string;
  title: string;
  subtitle?: string;
  source: string;
  isSubscription: boolean;
  profiles: EndpointProfile[];
};

function LatencyIndicator({ status }: { status?: NodeHealthStatus }) {
  if (!status || status.latency_ms == null) {
    return (
      <span className="latency unknown">
        <span className="latency-dot" />
        …
      </span>
    );
  }
  return (
    <span className={`latency ${status.health}`}>
      <span className="latency-dot" />
      {formatLatency(status.latency_ms)}
    </span>
  );
}

const NodeCard = memo(function NodeCard({
  profile,
  health,
  isActive,
  disabled,
  removing,
  deleteTitle,
  onSelect,
  onRemove,
}: {
  profile: EndpointProfile;
  health?: NodeHealthStatus;
  isActive: boolean;
  disabled: boolean;
  removing: boolean;
  deleteTitle: string;
  onSelect: () => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      className={`node-card ${isActive ? 'active' : ''} ${health?.health ?? 'unknown'} ${
        disabled ? 'disabled' : ''
      }`}
      onClick={() => {
        if (!disabled) void onSelect();
      }}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          void onSelect();
        }
      }}
    >
      <div className="node-flag">{getFlag(profile.name)}</div>
      <div className="node-info">
        <div className="node-name">{stripLeadingFlag(profile.name)}</div>
        <div className="node-meta">
          {profile.protocol.toUpperCase()} · {profile.host}:{profile.port}
        </div>
      </div>
      <div className="node-right">
        <LatencyIndicator status={health} />
        {isActive && (
          <span className="node-check">
            <CheckIcon size={14} strokeWidth={2.6} />
          </span>
        )}
        <button
          type="button"
          className="btn btn-sm btn-ghost node-delete"
          title={deleteTitle}
          disabled={disabled || removing}
          onClick={(e) => {
            e.stopPropagation();
            void onRemove();
          }}
        >
          {removing ? '…' : '×'}
        </button>
      </div>
    </div>
  );
});

function groupProfiles(
  profiles: EndpointProfile[],
  subscriptions: Subscription[],
  noSubscriptionLabel: string,
): ServerGroup[] {
  const subByUrl = new Map(subscriptions.map((s) => [s.url, s]));
  const buckets = new Map<string, EndpointProfile[]>();

  for (const profile of profiles) {
    const key =
      profile.source?.startsWith('http://') || profile.source?.startsWith('https://')
        ? profile.source
        : '__manual__';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(profile);
  }

  const groups: ServerGroup[] = [];

  for (const sub of subscriptions) {
    const nodes = buckets.get(sub.url);
    if (nodes?.length) {
      groups.push({
        id: sub.id,
        title: sub.name,
        subtitle: sub.url,
        source: sub.url,
        isSubscription: true,
        profiles: nodes,
      });
      buckets.delete(sub.url);
    }
  }

  for (const [key, nodes] of buckets) {
    if (!nodes.length) continue;
    const isSubscription = key !== '__manual__';
    groups.push({
      id: key,
      title: key === '__manual__' ? noSubscriptionLabel : key,
      subtitle: isSubscription ? subByUrl.get(key)?.url ?? key : undefined,
      source: key,
      isSubscription,
      profiles: nodes,
    });
  }

  return groups;
}

export function NodesView({ backend }: NodesViewProps) {
  const { t } = useI18n();
  const {
    state,
    health,
    trafficStats,
    autoSelect,
    switchNode,
    removeNode,
    refreshSubscriptions,
    removeSubscriptionGroup,
    refreshHealth,
  } = backend;
  const [autoSelecting, setAutoSelecting] = useState(false);
  const [fallbackPrompt, setFallbackPrompt] = useState<AutoSelectResult | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removingGroupId, setRemovingGroupId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingSubs, setRefreshingSubs] = useState(false);
  const [refreshingGroupSource, setRefreshingGroupSource] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [sortMode, setSortMode] = useState<NodeSortMode>('default');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const profiles = state?.profiles ?? [];
  const subscriptions = state?.subscriptions ?? [];
  const activeId = state?.active_profile_id;
  const coreRunning = state?.core_running ?? false;
  const traffic = trafficStats;
  const activeProfile = profiles.find((p) => p.id === activeId) ?? null;
  const activeHealth = activeProfile ? health[activeProfile.id] : undefined;
  const hasSubscriptions = subscriptions.length > 0 || profiles.some((p) =>
    p.source?.startsWith('http://') || p.source?.startsWith('https://'),
  );
  const busy =
    switchingId !== null ||
    autoSelecting ||
    removingId !== null ||
    removingGroupId !== null ||
    refreshingGroupSource !== null;

  const sortOptions: Array<{ id: NodeSortMode; label: string }> = [
    { id: 'default', label: t.nodes.asInSubscription },
    { id: 'ping', label: t.nodesExtra.byPing },
    { id: 'name', label: t.nodesExtra.byName },
  ];

  const groups = useMemo(() => {
    const raw = groupProfiles(profiles, subscriptions, t.nodes.noSubscription);
    return raw.map((group) => ({
      ...group,
      profiles: sortProfiles(group.profiles, health, sortMode),
    }));
  }, [profiles, subscriptions, health, sortMode, t.nodes.noSubscription]);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleAutoSelect = async (forceFallback = false) => {
    setAutoSelecting(true);
    setError(null);
    try {
      const result = await autoSelect(forceFallback);
      if (result.needs_fallback_prompt && result.fallback_profile_name) {
        setFallbackPrompt(result);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.home.autoSelectFailed);
    } finally {
      setAutoSelecting(false);
    }
  };

  const handleSwitch = async (profileId: string) => {
    if (profileId === activeId) return;
    setSwitchingId(profileId);
    setError(null);
    try {
      await switchNode(profileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.routing.switchServerFailed);
    } finally {
      setSwitchingId(null);
    }
  };

  const handleRefreshHealth = async () => {
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

  const handleRemove = async (profileId: string) => {
    setRemovingId(profileId);
    setError(null);
    setNotice(null);
    try {
      await removeNode(profileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.routing.deleteServerFailed);
    } finally {
      setRemovingId(null);
    }
  };

  const handleRefreshSubscriptions = async () => {
    setRefreshingSubs(true);
    setError(null);
    setNotice(null);
    try {
      const result = await refreshSubscriptions();
      const failed = Object.keys(result.errors).length;
      setNotice(t.nodesExtra.refreshed(result.sources, result.profiles, failed));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.nodes.refreshFailed);
    } finally {
      setRefreshingSubs(false);
    }
  };

  const handleRefreshGroup = async (group: ServerGroup) => {
    if (!group.isSubscription) return;
    setRefreshingGroupSource(group.source);
    setError(null);
    setNotice(null);
    try {
      const result = await refreshSubscriptions(group.source);
      const failed = Object.keys(result.errors).length;
      if (failed > 0) {
        const firstError = Object.values(result.errors)[0];
        setError(firstError || t.nodes.refreshFailed);
      } else {
        setNotice(t.nodesExtra.groupRefreshed(result.profiles));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.nodes.refreshFailed);
    } finally {
      setRefreshingGroupSource(null);
    }
  };

  const handleDeleteGroup = async (group: ServerGroup) => {
    const ok = window.confirm(
      t.nodesExtra.deleteGroupConfirm(group.title, group.profiles.length),
    );
    if (!ok) return;
    setRemovingGroupId(group.id);
    setError(null);
    setNotice(null);
    try {
      const result = await removeSubscriptionGroup(group.source);
      setNotice(t.nodesExtra.groupDeleted(result.removed));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.nodesExtra.deleteGroupFailed);
    } finally {
      setRemovingGroupId(null);
    }
  };

  return (
    <div className="view nodes-view">
      <header className="view-header nodes-header">
        <p className="subtitle">{t.nodes.subtitle}</p>
      </header>

      {profiles.length > 0 && (
        <div className={`nodes-status-panel ${state?.connection_phase === 'connected' ? 'is-connected' : ''}`}>
          {coreRunning && traffic && (
            <div className="nodes-status-speed">
              <span>↓ {formatSpeed(traffic.speed_down)}</span>
              <span>↑ {formatSpeed(traffic.speed_up)}</span>
            </div>
          )}
          <div className="nodes-status-toolbar">
            <div className="nodes-ping-chip">
              <SignalIcon size={15} />
              <span className="nodes-ping-value">
                {activeHealth ? formatLatency(activeHealth.latency_ms) : '—'}
              </span>
              <span className="nodes-ping-label">
                {activeProfile ? stripLeadingFlag(activeProfile.name) : t.home.ping}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="nodes-toolbar">
        <label className="sort-select-wrap">
          <span className="sort-select-label">{t.nodesExtra.sort}</span>
          <select
            className="input select sort-select"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as NodeSortMode)}
          >
            {sortOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="nodes-toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleRefreshHealth}
            disabled={refreshing || busy || profiles.length === 0}
            title={t.nodesExtra.refreshPing}
          >
            <RefreshIcon size={15} className={refreshing ? 'spin' : undefined} />
            <span className="btn-label">
              {refreshing ? t.nodesExtra.checking : t.nodesExtra.refreshPingBtn}
            </span>
          </button>
          {hasSubscriptions && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void handleRefreshSubscriptions()}
              disabled={refreshingSubs || busy}
              title={t.nodesExtra.refreshSubsTitle}
            >
              <RefreshIcon size={15} className={refreshingSubs ? 'spin' : undefined} />
              <span className="btn-label">
                {refreshingSubs ? t.nodesExtra.refreshingSubs : t.nodesExtra.refreshAllSubs}
              </span>
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleAutoSelect()}
            disabled={busy || profiles.length === 0}
            title={t.nodesExtra.pickFastest}
          >
            <BoltIcon size={15} className={autoSelecting ? 'spin' : undefined} />
            <span className="btn-label">{autoSelecting ? t.nodesExtra.picking : t.nodesExtra.pick}</span>
          </button>
        </div>
      </div>

      {fallbackPrompt?.fallback_profile_name && (
        <AutoSelectFallbackModal
          serverName={fallbackPrompt.fallback_profile_name}
          onConfirm={() => {
            setFallbackPrompt(null);
            void handleAutoSelect(true);
          }}
          onCancel={() => setFallbackPrompt(null)}
        />
      )}

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {profiles.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <ServersIcon size={26} />
          </div>
          <p className="empty-state-title">{t.nodesExtra.noServers}</p>
          <span className="hint">{t.nodes.goImport}</span>
        </div>
      ) : (
        <div className="nodes-groups">
          {groups.map((group) => {
            const collapsed = !!collapsedGroups[group.id];
            const groupBusy =
              removingGroupId === group.id || refreshingGroupSource === group.source;
            return (
              <section key={group.id} className={`subscription-group ${collapsed ? 'collapsed' : ''}`}>
                <header className="subscription-group-header">
                  <button
                    type="button"
                    className="group-collapse-btn"
                    onClick={() => toggleGroup(group.id)}
                    title={collapsed ? t.nodesExtra.expand : t.nodesExtra.collapse}
                  >
                    <ChevronDownIcon size={18} className={collapsed ? 'collapsed' : ''} />
                  </button>
                  <div className="subscription-group-copy">
                    <h2 className="subscription-group-title">{group.title}</h2>
                    {group.subtitle && !collapsed && (
                      <p className="subscription-group-sub">{group.subtitle}</p>
                    )}
                  </div>
                  <div className="subscription-group-actions">
                    <span className="badge badge-green">{group.profiles.length}</span>
                    {group.isSubscription && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost group-action-btn"
                        title={t.nodesExtra.refreshGroup}
                        disabled={busy || refreshingSubs}
                        onClick={() => void handleRefreshGroup(group)}
                      >
                        <RefreshIcon
                          size={14}
                          className={refreshingGroupSource === group.source ? 'spin' : undefined}
                        />
                        <span className="btn-label">
                          {refreshingGroupSource === group.source
                            ? t.nodesExtra.refreshingSubs
                            : t.nodesExtra.refreshGroup}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost group-action-btn group-delete-btn"
                      title={t.nodesExtra.deleteGroup}
                      disabled={busy}
                      onClick={() => void handleDeleteGroup(group)}
                    >
                      <TrashIcon size={14} />
                      <span className="btn-label">
                        {removingGroupId === group.id ? '…' : t.nodesExtra.deleteGroup}
                      </span>
                    </button>
                  </div>
                </header>
                {!collapsed && (
                  <div className={`nodes-list ${groupBusy ? 'is-busy' : ''}`}>
                    {group.profiles.map((profile) => (
                      <NodeCard
                        key={profile.id}
                        profile={profile}
                        health={health[profile.id]}
                        isActive={profile.id === activeId}
                        disabled={busy}
                        removing={removingId === profile.id}
                        deleteTitle={t.nodesExtra.deleteServer}
                        onSelect={() => handleSwitch(profile.id)}
                        onRemove={() => handleRemove(profile.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
