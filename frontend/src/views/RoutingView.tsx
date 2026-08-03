import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { useBackendState } from '../api/useBackend';
import type { InstalledApplication, RoutingMode } from '../api/types';
import { RoutingModeSelector } from '../components/RoutingModeSelector';
import { RuleListsModal } from '../components/RuleListsModal';
import { ShieldIcon, PlusIcon, FolderIcon, SearchIcon, AppsIcon, TrashIcon } from '../components/icons';
import { HelpTip } from '../components/HelpTip';
import { loadAppIcon } from '../utils/appIconCache';
import { useI18n } from '../i18n/LocaleContext';

const RULES_PAGE_LIMIT = 300;
const APPS_PAGE_SIZE = 80;

interface RoutingViewProps {
  backend: ReturnType<typeof useBackendState>;
}

function AppIcon({ iconPath, name }: { iconPath?: string | null; name: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!iconPath) {
      setSrc(null);
      return;
    }
    void loadAppIcon(iconPath).then((dataUrl) => {
      if (!cancelled) setSrc(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [iconPath]);

  if (src) {
    return <img className="route-app-icon" src={src} alt="" loading="lazy" decoding="async" />;
  }
  return <span className="route-app-icon fallback">{name.charAt(0).toUpperCase()}</span>;
}

export function RoutingView({ backend }: RoutingViewProps) {
  const { t, locale } = useI18n();
  const {
    state,
    systemStatus,
    addRule,
    removeRule,
    clearRules,
    setRoutingMode,
    addProcessTunnel,
    removeProcessTunnel,
    refresh,
  } = backend;

  const ruleActionLabel = (action: string): string => {
    if (action === 'PROXY') return t.routing.viaVpn;
    if (action === 'DIRECT') return t.routing.bypassVpn;
    return action;
  };
  const [section, setSection] = useState<'rules' | 'apps'>('rules');
  const [input, setInput] = useState('');
  const [action, setAction] = useState<'PROXY' | 'DIRECT'>('PROXY');
  const [submitting, setSubmitting] = useState(false);
  const [modeBusy, setModeBusy] = useState(false);
  const [removingIdx, setRemovingIdx] = useState<number | null>(null);
  const [clearingRules, setClearingRules] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apps, setApps] = useState<InstalledApplication[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [ruleFilter, setRuleFilter] = useState('');
  const [listsOpen, setListsOpen] = useState(false);
  const [appMode, setAppMode] = useState<'include' | 'exclude'>('include');
  const [pendingExecutable, setPendingExecutable] = useState<string | null>(null);
  const [appsVisible, setAppsVisible] = useState(APPS_PAGE_SIZE);

  const rules = state?.custom_rules ?? [];
  const routingMode: RoutingMode = state?.routing_mode ?? 'rule';
  const isAdmin = systemStatus?.is_admin ?? true;
  const tunnels = state?.process_tunnels ?? [];
  const tunnelMap = useMemo(() => new Map(tunnels.map((t) => [t.executable, t.mode])), [tunnels]);

  const filteredApps = useMemo(() => {
    const q = filter.toLowerCase();
    const list = apps.filter(
      (app) =>
        app.name.toLowerCase().includes(q) || app.executable.toLowerCase().includes(q),
    );
    return list.sort((a, b) => {
      const aSel = tunnelMap.has(a.executable) ? 0 : 1;
      const bSel = tunnelMap.has(b.executable) ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      return a.name.localeCompare(b.name, locale === 'en' ? 'en' : 'ru');
    });
  }, [apps, filter, tunnelMap, locale]);

  const filteredRules = useMemo(() => {
    const q = ruleFilter.trim().toLowerCase();
    const withIndex = rules.map((rule, index) => ({ rule, index }));
    if (!q) return withIndex;
    return withIndex.filter(
      ({ rule }) =>
        rule.value.toLowerCase().includes(q) ||
        rule.rule_type.toLowerCase().includes(q) ||
        rule.action.toLowerCase().includes(q) ||
        ruleActionLabel(rule.action).toLowerCase().includes(q),
    );
  }, [rules, ruleFilter, t.routing.viaVpn, t.routing.bypassVpn]);

  const visibleRules = filteredRules.slice(0, RULES_PAGE_LIMIT);

  const loadApps = async () => {
    setAppsLoading(true);
    setError(null);
    try {
      const list = await api.listInstalledApps();
      setApps(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.routing.loadAppsFailed);
    } finally {
      setAppsLoading(false);
    }
  };

  useEffect(() => {
    if (section === 'apps') {
      setAppsVisible(APPS_PAGE_SIZE);
      void loadApps();
    }
  }, [section]);

  useEffect(() => {
    setAppsVisible(APPS_PAGE_SIZE);
  }, [filter]);

  const visibleApps = useMemo(
    () => filteredApps.slice(0, appsVisible),
    [filteredApps, appsVisible],
  );

  const handleRemoveRule = async (index: number) => {
    // Don't block the whole list — allow rapid deletes.
    setError(null);
    setRemovingIdx(index);
    // Clear busy mark quickly so the next delete isn't blocked.
    window.setTimeout(() => {
      setRemovingIdx((current) => (current === index ? null : current));
    }, 120);
    try {
      await removeRule(index);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.routing.removeRuleFailed);
      setRemovingIdx(null);
    }
  };

  const handleClearRules = async () => {
    if (rules.length === 0) return;
    const ok = confirm(t.routing.deleteAllConfirm(rules.length));
    if (!ok) return;
    setClearingRules(true);
    setError(null);
    try {
      await clearRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.routing.deleteAllFailed);
    } finally {
      setClearingRules(false);
    }
  };

  const handleSubmitRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await addRule(input.trim(), action);
      setInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.routing.addRuleFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePickExe = async () => {
    setError(null);
    if (!window.pawlink?.pickExecutable) {
      setError(t.routing.pickDesktopOnly);
      return;
    }
    const filePath = await window.pawlink.pickExecutable();
    if (!filePath) return;
    const name = filePath.split(/[\\/]/).pop() ?? filePath;
    setInput(name);
  };

  const handleRoutingMode = async (mode: RoutingMode) => {
    if (mode === routingMode) return;
    setModeBusy(true);
    setError(null);
    try {
      await setRoutingMode(mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.routing.modeFailed);
    } finally {
      setModeBusy(false);
    }
  };

  const handleAddApp = async (executable: string) => {
    setPendingExecutable(executable);
    setError(null);
    try {
      await addProcessTunnel(executable, appMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.routing.addAppFailed);
    } finally {
      setPendingExecutable(null);
    }
  };

  const handleRemoveApp = async (executable: string) => {
    setPendingExecutable(executable);
    setError(null);
    try {
      await removeProcessTunnel(executable);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.routing.removeAppFailed);
    } finally {
      setPendingExecutable(null);
    }
  };

  return (
    <div className="view routing-view">
      <header className="view-header">
        <p className="subtitle">{t.routing.subtitle}</p>
      </header>

      <div className="panel routing-panel" data-tour="routing-mode">
        <div className="panel-title">
          <ShieldIcon size={15} />
          {t.routing.vpnModeTitle}
          <HelpTip text={t.help.routingMode} label={t.settings.helpLabel} />
        </div>
        <RoutingModeSelector
          value={routingMode}
          isAdmin={isAdmin}
          disabled={modeBusy}
          onChange={handleRoutingMode}
        />
        <p className="hint routing-hint">{t.routing.modeHint}</p>
      </div>

      <div className="route-section-tabs">
        <button
          type="button"
          className={`route-section-tab ${section === 'rules' ? 'active' : ''}`}
          onClick={() => setSection('rules')}
        >
          {t.routing.sitesTab}
        </button>
        <button
          type="button"
          className={`route-section-tab ${section === 'apps' ? 'active' : ''}`}
          onClick={() => setSection('apps')}
        >
          {t.routing.appsTab}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {section === 'rules' ? (
        <>
          <div className="panel">
            <div className="panel-title rules-panel-title">
              <span>
                <PlusIcon size={15} />
                {t.routing.addRule}
              </span>
              <span className="rules-preset-wrap" data-tour="routing-rule-lists">
                <button
                  type="button"
                  className="btn btn-sm rules-preset-btn"
                  onClick={() => setListsOpen(true)}
                  title={t.routing.ruleListPresetHint}
                >
                  {t.routing.ruleListPreset}
                </button>
                <HelpTip text={t.help.ruleLists} label={t.settings.helpLabel} />
              </span>
            </div>
            <form className="rule-form" onSubmit={handleSubmitRule}>
              <input
                type="text"
                className="input"
                placeholder={t.routing.rulePlaceholder}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button type="button" className="btn btn-ghost" onClick={handlePickExe} title={t.routing.pickExe}>
                <FolderIcon size={16} />
              </button>
              <select
                className="input select"
                value={action}
                onChange={(e) => setAction(e.target.value as 'PROXY' | 'DIRECT')}
              >
                <option value="PROXY">{t.routing.viaVpn}</option>
                <option value="DIRECT">{t.routing.bypassVpn}</option>
              </select>
              <button type="submit" className="btn btn-primary" disabled={submitting || !input.trim()}>
                {submitting ? '…' : t.routing.add}
              </button>
            </form>
          </div>

          <div className="toolbar route-toolbar rules-toolbar">
            <div className="input-wrap">
              <SearchIcon size={16} />
              <input
                type="text"
                className="input"
                placeholder={t.routing.searchPlaceholder}
                value={ruleFilter}
                onChange={(e) => setRuleFilter(e.target.value)}
              />
            </div>
            <span className="hint rules-count">
              {ruleFilter.trim()
                ? `${filteredRules.length} / ${rules.length}`
                : `${rules.length}`}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-ghost rules-clear-btn"
              onClick={() => void handleClearRules()}
              disabled={clearingRules || rules.length === 0}
              title={t.routing.deleteAllTitle}
            >
              <TrashIcon size={14} />
              {clearingRules ? t.routing.deleting : t.routing.deleteAll}
            </button>
          </div>

          <div className="route-list">
            {rules.length === 0 ? (
              <div className="empty-state compact">
                <ShieldIcon size={24} />
                <p className="empty-state-title">{t.routing.noRulesYet}</p>
                <span className="hint">{t.routing.emptyRulesHint}</span>
              </div>
            ) : filteredRules.length === 0 ? (
              <div className="empty-state compact">
                <SearchIcon size={22} />
                <p className="empty-state-title">{t.routing.nothingFound}</p>
                <span className="hint">{t.routing.changeSearch}</span>
              </div>
            ) : (
              <>
                {visibleRules.map(({ rule, index }) => (
                  <div key={`${rule.rule_type}-${rule.value}-${index}`} className="route-item">
                    <span className={`rule-type type-${rule.rule_type}`}>{rule.rule_type}</span>
                    <span className="route-item-main" title={rule.value}>
                      {rule.value}
                    </span>
                    <span className={`rule-action action-${rule.action.toLowerCase()}`}>
                      {ruleActionLabel(rule.action)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost rule-remove"
                      title={t.routing.remove}
                      onClick={() => void handleRemoveRule(index)}
                      disabled={removingIdx === index}
                    >
                      {removingIdx === index ? '…' : '×'}
                    </button>
                  </div>
                ))}
                {filteredRules.length > RULES_PAGE_LIMIT && (
                  <p className="hint rules-truncate-hint">
                    {t.routing.truncated(RULES_PAGE_LIMIT, filteredRules.length)}
                  </p>
                )}
              </>
            )}
          </div>

          <RuleListsModal
            open={listsOpen}
            onClose={() => setListsOpen(false)}
            onApplied={refresh}
          />
        </>
      ) : (
        <>
          <div className="toolbar route-toolbar">
            <div className="input-wrap">
              <SearchIcon size={16} />
              <input
                type="text"
                className="input"
                placeholder={t.routing.searchApps}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <div className="mode-toggle">
              <button
                type="button"
                className={`btn btn-sm ${appMode === 'include' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setAppMode('include')}
              >
                {t.routing.viaVpn}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${appMode === 'exclude' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setAppMode('exclude')}
              >
                {t.routing.bypassVpn}
              </button>
            </div>
          </div>

          {tunnels.length > 0 && (
            <p className="hint apps-selected-hint">{t.routing.appsSelectedHint(tunnels.length)}</p>
          )}

          <div className="route-list">
            {appsLoading ? (
              <div className="empty-state compact">
                <div className="spinner" style={{ margin: '0 auto 12px' }} />
                <span className="hint">{t.routing.loadingApps}</span>
              </div>
            ) : filteredApps.length === 0 ? (
              <div className="empty-state compact">
                <AppsIcon size={24} />
                <p className="empty-state-title">{t.routing.noAppsFound}</p>
                <span className="hint">{t.routing.changeSearchOrRefresh}</span>
              </div>
            ) : (
              <>
                {visibleApps.map((appItem) => {
                  const existing = tunnelMap.get(appItem.executable);
                  return (
                    <div
                      key={appItem.executable}
                      className={`route-item app-item ${existing ? 'app-item-selected' : ''}`}
                    >
                      <AppIcon iconPath={appItem.icon_path} name={appItem.name} />
                      <div className="route-item-copy">
                        <span className="route-item-main">{appItem.name}</span>
                        <span className="route-item-sub">
                          {appItem.executable}
                          {existing
                            ? ` · ${existing === 'include' ? t.routing.viaVpnShort : t.routing.bypassVpnShort}`
                            : ''}
                        </span>
                      </div>
                      {existing ? (
                        <button
                          type="button"
                          className={`btn btn-sm badge badge-${existing === 'include' ? 'green' : 'red'}`}
                          onClick={() => handleRemoveApp(appItem.executable)}
                          disabled={pendingExecutable === appItem.executable}
                        >
                          {pendingExecutable === appItem.executable ? '…' : t.routing.removeApp}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => handleAddApp(appItem.executable)}
                          disabled={pendingExecutable === appItem.executable}
                        >
                          {pendingExecutable === appItem.executable ? '…' : t.routing.add}
                        </button>
                      )}
                    </div>
                  );
                })}
                {appsVisible < filteredApps.length && (
                  <button
                    type="button"
                    className="btn btn-ghost apps-show-more"
                    onClick={() => setAppsVisible((n) => n + APPS_PAGE_SIZE)}
                  >
                    {t.routing.showMore(filteredApps.length - appsVisible)}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
