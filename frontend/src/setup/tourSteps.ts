import type { ViewId } from '../App';

export type TourStepId =
  | 'import'
  | 'routing'
  | 'ruleLists'
  | 'autostart'
  | 'connectOnStartup'
  | 'killSwitch'
  | 'autoSelect'
  | 'updates'
  | 'connect'
  | 'done';

export interface TourStep {
  id: TourStepId;
  /** Navigate here before highlighting. */
  view?: ViewId;
  /** Scroll settings section via existing focus helpers. */
  settingsScroll?: string;
  /** CSS selector for highlight target (`[data-tour="…"]`). */
  selector: string | null;
  /** Prefer placing the card below / above / auto. */
  prefer?: 'below' | 'above' | 'auto';
}

/** Guided setup order — important bits first. */
export const TOUR_STEPS: TourStep[] = [
  { id: 'import', view: 'import', selector: '[data-tour="import-subscription"]', prefer: 'below' },
  { id: 'routing', view: 'routing', selector: '[data-tour="routing-mode"]', prefer: 'below' },
  { id: 'ruleLists', view: 'routing', selector: '[data-tour="routing-rule-lists"]', prefer: 'below' },
  {
    id: 'autostart',
    view: 'settings',
    settingsScroll: 'app',
    selector: '[data-tour="settings-autostart"]',
    prefer: 'below',
  },
  {
    id: 'connectOnStartup',
    view: 'settings',
    settingsScroll: 'vpn',
    selector: '[data-tour="settings-connect-on-startup"]',
    prefer: 'below',
  },
  {
    id: 'killSwitch',
    view: 'settings',
    settingsScroll: 'vpn',
    selector: '[data-tour="settings-kill-switch"]',
    prefer: 'below',
  },
  {
    id: 'autoSelect',
    view: 'settings',
    settingsScroll: 'auto-select',
    selector: '[data-tour="settings-auto-select"]',
    prefer: 'below',
  },
  {
    id: 'updates',
    view: 'settings',
    settingsScroll: 'updates',
    selector: '[data-tour="settings-updates"]',
    prefer: 'below',
  },
  { id: 'connect', view: 'home', selector: '[data-tour="connect-button"]', prefer: 'above' },
  { id: 'done', selector: null },
];
