import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { applyAutostart as applyWindowsAutostart } from './autostart';

export {
  applyAutostart,
  isAutostartLaunch,
  isAutostartActive,
  AUTOSTART_FLAG,
  getAutostartInfrastructureStatus,
  removeAutostartInfrastructure,
  restoreAutostartInfrastructure,
  scrubOrphanElectronAutostart,
  type AutostartInfrastructureStatus,
  type AutostartInfraResult,
} from './autostart';

export type AppLanguage = 'ru' | 'en';

/** Allowed intervals for app / subscription background checks (hours). */
export const UPDATE_CHECK_INTERVAL_OPTIONS = [6, 12, 24, 48, 168] as const;
export type UpdateCheckIntervalHours = (typeof UPDATE_CHECK_INTERVAL_OPTIONS)[number];

export interface AppPreferences {
  autostart: boolean;
  minimizeToTray: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  language: AppLanguage;
  autoUpdate: boolean;
  updateCheckIntervalHours: UpdateCheckIntervalHours;
  autoRefreshSubscriptions: boolean;
  subscriptionRefreshIntervalHours: UpdateCheckIntervalHours;
  /** False until the user finishes or skips the first-run setup wizard. */
  setupWizardCompleted: boolean;
}

/** First-run defaults after install: only app auto-update check is on. */
export const DEFAULT_PREFERENCES: AppPreferences = {
  autostart: false,
  minimizeToTray: false,
  startMinimized: false,
  closeToTray: false,
  language: 'ru',
  autoUpdate: true,
  updateCheckIntervalHours: 24,
  autoRefreshSubscriptions: false,
  subscriptionRefreshIntervalHours: 24,
  setupWizardCompleted: false,
};

let cached: AppPreferences = { ...DEFAULT_PREFERENCES };

function preferencesPath(): string {
  return path.join(app.getPath('userData'), 'preferences.json');
}

export function normalizeUpdateCheckIntervalHours(value: unknown): UpdateCheckIntervalHours {
  const n = typeof value === 'number' ? value : Number(value);
  if ((UPDATE_CHECK_INTERVAL_OPTIONS as readonly number[]).includes(n)) {
    return n as UpdateCheckIntervalHours;
  }
  return DEFAULT_PREFERENCES.updateCheckIntervalHours;
}

export function loadPreferences(): AppPreferences {
  const filePath = preferencesPath();
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    const language =
      parsed.language === 'en' || parsed.language === 'ru' ? parsed.language : DEFAULT_PREFERENCES.language;
    // Missing key = upgrade from older build → don't force the first-run wizard.
    const setupWizardCompleted =
      typeof parsed.setupWizardCompleted === 'boolean' ? parsed.setupWizardCompleted : true;
    cached = {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      language,
      setupWizardCompleted,
      autoUpdate:
        typeof parsed.autoUpdate === 'boolean' ? parsed.autoUpdate : DEFAULT_PREFERENCES.autoUpdate,
      updateCheckIntervalHours: normalizeUpdateCheckIntervalHours(parsed.updateCheckIntervalHours),
      autoRefreshSubscriptions:
        typeof parsed.autoRefreshSubscriptions === 'boolean'
          ? parsed.autoRefreshSubscriptions
          : DEFAULT_PREFERENCES.autoRefreshSubscriptions,
      subscriptionRefreshIntervalHours: normalizeUpdateCheckIntervalHours(
        parsed.subscriptionRefreshIntervalHours,
      ),
    };
  } catch {
    // Brand-new install — show the setup wizard.
    cached = { ...DEFAULT_PREFERENCES, setupWizardCompleted: false };
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(cached, null, 2), 'utf8');
    } catch {
      // ignore — in-memory defaults still apply
    }
  }
  return cached;
}

export function getPreferences(): AppPreferences {
  return cached;
}

export function savePreferences(next: Partial<AppPreferences>): AppPreferences {
  const patch = { ...next };
  if ('updateCheckIntervalHours' in patch) {
    patch.updateCheckIntervalHours = normalizeUpdateCheckIntervalHours(patch.updateCheckIntervalHours);
  }
  if ('subscriptionRefreshIntervalHours' in patch) {
    patch.subscriptionRefreshIntervalHours = normalizeUpdateCheckIntervalHours(
      patch.subscriptionRefreshIntervalHours,
    );
  }
  cached = { ...cached, ...patch };
  try {
    fs.mkdirSync(path.dirname(preferencesPath()), { recursive: true });
    fs.writeFileSync(preferencesPath(), JSON.stringify(cached, null, 2), 'utf8');
  } catch {
    // ignore write errors — in-memory prefs still apply this session
  }
  return cached;
}

export function syncAutostartPreference(): boolean {
  return applyWindowsAutostart(getPreferences().autostart);
}
