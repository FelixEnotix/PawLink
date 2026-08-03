import { getPreferences, normalizeUpdateCheckIntervalHours } from './preferences';

type FetchFn = typeof fetch;

let startupTimer: ReturnType<typeof setTimeout> | null = null;
let checkTimer: ReturnType<typeof setTimeout> | null = null;
let backendUrl = '';
let backendToken = '';
let fetchImpl: FetchFn = fetch;
let inFlight = false;
let lastRefreshAt = 0;
let logFn: ((line: string) => void) | null = null;

const STARTUP_DELAY_MS = 25_000;

function intervalMs(): number {
  return (
    normalizeUpdateCheckIntervalHours(getPreferences().subscriptionRefreshIntervalHours) *
    60 *
    60 *
    1000
  );
}

function shouldRefresh(): boolean {
  if (!lastRefreshAt) return true;
  return Date.now() - lastRefreshAt >= intervalMs();
}

async function refreshSubscriptionsQuietly(force = false): Promise<void> {
  if (!backendUrl || !backendToken) return;
  if (!getPreferences().autoRefreshSubscriptions) return;
  if (inFlight) return;
  if (!force && lastRefreshAt > 0 && !shouldRefresh()) return;

  inFlight = true;
  try {
    const res = await fetchImpl(`${backendUrl}/api/subscriptions/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PawLink-Token': backendToken,
      },
      body: '{}',
    });
    lastRefreshAt = Date.now();
    if (!res.ok) {
      logFn?.(`[Electron] Subscription refresh skipped (HTTP ${res.status})`);
      return;
    }
    logFn?.('[Electron] Subscriptions refreshed in background');
  } catch {
    // keep silent — backend may still be starting
  } finally {
    inFlight = false;
  }
}

export function initSubscriptionRefresh(options: {
  backendUrl: string;
  backendToken: string;
  fetchImpl?: FetchFn;
  log?: (line: string) => void;
}): void {
  backendUrl = options.backendUrl;
  backendToken = options.backendToken;
  if (options.fetchImpl) fetchImpl = options.fetchImpl;
  logFn = options.log ?? null;
  applySubscriptionRefreshSchedule();
}

export function stopSubscriptionRefresh(): void {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (checkTimer) {
    clearTimeout(checkTimer);
    checkTimer = null;
  }
}

export function applySubscriptionRefreshSchedule(): void {
  stopSubscriptionRefresh();

  if (!getPreferences().autoRefreshSubscriptions) return;

  const scheduleNext = () => {
    if (checkTimer) {
      clearTimeout(checkTimer);
      checkTimer = null;
    }
    if (!getPreferences().autoRefreshSubscriptions) return;
    const interval = intervalMs();
    const elapsed = lastRefreshAt ? Date.now() - lastRefreshAt : interval;
    const delay = Math.max(30_000, interval - elapsed);
    checkTimer = setTimeout(() => {
      checkTimer = null;
      void refreshSubscriptionsQuietly(false).finally(() => scheduleNext());
    }, delay);
  };

  // First run after backend has time to start; then wall-clock chain.
  startupTimer = setTimeout(() => {
    void refreshSubscriptionsQuietly(true).finally(() => scheduleNext());
  }, STARTUP_DELAY_MS);
}
