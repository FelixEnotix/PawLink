import { app, BrowserWindow, Notification, dialog, shell, net, powerMonitor } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { getPreferences, normalizeUpdateCheckIntervalHours } from './preferences';

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

interface PendingUpdateState {
  version: string;
  installerPath: string;
  downloadUrl: string;
}

const GITHUB_OWNER = 'FelixEnotix';
const GITHUB_REPO = 'PawLink';
const RELEASES_LIST_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=30`;
const RELEASES_LATEST_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const INSTALLER_ASSET_NAMES = ['PawLink-Setup.exe', 'PawLink-Setup-x64.exe'];
const STARTUP_DELAY_MS = 12_000;
const RESUME_DELAY_MS = 20_000;
const MIN_INSTALLER_BYTES = 5 * 1024 * 1024;

let mainWindow: BrowserWindow | null = null;
let checkTimer: ReturnType<typeof setTimeout> | null = null;
let startupTimer: ReturnType<typeof setTimeout> | null = null;
let resumeTimer: ReturnType<typeof setTimeout> | null = null;
let subscriberCount = 0;
let downloadedInstallerPath: string | null = null;
let pendingAvailableVersion: string | null = null;
let pendingDownloadUrl: string | null = null;
let installingUpdate = false;
let checkInFlight = false;
let downloadInFlight = false;
let dialogBusy = false;
let lastNotifiedVersion: string | null = null;
let lastCheckAt = 0;
let powerMonitorBound = false;

export function isInstallingUpdate(): boolean {
  return installingUpdate;
}

let currentStatus: UpdateStatusPayload = {
  phase: 'idle',
  currentVersion: app.getVersion(),
  isPackaged: app.isPackaged,
};

function updatesDir(): string {
  return path.join(app.getPath('userData'), 'updates');
}

function pendingStatePath(): string {
  return path.join(updatesDir(), 'pending.json');
}

function installerPathFor(version: string): string {
  return path.join(updatesDir(), `PawLink-Setup-${version}.exe`);
}

function parentWindow(): BrowserWindow | undefined {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  return undefined;
}

function emitStatus(patch: Partial<UpdateStatusPayload>): void {
  currentStatus = { ...currentStatus, ...patch };
  if (mainWindow && !mainWindow.isDestroyed() && subscriberCount > 0) {
    mainWindow.webContents.send('pawlink:update-status', currentStatus);
  }
}

function parseVersion(text: string): [number, number, number] | null {
  const m = text.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareVersions(a: string, b: string): number {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  if (!av && !bv) return 0;
  if (!av) return -1;
  if (!bv) return 1;
  for (let i = 0; i < 3; i++) {
    if (av[i] > bv[i]) return 1;
    if (av[i] < bv[i]) return -1;
  }
  return 0;
}

function isVersionNewer(remote: string, current: string): boolean {
  return compareVersions(remote, current) > 0;
}

function pickInstallerAsset(
  assets: Array<{ name: string; browser_download_url: string }> | undefined,
): { name: string; browser_download_url: string } | null {
  const list = assets ?? [];
  return (
    list.find((a) => /^PawLink-Setup[\d.-]*\.exe$/i.test(a.name)) ??
    list.find((a) => /^PawLink-Setup/i.test(a.name) && /\.exe$/i.test(a.name)) ??
    list.find((a) => INSTALLER_ASSET_NAMES.includes(a.name)) ??
    list.find((a) => /\.exe$/i.test(a.name) && !/uninstall/i.test(a.name)) ??
    null
  );
}

function discardPendingIfStale(latestVersion: string): void {
  const pending = loadPendingState();
  if (!pending) return;
  if (compareVersions(pending.version, latestVersion) >= 0 && isValidInstaller(pending.installerPath)) {
    return;
  }
  cleanupInstallerFile(pending.installerPath);
  clearPendingState();
  if (
    downloadedInstallerPath &&
    pending.installerPath &&
    path.resolve(downloadedInstallerPath) === path.resolve(pending.installerPath)
  ) {
    downloadedInstallerPath = null;
  }
  if (pendingAvailableVersion && compareVersions(pendingAvailableVersion, latestVersion) < 0) {
    pendingAvailableVersion = null;
    pendingDownloadUrl = null;
  }
}

function isValidInstaller(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size >= MIN_INSTALLER_BYTES;
  } catch {
    return false;
  }
}

function savePendingState(state: PendingUpdateState): void {
  fs.mkdirSync(updatesDir(), { recursive: true });
  fs.writeFileSync(pendingStatePath(), JSON.stringify(state, null, 2), 'utf8');
}

function loadPendingState(): PendingUpdateState | null {
  try {
    const raw = fs.readFileSync(pendingStatePath(), 'utf8');
    const parsed = JSON.parse(raw) as PendingUpdateState;
    if (!parsed.version || !parsed.installerPath) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearPendingState(): void {
  try {
    fs.unlinkSync(pendingStatePath());
  } catch {
    // ignore
  }
}

function cleanupInstallerFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

function cleanupStaleUpdates(): void {
  const current = app.getVersion();
  const pending = loadPendingState();

  if (pending) {
    if (!isVersionNewer(pending.version, current) || !isValidInstaller(pending.installerPath)) {
      cleanupInstallerFile(pending.installerPath);
      clearPendingState();
    }
  }

  try {
    if (!fs.existsSync(updatesDir())) return;
    for (const name of fs.readdirSync(updatesDir())) {
      if (!name.toLowerCase().endsWith('.exe') && !name.toLowerCase().endsWith('.download')) continue;
      const full = path.join(updatesDir(), name);
      if (pending?.installerPath && path.resolve(full) === path.resolve(pending.installerPath)) continue;
      cleanupInstallerFile(full);
    }
    for (const name of fs.readdirSync(updatesDir())) {
      if (/^apply-update\.(ps1|bat|cmd)$/i.test(name) || /^pawlink-install/i.test(name)) {
        cleanupInstallerFile(path.join(updatesDir(), name));
      }
    }
  } catch {
    // ignore
  }
}

function restorePendingDownload(): void {
  cleanupStaleUpdates();
  const pending = loadPendingState();
  if (!pending || !isValidInstaller(pending.installerPath)) return;
  if (!isVersionNewer(pending.version, app.getVersion())) {
    cleanupInstallerFile(pending.installerPath);
    clearPendingState();
    return;
  }

  downloadedInstallerPath = pending.installerPath;
  pendingAvailableVersion = pending.version;
  pendingDownloadUrl = pending.downloadUrl;
  emitStatus({
    phase: 'downloaded',
    availableVersion: pending.version,
    progress: 100,
    error: undefined,
    installerPath: pending.installerPath,
  });
}

interface GitHubReleaseInfo {
  version: string;
  downloadUrl: string;
  assetName: string;
}

function releaseFromPayload(data: {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: Array<{ name: string; browser_download_url: string }>;
}): GitHubReleaseInfo | null {
  if (data.draft || data.prerelease) return null;
  const version = (data.tag_name ?? '').replace(/^v/i, '');
  if (!parseVersion(version)) return null;
  const exe = pickInstallerAsset(data.assets);
  if (!exe?.browser_download_url) return null;
  return {
    version,
    downloadUrl: exe.browser_download_url,
    assetName: exe.name,
  };
}

async function githubJsonGet(url: string): Promise<unknown | null> {
  return new Promise((resolve) => {
    const request = net.request({ method: 'GET', url });
    request.setHeader('User-Agent', 'PawLink-Updater');
    request.setHeader('Accept', 'application/vnd.github+json');

    let body = '';
    request.on('response', (response) => {
      response.on('data', (chunk) => {
        body += chunk.toString('utf8');
      });
      response.on('end', () => {
        try {
          if (response.statusCode && response.statusCode >= 400) {
            resolve(null);
            return;
          }
          resolve(JSON.parse(body) as unknown);
        } catch {
          resolve(null);
        }
      });
    });
    request.on('error', () => resolve(null));
    request.end();
  });
}

/** Newest published release by semver — skips intermediate jumps. */
async function fetchLatestRelease(): Promise<GitHubReleaseInfo | null> {
  const listRaw = await githubJsonGet(RELEASES_LIST_URL);
  if (Array.isArray(listRaw)) {
    let best: GitHubReleaseInfo | null = null;
    for (const item of listRaw) {
      const release = releaseFromPayload(
        item as {
          tag_name?: string;
          draft?: boolean;
          prerelease?: boolean;
          assets?: Array<{ name: string; browser_download_url: string }>;
        },
      );
      if (!release) continue;
      if (!best || compareVersions(release.version, best.version) > 0) {
        best = release;
      }
    }
    if (best) return best;
  }

  const latestRaw = await githubJsonGet(RELEASES_LATEST_URL);
  if (latestRaw && typeof latestRaw === 'object') {
    return releaseFromPayload(
      latestRaw as {
        tag_name?: string;
        draft?: boolean;
        prerelease?: boolean;
        assets?: Array<{ name: string; browser_download_url: string }>;
      },
    );
  }
  return null;
}

function updaterLang(): 'ru' | 'en' {
  return getPreferences().language === 'en' ? 'en' : 'ru';
}

function notifyUpdateAvailable(version: string): void {
  if (!Notification.isSupported()) return;
  const en = updaterLang() === 'en';
  const notification = new Notification({
    title: 'PawLink',
    body: en
      ? `Version ${version} is available. Download when ready.`
      : `Доступна новая версия ${version}. Скачайте, когда удобно.`,
  });
  notification.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  notification.show();
}

function notifyUpdateReady(version: string): void {
  if (!Notification.isSupported()) return;
  const en = updaterLang() === 'en';
  new Notification({
    title: 'PawLink',
    body: en
      ? `Version ${version} is downloaded. Ready to install.`
      : `Версия ${version} загружена. Можно установить.`,
  }).show();
}

async function showInfo(title: string, message: string): Promise<void> {
  if (dialogBusy) return;
  dialogBusy = true;
  try {
    const opts = {
      type: 'info' as const,
      title,
      message,
      buttons: ['OK'],
      defaultId: 0,
      noLink: true,
    };
    const win = parentWindow();
    if (win) await dialog.showMessageBox(win, opts);
    else await dialog.showMessageBox(opts);
  } finally {
    dialogBusy = false;
  }
}

async function showErrorAndOpenFolder(message: string, folderOrFile: string): Promise<void> {
  if (dialogBusy) return;
  dialogBusy = true;
  try {
    const en = updaterLang() === 'en';
    const opts = {
      type: 'error' as const,
      title: en ? 'PawLink — update' : 'PawLink — обновление',
      message,
      detail: en
        ? 'You can open the folder and install the update manually.'
        : 'Можно открыть папку и установить обновление вручную.',
      buttons: en ? ['Open folder', 'Close'] : ['Открыть папку', 'Закрыть'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    };
    const win = parentWindow();
    const result = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    if (result.response === 0) {
      openUpdateLocation(folderOrFile);
    }
  } finally {
    dialogBusy = false;
  }
}

export function openUpdateLocation(targetPath?: string): void {
  const preferred =
    targetPath ||
    downloadedInstallerPath ||
    loadPendingState()?.installerPath ||
    updatesDir();

  try {
    fs.mkdirSync(updatesDir(), { recursive: true });
  } catch {
    // ignore
  }

  if (preferred && fs.existsSync(preferred) && fs.statSync(preferred).isFile()) {
    shell.showItemInFolder(preferred);
    return;
  }

  void shell.openPath(updatesDir());
}

async function downloadInstaller(url: string, version: string): Promise<string> {
  const target = installerPathFor(version);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  if (isValidInstaller(target)) {
    return target;
  }

  const tempTarget = `${target}.download`;
  cleanupInstallerFile(tempTarget);

  await new Promise<void>((resolve, reject) => {
    const request = net.request({ method: 'GET', url });
    request.setHeader('User-Agent', 'PawLink-Updater');

    request.on('response', (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        reject(
          new Error(
            updaterLang() === 'en'
              ? `Download error: HTTP ${response.statusCode}`
              : `Ошибка загрузки: HTTP ${response.statusCode}`,
          ),
        );
        return;
      }

      const total = Number(response.headers['content-length'] ?? 0);
      let received = 0;
      const file = createWriteStream(tempTarget);

      response.on('data', (chunk: Buffer) => {
        file.write(chunk);
        received += chunk.length;
        if (total > 0) {
          emitStatus({ phase: 'downloading', progress: (received / total) * 100 });
        }
      });

      response.on('end', () => {
        file.end(() => resolve());
      });
      file.on('error', reject);
      response.on('error', reject);
    });

    request.on('error', reject);
    request.end();
  });

  cleanupInstallerFile(target);
  fs.renameSync(tempTarget, target);

  if (!isValidInstaller(target)) {
    cleanupInstallerFile(target);
    throw new Error(
      updaterLang() === 'en'
        ? 'Update file is corrupted or too small'
        : 'Файл обновления повреждён или слишком маленький',
    );
  }

  return target;
}

let quitForInstall: (() => Promise<void>) | null = null;

/** Register graceful app shutdown used before launching the NSIS installer. */
export function bindQuitForInstall(handler: () => Promise<void>): void {
  quitForInstall = handler;
}

// Windows process-creation flags so the helper survives Electron quitting.
const CREATE_NEW_PROCESS_GROUP = 0x0000_0200;
const DETACHED_PROCESS = 0x0000_0008;
const CREATE_BREAKAWAY_FROM_JOB = 0x0100_0000;
const CREATE_NO_WINDOW = 0x0800_0000;

/**
 * Schedule installer AFTER this process exits.
 *
 * Critical: the helper must break away from Electron's Job Object. A plain
 * `spawn(..., { detached: true })` is still killed when PawLink quits, which
 * also takes down a just-started setup. Launch via `cmd /c start` + breakaway.
 */
function scheduleInstallerAfterExit(installerPath: string): boolean {
  try {
    const dir = updatesDir();
    fs.mkdirSync(dir, { recursive: true });
    const scriptPath = path.join(dir, `apply-update-${process.pid}.ps1`);
    const safeInstaller = installerPath.replace(/'/g, "''");
    const safeScript = scriptPath.replace(/'/g, "''");
    const script = [
      `$ErrorActionPreference = 'SilentlyContinue'`,
      `$installer = '${safeInstaller}'`,
      `$myPid = ${process.pid}`,
      `for ($i = 0; $i -lt 80; $i++) {`,
      `  if (-not (Get-Process -Id $myPid -ErrorAction SilentlyContinue)) { break }`,
      `  Start-Sleep -Milliseconds 250`,
      `}`,
      `Start-Sleep -Milliseconds 1200`,
      // Kill leftovers without /T so we never cascade into Setup.
      `for ($k = 0; $k -lt 12; $k++) {`,
      `  $procs = @(Get-Process -Name 'PawLink' -ErrorAction SilentlyContinue)`,
      `  if ($procs.Count -eq 0) { break }`,
      `  $procs | Stop-Process -Force -ErrorAction SilentlyContinue`,
      `  Start-Sleep -Milliseconds 500`,
      `}`,
      `Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |`,
      `  Where-Object { $_.CommandLine -match 'pawlink[\\\\/]+main\\.py' } |`,
      `  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
      `Start-Sleep -Milliseconds 800`,
      `if (Test-Path -LiteralPath $installer) { Start-Process -FilePath $installer }`,
      `Remove-Item -LiteralPath '${safeScript}' -Force -ErrorAction SilentlyContinue`,
    ].join("\r\n");
    fs.writeFileSync(scriptPath, script, 'utf8');

    const comspec = process.env.ComSpec || 'cmd.exe';
    // `start ""` is required: first quoted token is the window title.
    const child = spawn(
      comspec,
      [
        '/d',
        '/c',
        'start',
        '""',
        '/b',
        'powershell.exe',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        scriptPath,
      ],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        cwd: dir,
        creationflags:
          CREATE_NO_WINDOW |
          CREATE_NEW_PROCESS_GROUP |
          DETACHED_PROCESS |
          CREATE_BREAKAWAY_FROM_JOB,
      } as Parameters<typeof spawn>[2],
    );
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function checkIntervalMs(): number {
  return normalizeUpdateCheckIntervalHours(getPreferences().updateCheckIntervalHours) * 60 * 60 * 1000;
}

function shouldRunBackgroundCheck(): boolean {
  if (!lastCheckAt) return true;
  return Date.now() - lastCheckAt >= checkIntervalMs();
}

export function getUpdateStatus(): UpdateStatusPayload {
  return currentStatus;
}

export function bindUpdaterWindow(window: BrowserWindow): void {
  mainWindow = window;
}

export function initAutoUpdater(): void {
  currentStatus = {
    phase: 'idle',
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
  };
  if (!app.isPackaged) return;
  restorePendingDownload();
  applyAutoUpdateSchedule();
}

export function stopAutoUpdateSchedule(): void {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (checkTimer) {
    clearTimeout(checkTimer);
    checkTimer = null;
  }
  if (resumeTimer) {
    clearTimeout(resumeTimer);
    resumeTimer = null;
  }
}

export function applyAutoUpdateSchedule(): void {
  stopAutoUpdateSchedule();

  if (!app.isPackaged || !getPreferences().autoUpdate) return;

  // Always check on launch when the toggle is on (app may have been off for days).
  const runStartupCheck = () => {
    lastCheckAt = 0;
    void checkForUpdates(false).finally(() => scheduleNextPeriodicCheck());
  };

  // Wall-clock chain: Chromium throttles long setInterval, but we recompute delay
  // from lastCheckAt so a long session still fires when due.
  const runPeriodicCheck = () => {
    checkTimer = null;
    if (!getPreferences().autoUpdate) return;
    if (!shouldRunBackgroundCheck()) {
      scheduleNextPeriodicCheck();
      return;
    }
    void checkForUpdates(false).finally(() => scheduleNextPeriodicCheck());
  };

  const scheduleNextPeriodicCheck = () => {
    if (checkTimer) {
      clearTimeout(checkTimer);
      checkTimer = null;
    }
    if (!getPreferences().autoUpdate) return;
    const interval = checkIntervalMs();
    const elapsed = lastCheckAt ? Date.now() - lastCheckAt : interval;
    const delay = Math.max(30_000, interval - elapsed);
    checkTimer = setTimeout(runPeriodicCheck, delay);
  };

  startupTimer = setTimeout(runStartupCheck, STARTUP_DELAY_MS);

  if (!powerMonitorBound) {
    powerMonitorBound = true;
    powerMonitor.on('resume', () => {
      if (!getPreferences().autoUpdate) return;
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        if (!shouldRunBackgroundCheck()) {
          scheduleNextPeriodicCheck();
          return;
        }
        void checkForUpdates(false).finally(() => scheduleNextPeriodicCheck());
      }, RESUME_DELAY_MS);
    });
  }
}

export async function checkForUpdates(manual = true): Promise<UpdateStatusPayload> {
  if (!app.isPackaged) {
    emitStatus({ phase: 'not-available', error: undefined });
    return currentStatus;
  }

  if (currentStatus.phase === 'downloading' || currentStatus.phase === 'installing') {
    return currentStatus;
  }

  if (checkInFlight) return currentStatus;
  checkInFlight = true;

  // Manual only — background checks stay invisible in the UI.
  if (manual) {
    emitStatus({ phase: 'checking', error: undefined, progress: undefined });
  }

  try {
    const release = await fetchLatestRelease();
    lastCheckAt = Date.now();

    if (!release) {
      if (manual) {
        emitStatus({
          phase: 'error',
          availableVersion: undefined,
          error:
            updaterLang() === 'en'
              ? 'Could not fetch release info from GitHub'
              : 'Не удалось получить данные о релизе с GitHub',
          progress: undefined,
        });
      }
      return currentStatus;
    }

    // Always target the newest release; drop older downloaded installers.
    discardPendingIfStale(release.version);

    if (!isVersionNewer(release.version, app.getVersion())) {
      cleanupStaleUpdates();
      downloadedInstallerPath = null;
      pendingAvailableVersion = null;
      pendingDownloadUrl = null;
      if (
        manual ||
        currentStatus.phase === 'available' ||
        currentStatus.phase === 'downloaded' ||
        currentStatus.phase === 'checking' ||
        currentStatus.phase === 'error'
      ) {
        emitStatus({
          phase: 'not-available',
          availableVersion: undefined,
          error: undefined,
          progress: undefined,
          installerPath: undefined,
        });
      }
      return currentStatus;
    }

    const cached = loadPendingState();
    if (cached?.version === release.version && isValidInstaller(cached.installerPath)) {
      downloadedInstallerPath = cached.installerPath;
      pendingAvailableVersion = cached.version;
      pendingDownloadUrl = cached.downloadUrl ?? release.downloadUrl;
      emitStatus({
        phase: 'downloaded',
        availableVersion: cached.version,
        progress: 100,
        error: undefined,
        installerPath: cached.installerPath,
      });
      return currentStatus;
    }

    // Cached installer is for another version — forget it and offer the newest.
    if (cached) {
      cleanupInstallerFile(cached.installerPath);
      clearPendingState();
    }
    downloadedInstallerPath = null;

    const alreadyKnown =
      (currentStatus.phase === 'available' || currentStatus.phase === 'downloaded') &&
      currentStatus.availableVersion === release.version;

    pendingAvailableVersion = release.version;
    pendingDownloadUrl = release.downloadUrl;
    emitStatus({
      phase: 'available',
      availableVersion: release.version,
      error: undefined,
      progress: undefined,
      installerPath: undefined,
    });

    if (!manual && !alreadyKnown && lastNotifiedVersion !== release.version) {
      lastNotifiedVersion = release.version;
      notifyUpdateAvailable(release.version);
    }
  } catch (err) {
    if (manual) {
      emitStatus({
        phase: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } finally {
    checkInFlight = false;
  }

  return currentStatus;
}

export async function downloadUpdate(): Promise<UpdateStatusPayload> {
  if (!app.isPackaged) return currentStatus;
  if (downloadInFlight || installingUpdate || currentStatus.phase === 'downloading') {
    return currentStatus;
  }
  downloadInFlight = true;

  const version = pendingAvailableVersion ?? currentStatus.availableVersion;
  const url = pendingDownloadUrl;

  if (!version || !url) {
    const en = updaterLang() === 'en';
    emitStatus({
      phase: 'error',
      error: en ? 'No update available to download' : 'Нет доступного обновления для загрузки',
    });
    await showErrorAndOpenFolder(
      en
        ? 'No update file to download. Check for updates again.'
        : 'Нет файла обновления для загрузки. Проверьте обновления ещё раз.',
      updatesDir(),
    );
    downloadInFlight = false;
    return currentStatus;
  }

  try {
    if (downloadedInstallerPath && isValidInstaller(downloadedInstallerPath)) {
      emitStatus({
        phase: 'downloaded',
        availableVersion: version,
        progress: 100,
        error: undefined,
        installerPath: downloadedInstallerPath,
      });
      const en = updaterLang() === 'en';
      await showInfo(
        en ? 'PawLink — update' : 'PawLink — обновление',
        en
          ? `Version ${version} is already downloaded.\nPress Install when you are ready.`
          : `Версия ${version} уже загружена.\nНажмите «Установить», когда будете готовы.`,
      );
      return currentStatus;
    }

    emitStatus({
      phase: 'downloading',
      progress: 0,
      error: undefined,
      availableVersion: version,
    });

    downloadedInstallerPath = await downloadInstaller(url, version);
    savePendingState({
      version,
      installerPath: downloadedInstallerPath,
      downloadUrl: url,
    });
    emitStatus({
      phase: 'downloaded',
      availableVersion: version,
      progress: 100,
      error: undefined,
      installerPath: downloadedInstallerPath,
    });
    notifyUpdateReady(version);
    {
      const en = updaterLang() === 'en';
      await showInfo(
        en ? 'PawLink — update' : 'PawLink — обновление',
        en
          ? `Version ${version} downloaded successfully.\nPress Install to start the setup wizard.`
          : `Версия ${version} успешно загружена.\nНажмите «Установить», чтобы запустить мастер установки.`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitStatus({
      phase: 'error',
      error: message,
      availableVersion: version,
    });
    const en = updaterLang() === 'en';
    await showErrorAndOpenFolder(
      en ? `Failed to download update.\n${message}` : `Не удалось скачать обновление.\n${message}`,
      updatesDir(),
    );
  } finally {
    downloadInFlight = false;
  }

  return currentStatus;
}

export async function installUpdate(): Promise<void> {
  if (!app.isPackaged) return;
  if (installingUpdate || downloadInFlight || dialogBusy) return;

  const pending = loadPendingState();
  const installerPath = downloadedInstallerPath ?? pending?.installerPath ?? null;
  const version = pendingAvailableVersion ?? pending?.version ?? currentStatus.availableVersion ?? '';

  if (!installerPath || !isValidInstaller(installerPath)) {
    const en = updaterLang() === 'en';
    emitStatus({
      phase: 'error',
      error: en ? 'Installer file not found' : 'Файл установщика не найден',
    });
    await showErrorAndOpenFolder(
      en ? 'Update file not found or corrupted.' : 'Файл обновления не найден или повреждён.',
      updatesDir(),
    );
    return;
  }

  const en = updaterLang() === 'en';
  const confirmOpts = {
    type: 'question' as const,
    title: en ? 'PawLink — install update' : 'PawLink — установка обновления',
    message: en
      ? `Install version ${version || 'new'}?`
      : `Установить версию ${version || 'новую'}?`,
    detail: en
      ? 'The setup wizard will open. PawLink will quit so files can be updated.\nAfter setup, launch the app again.'
      : 'Откроется мастер установки. PawLink закроется, чтобы файлы можно было обновить.\nПосле установки запустите приложение снова.',
    buttons: en ? ['Install', 'Cancel'] : ['Установить', 'Отмена'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  };
  const win = parentWindow();
  const confirm = win
    ? await dialog.showMessageBox(win, confirmOpts)
    : await dialog.showMessageBox(confirmOpts);

  if (confirm.response !== 0) return;

  emitStatus({
    phase: 'installing',
    availableVersion: version || undefined,
    installerPath,
    error: undefined,
  });

  // Quit first, then start setup (helper waits for this PID to exit).
  const started = scheduleInstallerAfterExit(installerPath);
  if (!started) {
    installingUpdate = false;
    emitStatus({
      phase: 'downloaded',
      availableVersion: version || undefined,
      installerPath,
      error: en ? 'Failed to launch installer' : 'Не удалось запустить установщик',
    });
    await showErrorAndOpenFolder(
      en ? 'Failed to launch the update installer.' : 'Не удалось запустить установщик обновления.',
      installerPath,
    );
    return;
  }

  installingUpdate = true;
  // Let cmd/start fully detach the helper before we tear down the process/job.
  await new Promise((resolve) => setTimeout(resolve, 400));
  try {
    if (quitForInstall) {
      await quitForInstall();
    } else {
      app.exit(0);
    }
  } catch {
    app.exit(0);
  }
}

export function addUpdateSubscriber(): void {
  subscriberCount += 1;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pawlink:update-status', currentStatus);
  }
}

export function removeUpdateSubscriber(): void {
  subscriberCount = Math.max(0, subscriberCount - 1);
}
