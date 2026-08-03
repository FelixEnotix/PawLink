import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

export type AppLanguage = 'ru' | 'en';

export type UpdateCheckIntervalHours = 6 | 12 | 24 | 48 | 168;

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
  setupWizardCompleted: boolean;
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

export interface UpdateStatusPayload {
  phase: UpdatePhase;
  currentVersion: string;
  availableVersion?: string;
  progress?: number;
  error?: string;
  isPackaged: boolean;
  installerPath?: string;
}

export interface AutostartInfrastructureStatus {
  supported: boolean;
  taskRegistered: boolean;
  launcherFilesPresent: boolean;
  ready: boolean;
  installPath: string;
  taskName: string;
}

export type AutostartInfraResult =
  | { ok: true }
  | { ok: false; code: 'already_exists' | 'nothing_to_remove' | 'unsupported' | 'failed'; message?: string };

export interface PawLinkApi {
  getBackendUrl: () => Promise<string>;
  getBackendToken: () => Promise<string>;
  restartBackend: () => Promise<string>;
  restartAsAdmin: () => Promise<void>;
  isBackendRunning: () => Promise<boolean>;
  getAppIcon: (iconPath: string | null) => Promise<string | null>;
  pickExecutable: () => Promise<string | null>;
  pickConfigFile: () => Promise<{ path: string; raw: string } | null>;
  saveTextFile: (defaultName: string, content: string) => Promise<string | null>;
  getPreferences: () => Promise<AppPreferences>;
  setPreferences: (patch: Partial<AppPreferences>) => Promise<AppPreferences>;
  showWindow: () => Promise<void>;
  showNotification: (payload: { title: string; body: string }) => Promise<boolean>;
  quitApp: () => Promise<void>;
  refreshTray: () => Promise<void>;
  getAutostartInfra: () => Promise<AutostartInfrastructureStatus>;
  removeAutostartInfra: () => Promise<AutostartInfraResult>;
  restoreAutostartInfra: () => Promise<AutostartInfraResult>;
  getLogs: () => Promise<string[]>;
  clearLogs: () => Promise<boolean>;
  onLogLine: (handler: (line: string) => void) => () => void;
  onLogBatch: (handler: (lines: string[]) => void) => () => void;
  getAppVersion: () => Promise<string>;
  getUpdateStatus: () => Promise<UpdateStatusPayload>;
  checkForUpdates: () => Promise<UpdateStatusPayload>;
  downloadUpdate: () => Promise<UpdateStatusPayload>;
  installUpdate: () => Promise<void>;
  openUpdateFolder: () => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;
  onUpdateStatus: (handler: (status: UpdateStatusPayload) => void) => () => void;
}

contextBridge.exposeInMainWorld('pawlink', {
  getBackendUrl: () => ipcRenderer.invoke('pawlink:get-backend-url'),
  getBackendToken: () => ipcRenderer.invoke('pawlink:get-backend-token'),
  restartBackend: () => ipcRenderer.invoke('pawlink:restart-backend'),
  restartAsAdmin: () => ipcRenderer.invoke('pawlink:restart-as-admin'),
  isBackendRunning: () => ipcRenderer.invoke('pawlink:is-backend-running'),
  getAppIcon: (iconPath: string | null) => ipcRenderer.invoke('pawlink:get-app-icon', iconPath),
  pickExecutable: () => ipcRenderer.invoke('pawlink:pick-executable'),
  pickConfigFile: () => ipcRenderer.invoke('pawlink:pick-config-file'),
  saveTextFile: (defaultName: string, content: string) =>
    ipcRenderer.invoke('pawlink:save-text-file', defaultName, content),
  getPreferences: () => ipcRenderer.invoke('pawlink:get-preferences'),
  setPreferences: (patch: Partial<AppPreferences>) =>
    ipcRenderer.invoke('pawlink:set-preferences', patch),
  showWindow: () => ipcRenderer.invoke('pawlink:show-window'),
  showNotification: (payload: { title: string; body: string }) =>
    ipcRenderer.invoke('pawlink:show-notification', payload),
  quitApp: () => ipcRenderer.invoke('pawlink:quit-app'),
  refreshTray: () => ipcRenderer.invoke('pawlink:refresh-tray'),
  getAutostartInfra: () => ipcRenderer.invoke('pawlink:get-autostart-infra'),
  removeAutostartInfra: () => ipcRenderer.invoke('pawlink:remove-autostart-infra'),
  restoreAutostartInfra: () => ipcRenderer.invoke('pawlink:restore-autostart-infra'),
  getLogs: () => ipcRenderer.invoke('pawlink:get-logs'),
  clearLogs: () => ipcRenderer.invoke('pawlink:clear-logs'),
  onLogLine: (handler: (line: string) => void) => {
    void ipcRenderer.invoke('pawlink:logs-subscribe');
    const listener = (_event: IpcRendererEvent, line: string) => handler(line);
    ipcRenderer.on('pawlink:log-line', listener);
    return () => {
      ipcRenderer.removeListener('pawlink:log-line', listener);
      void ipcRenderer.invoke('pawlink:logs-unsubscribe');
    };
  },
  onLogBatch: (handler: (lines: string[]) => void) => {
    void ipcRenderer.invoke('pawlink:logs-subscribe');
    const listener = (_event: IpcRendererEvent, lines: string[]) => handler(lines);
    ipcRenderer.on('pawlink:log-batch', listener);
    return () => {
      ipcRenderer.removeListener('pawlink:log-batch', listener);
      void ipcRenderer.invoke('pawlink:logs-unsubscribe');
    };
  },
  getAppVersion: () => ipcRenderer.invoke('pawlink:get-app-version'),
  getUpdateStatus: () => ipcRenderer.invoke('pawlink:get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('pawlink:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('pawlink:download-update'),
  installUpdate: () => ipcRenderer.invoke('pawlink:install-update'),
  openUpdateFolder: () => ipcRenderer.invoke('pawlink:open-update-folder'),
  openExternal: (url: string) => ipcRenderer.invoke('pawlink:open-external', url),
  onUpdateStatus: (handler: (status: UpdateStatusPayload) => void) => {
    void ipcRenderer.invoke('pawlink:update-subscribe');
    const listener = (_event: IpcRendererEvent, status: UpdateStatusPayload) => handler(status);
    ipcRenderer.on('pawlink:update-status', listener);
    return () => {
      ipcRenderer.removeListener('pawlink:update-status', listener);
      void ipcRenderer.invoke('pawlink:update-unsubscribe');
    };
  },
} as PawLinkApi);
