import type { AutoSelectSettings } from '../api/types';

export const DEFAULT_AUTO_SELECT: AutoSelectSettings = {
  ping_min_ms: 60,
  ping_max_ms: 110,
  countries: [],
  allow_fallback: true,
  auto_return: true,
};

export function resolveAutoSelectSettings(
  value: AutoSelectSettings | undefined | null,
): AutoSelectSettings {
  if (!value) return DEFAULT_AUTO_SELECT;
  return {
    ...DEFAULT_AUTO_SELECT,
    ...value,
    countries: [...(value.countries ?? [])],
  };
}

export const SETTINGS_SCROLL_KEY = 'pawlink-scroll-settings';
export const AUTO_SELECT_SETTINGS_ID = 'auto-select-settings';
export const AUTO_SELECT_SECTION_ID = 'settings-auto-select-section';

export function requestSettingsScroll(section: string): void {
  try {
    sessionStorage.setItem(SETTINGS_SCROLL_KEY, section);
  } catch {
    // ignore
  }
}

export function consumeSettingsScrollTarget(): string | null {
  try {
    const target = sessionStorage.getItem(SETTINGS_SCROLL_KEY);
    if (target) sessionStorage.removeItem(SETTINGS_SCROLL_KEY);
    return target;
  } catch {
    return null;
  }
}

export const UPDATES_SECTION_ID = 'settings-updates-section';
export const APP_SECTION_ID = 'settings-app-section';
export const VPN_SECTION_ID = 'settings-vpn-section';
export const SETUP_SECTION_ID = 'settings-setup-section';
export const RESET_SECTION_ID = 'settings-reset-section';

function focusSettingsSection(sectionId: string, highlightClass = 'settings-section-focus'): boolean {
  const section = document.getElementById(sectionId);
  if (!section) return false;

  const container = section.closest('.content') as HTMLElement | null;
  if (container) {
    const top = section.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 16;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  } else {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  section.classList.add(highlightClass);
  window.setTimeout(() => section.classList.remove(highlightClass), 2200);
  return true;
}

export function focusAutoSelectSettings(): boolean {
  return focusSettingsSection(AUTO_SELECT_SECTION_ID);
}

export function focusUpdatesSettings(): boolean {
  return focusSettingsSection(UPDATES_SECTION_ID);
}

export function focusAppSettings(): boolean {
  return focusSettingsSection(APP_SECTION_ID);
}

export function focusVpnSettings(): boolean {
  return focusSettingsSection(VPN_SECTION_ID);
}

export function focusSettingsByTarget(target: string): boolean {
  switch (target) {
    case 'updates':
      return focusUpdatesSettings();
    case 'auto-select':
      return focusAutoSelectSettings();
    case 'app':
      return focusAppSettings();
    case 'vpn':
      return focusVpnSettings();
    case 'setup':
      return focusSettingsSection(SETUP_SECTION_ID);
    case 'reset':
      return focusSettingsSection(RESET_SECTION_ID);
    default:
      return false;
  }
}
