import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from './client';

import type { ApplicationState, NodeHealthStatus, RoutingMode, SystemStatus, TrafficStats, AutoSelectSettings, BlockedServer } from './types';


const POLL_INTERVAL_MS = 8_000;

const FAST_POLL_INTERVAL_MS = 1_200;

const TRAFFIC_POLL_INTERVAL_MS = 3_000;



function fingerprint(value: unknown): string {

  try {

    return JSON.stringify(value);

  } catch {

    return '';

  }

}



function needsFastStatePoll(state: ApplicationState | null): boolean {
  if (!state) return false;
  const phase = state.connection_phase;
  if (
    state.core_starting ||
    state.kill_switch_engaged ||
    phase === 'connecting' ||
    phase === 'reconnecting' ||
    phase === 'no_link'
  ) {
    return true;
  }
  return Boolean(
    state.connect_on_startup &&
      !state.core_running &&
      (state.profiles?.length ?? 0) > 0,
  );
}



export function useBackendState() {

  const [state, setState] = useState<ApplicationState | null>(null);

  const [health, setHealth] = useState<Record<string, NodeHealthStatus>>({});

  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  const [trafficStats, setTrafficStats] = useState<TrafficStats | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const stateFp = useRef('');

  const sysFp = useRef('');

  const trafficFp = useRef('');

  const healthFp = useRef('');

  const stateRef = useRef<ApplicationState | null>(null);

  const prevTrayCoreRunning = useRef<boolean | undefined>(undefined);

  const prevTrayCoreStarting = useRef<boolean | undefined>(undefined);

  const prevTrayPhase = useRef<string | undefined>(undefined);



  stateRef.current = state;



  const refresh = useCallback(async (opts?: { keepLoadingOnError?: boolean }) => {

    try {

      const [st, sys, traffic] = await Promise.all([

        api.getState(),

        api.getSystemStatus(),

        api.getTrafficStats(),

      ]);

      const nextStateFp = fingerprint(st);

      if (nextStateFp !== stateFp.current) {

        stateFp.current = nextStateFp;

        setState(st);

        stateRef.current = st;

      }

      const nextHealthFp = fingerprint(st.health_statuses ?? {});

      if (nextHealthFp !== healthFp.current) {

        healthFp.current = nextHealthFp;

        setHealth(st.health_statuses ?? {});

      }

      const nextSysFp = fingerprint(sys);

      if (nextSysFp !== sysFp.current) {

        sysFp.current = nextSysFp;

        setSystemStatus(sys);

      }

      const nextTrafficFp = fingerprint(traffic);

      if (nextTrafficFp !== trafficFp.current) {

        trafficFp.current = nextTrafficFp;

        setTrafficStats(traffic);

      }



      if (

        st.core_running !== prevTrayCoreRunning.current ||

        st.core_starting !== prevTrayCoreStarting.current ||

        st.connection_phase !== prevTrayPhase.current

      ) {

        prevTrayCoreRunning.current = st.core_running;

        prevTrayCoreStarting.current = st.core_starting;

        prevTrayPhase.current = st.connection_phase;

        void window.pawlink?.refreshTray();

      }



      setError(null);

      setLoading(false);

    } catch (err) {

      setError(err instanceof Error ? err.message : 'Backend unavailable');

      if (!opts?.keepLoadingOnError) {

        setLoading(false);

      }

    }

  }, []);



  const refreshTraffic = useCallback(async () => {

    try {

      const traffic = await api.getTrafficStats();

      const nextTrafficFp = fingerprint(traffic);

      if (nextTrafficFp !== trafficFp.current) {

        trafficFp.current = nextTrafficFp;

        setTrafficStats(traffic);

      }

    } catch {

      // ignore background traffic poll errors

    }

  }, []);



  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let wakeTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      if (cancelled) return;
      // While hidden, Chromium coalesces timers — avoid a stampede of refreshes on restore.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        timer = setTimeout(() => void tick(), 60_000);
        return;
      }
      const delay = needsFastStatePoll(stateRef.current)
        ? FAST_POLL_INTERVAL_MS
        : POLL_INTERVAL_MS;
      timer = setTimeout(() => void tick(), delay);
    };

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        scheduleNext();
        return;
      }
      await refresh();
      scheduleNext();
    };

    const onVisibility = () => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (wakeTimer) clearTimeout(wakeTimer);
      // Yield so show/focus can paint first, then one refresh.
      wakeTimer = setTimeout(() => {
        wakeTimer = null;
        void tick();
      }, 80);
    };

    const boot = async () => {
      // After install/update the backend may need a few seconds — keep spinner, don't flash error.
      const deadline = Date.now() + 45_000;
      while (!cancelled && Date.now() < deadline) {
        await refresh({ keepLoadingOnError: true });
        if (stateRef.current) break;
        await new Promise((r) => setTimeout(r, 800));
      }
      if (!cancelled && !stateRef.current) {
        setLoading(false);
      }
      if (!cancelled) scheduleNext();
    };

    void boot();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (wakeTimer) clearTimeout(wakeTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);



  useEffect(() => {
    if (!state?.core_running) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let wakeTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        timer = setTimeout(() => void tick(), 60_000);
        return;
      }
      timer = setTimeout(() => void tick(), TRAFFIC_POLL_INTERVAL_MS);
    };

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        scheduleNext();
        return;
      }
      await refreshTraffic();
      if (cancelled) return;
      scheduleNext();
    };

    const onVisibility = () => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (wakeTimer) clearTimeout(wakeTimer);
      wakeTimer = setTimeout(() => {
        wakeTimer = null;
        void tick();
      }, 80);
    };

    void tick();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (wakeTimer) clearTimeout(wakeTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [state?.core_running, refreshTraffic]);



  const startCore = useCallback(async () => {

    setState((prev) => (prev ? { ...prev, core_starting: true } : prev));

    stateRef.current = stateRef.current

      ? { ...stateRef.current, core_starting: true }

      : stateRef.current;

    void window.pawlink?.refreshTray();

    try {

      await api.startCore();

      await refresh();

    } catch (err) {

      setState((prev) => (prev ? { ...prev, core_starting: false } : prev));

      if (stateRef.current) {

        stateRef.current = { ...stateRef.current, core_starting: false };

      }

      void window.pawlink?.refreshTray();

      await refresh();

      throw err;

    }

  }, [refresh]);



  const stopCore = useCallback(async () => {
    setState((prev) =>
      prev
        ? {
            ...prev,
            core_running: false,
            core_starting: false,
            core_connected_at: null,
            connection_phase: 'disconnected',
            kill_switch_engaged: false,
          }
        : prev,
    );
    if (stateRef.current) {
      stateRef.current = {
        ...stateRef.current,
        core_running: false,
        core_starting: false,
        core_connected_at: null,
        connection_phase: 'disconnected',
        kill_switch_engaged: false,
      };
    }
    void window.pawlink?.refreshTray();
    setTrafficStats((prev) =>
      prev
        ? {
            ...prev,
            core_running: false,
            core_connected_at: null,
            speed_up: 0,
            speed_down: 0,
          }
        : prev,
    );
    await api.stopCore();
    void refresh();
  }, [refresh]);



  const autoSelect = useCallback(async (forceFallback = false) => {
    const result = await api.autoSelect(forceFallback);
    await refresh();
    return result;
  }, [refresh]);



  const switchNode = useCallback(

    async (profileId: string) => {

      await api.switchNode(profileId);

      await refresh();

    },

    [refresh],

  );



  const removeNode = useCallback(

    async (profileId: string) => {

      await api.removeNode(profileId);

      await refresh();

    },

    [refresh],

  );



  const refreshSubscriptions = useCallback(

    async (url?: string) => {

      const result = await api.refreshSubscriptions(url);

      await refresh();

      return result;

    },

    [refresh],

  );



  const removeSubscriptionGroup = useCallback(

    async (source: string) => {

      const result = await api.removeSubscriptionGroup(source);

      await refresh();

      void window.pawlink?.refreshTray();

      return result;

    },

    [refresh],

  );



  const importConfig = useCallback(

    async (payload: { raw?: string; subscription_url?: string }) => {

      const result = await api.importConfig(payload);

      await refresh();

      return result;

    },

    [refresh],

  );



  const addRule = useCallback(

    async (input: string, action?: string) => {

      const rule = await api.addRule(input, action);

      setState((prev) => {

        if (!prev) return prev;

        const exists = prev.custom_rules.some(

          (r) =>
            r.rule_type === rule.rule_type &&
            r.value === rule.value &&
            r.action === rule.action,

        );

        if (exists) {

          return {

            ...prev,

            custom_rules: prev.custom_rules.map((r) =>

              r.rule_type === rule.rule_type && r.value === rule.value ? rule : r,

            ),

          };

        }

        return { ...prev, custom_rules: [...prev.custom_rules, rule] };

      });

      return rule;

    },

    [],

  );



  const removeRule = useCallback(

    async (index: number) => {

      // Optimistic UI — don't wait for full state refresh (hot-reload is fast).
      setState((prev) => {

        if (!prev?.custom_rules) return prev;

        if (index < 0 || index >= prev.custom_rules.length) return prev;

        const custom_rules = prev.custom_rules.filter((_, i) => i !== index);

        return { ...prev, custom_rules };

      });

      try {

        const rules = await api.removeRule(index);

        setState((prev) => (prev ? { ...prev, custom_rules: rules } : prev));

      } catch (err) {

        await refresh();

        throw err;

      }

    },

    [refresh],

  );



  const clearRules = useCallback(async () => {

    const previous = stateRef.current?.custom_rules ?? [];

    setState((prev) => (prev ? { ...prev, custom_rules: [] } : prev));

    try {

      const result = await api.clearRules();

      return result;

    } catch (err) {

      setState((prev) => (prev ? { ...prev, custom_rules: previous } : prev));

      await refresh();

      throw err;

    }

  }, [refresh]);



  const addProcessTunnel = useCallback(

    async (executable: string, mode: 'include' | 'exclude') => {

      const result = await api.addProcessTunnel(executable, mode);

      await refresh();

      return result;

    },

    [refresh],

  );



  const removeProcessTunnel = useCallback(

    async (executable: string) => {

      await api.removeProcessTunnel(executable);

      await refresh();

    },

    [refresh],

  );



  const refreshHealth = useCallback(async () => {

    const hl = await api.refreshHealth();

    const nextHealthFp = fingerprint(hl);

    if (nextHealthFp !== healthFp.current) {

      healthFp.current = nextHealthFp;

      setHealth(hl);

    }

    const st = await api.getState();

    const nextStateFp = fingerprint(st);

    if (nextStateFp !== stateFp.current) {

      stateFp.current = nextStateFp;

      setState(st);

      stateRef.current = st;

    }

    const fromState = fingerprint(st.health_statuses ?? hl);

    if (fromState !== healthFp.current) {

      healthFp.current = fromState;

      setHealth(st.health_statuses ?? hl);

    }

    return hl;

  }, []);



  const setRoutingMode = useCallback(

    async (mode: RoutingMode) => {

      await api.setRoutingMode(mode);

      await refresh();

    },

    [refresh],

  );



  const setAutoSelectEnabled = useCallback(

    async (enabled: boolean) => {

      await api.setAutoSelectEnabled(enabled);

      await refresh();

    },

    [refresh],

  );



  const updateSettings = useCallback(

    async (patch: Partial<{
      connect_on_startup: boolean;
      auto_select_enabled: boolean;
      auto_select: Partial<AutoSelectSettings>;
      kill_switch_enabled: boolean;
    }>) => {

      await api.updateSettings(patch);

      await refresh();

      void window.pawlink?.refreshTray();

    },

    [refresh],

  );



  const setBlockedServers = useCallback(async (blocked: BlockedServer[]) => {
    await api.setBlockedServers(blocked);
    await refresh();
  }, [refresh]);

  return {

    state,

    health,

    systemStatus,

    trafficStats,

    loading,

    error,

    refresh,

    startCore,

    stopCore,

    autoSelect,

    switchNode,

    removeNode,

    refreshSubscriptions,

    removeSubscriptionGroup,

    importConfig,

    addRule,

    removeRule,

    clearRules,

    addProcessTunnel,

    removeProcessTunnel,

    refreshHealth,

    setRoutingMode,

    setAutoSelectEnabled,

    updateSettings,

    setBlockedServers,

  };

}


