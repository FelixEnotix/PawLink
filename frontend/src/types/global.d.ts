export type AppLanguage = 'ru' | 'en';

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

declare global {
  interface Window {
    pawlink?: {
      getBackendUrl: () => Promise<string>;
      getBackendToken: () => Promise<string>;
      restartBackend: () => Promise<string>;
      restartAsAdmin: () => Promise<void>;
      isBackendRunning: () => Promise<boolean>;
      pickExecutable: () => Promise<string | null>;
      getAppIcon: (iconPath: string | null) => Promise<string | null>;
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
    };
  }
}

export {};
