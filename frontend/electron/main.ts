import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  dialog,
  session,
  Tray,
  Menu,
  nativeImage,
  Notification,
} from 'electron';
import { spawn, ChildProcess, execFileSync, type SpawnOptions } from 'child_process';
import { randomBytes } from 'crypto';
import net from 'net';
import os from 'os';
import path from 'path';
import fs from 'fs';
import {
  applyAutostart,
  AUTOSTART_FLAG,
  getAutostartInfrastructureStatus,
  getPreferences,
  isAutostartLaunch,
  loadPreferences,
  removeAutostartInfrastructure,
  restoreAutostartInfrastructure,
  savePreferences,
  scrubOrphanElectronAutostart,
  type AppPreferences,
} from './preferences';
import {
  addUpdateSubscriber,
  applyAutoUpdateSchedule,
  bindQuitForInstall,
  bindUpdaterWindow,
  checkForUpdates,
  downloadUpdate,
  getUpdateStatus,
  initAutoUpdater,
  installUpdate,
  isInstallingUpdate,
  openUpdateLocation,
  removeUpdateSubscriber,
  stopAutoUpdateSchedule,
} from './updater';
import {
  applySubscriptionRefreshSchedule,
  initSubscriptionRefresh,
  stopSubscriptionRefresh,
} from './subscriptionRefresh';
import { createLogPump, MAX_LOG_LINES } from './logBuffer';
import { pollUntil, pollUntilOrThrow } from './pollUntil';
import {
  emergencyRuntimeCleanup,
  freeTcpPort,
  waitForProcessExit,
} from './runtimeCleanup';

const isPackaged = app.isPackaged;
const DEFAULT_DEV_SERVER = 'http://127.0.0.1:5173';
const BACKEND_PORT = 8765;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const BACKEND_TOKEN = randomBytes(32).toString('hex');
const BACKEND_STARTUP_TIMEOUT_MS = 45_000;
const DEV_URL_FLAG = '--pawlink-dev-url=';
const HANDOFF_FLAG = '--pawlink-handoff=';
/** Hide console window for child processes on Windows. */
const CREATE_NO_WINDOW = 0x0800_0000;

function isHandoffLaunch(): boolean {
  return process.argv.some((a) => a.startsWith(HANDOFF_FLAG));
}

// Acknowledge elevate-handoff as early as possible so the parent can exit cleanly.
// Do NOT kill other instances here — the old process quits itself after handoff.
(() => {
  const arg = process.argv.find((a) => a.startsWith(HANDOFF_FLAG));
  if (!arg) return;
  try {
    fs.writeFileSync(arg.slice(HANDOFF_FLAG.length), String(process.pid), 'utf8');
  } catch {
    // ignore
  }
})();

// Limit WebRTC host-candidate leaks inside the Electron UI (Chrome policy).
app.commandLine.appendSwitch(
  'force-webrtc-ip-handling-policy',
  'disable_non_proxied_udp',
);
const APP_ICON_CACHE_MAX = 80;
const appIconCache = new Map<string, string | null>();
const runtimeLogs: string[] = [];
const logPump = createLogPump({
  buffer: runtimeLogs,
  maxLines: MAX_LOG_LINES,
  onBatch: (lines) => {
    if (!mainWindow || mainWindow.isDestroyed() || lines.length === 0) return;
    mainWindow.webContents.send('pawlink:log-batch', lines);
  },
});

if (!app.isPackaged) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let backendProcess: ChildProcess | null = null;
let resolvedPython: string | null = null;
let backendStartupLog = '';
let isQuitting = false;
let cachedWindowIcon: Electron.NativeImage | null = null;
let cachedTrayIconOff: Electron.NativeImage | null = null;
let cachedTrayIconConnecting: Electron.NativeImage | null = null;
let cachedTrayIconConnected: Electron.NativeImage | null = null;
let lastTrayState: TrayVpnState | null = null;
let trayAnimTimer: ReturnType<typeof setInterval> | null = null;
let trayAnimFrame = 0;

type TrayVpnState = 'off' | 'connecting' | 'on';

function trimAppIconCache(): void {
  while (appIconCache.size > APP_ICON_CACHE_MAX) {
    const oldest = appIconCache.keys().next().value;
    if (oldest === undefined) break;
    appIconCache.delete(oldest);
  }
}

function pushRuntimeLog(line: string): void {
  logPump.push(line);
}

function removeStaleBackendLogFile(): void {
  try {
    const logPath = path.join(app.getPath('userData'), 'backend.log');
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }
  } catch {
    // ignore — leftover file is best-effort cleanup
  }
  try {
    const cwdLog = path.join(process.cwd(), 'backend.log');
    if (fs.existsSync(cwdLog)) {
      fs.unlinkSync(cwdLog);
    }
  } catch {
    // ignore
  }
}

/** Wait until Explorer/shell is running — needed for tray after logon autostart. */
async function waitForShellReady(): Promise<void> {
  if (process.platform !== 'win32' || !isAutostartLaunch()) return;

  try {
    await pollUntilOrThrow(
      () => {
        try {
          const out = execFileSync(
            'tasklist',
            ['/FI', 'IMAGENAME eq explorer.exe', '/FO', 'CSV', '/NH'],
            { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
          );
          return /explorer\.exe/i.test(out);
        } catch {
          return false;
        }
      },
      () => new Error('shell wait timed out'),
      400,
      90_000,
    );
    pushRuntimeLog('[Electron] Shell ready (explorer.exe)');
  } catch {
    pushRuntimeLog('[Electron] Shell wait timed out — continuing autostart');
  }
}

function isDevMode(): boolean {
  return !isPackaged;
}

function getDevServerUrl(): string {
  const fromArg = process.argv.find((arg) => arg.startsWith(DEV_URL_FLAG));
  if (fromArg) return fromArg.slice(DEV_URL_FLAG.length);
  return process.env.VITE_DEV_SERVER_URL ?? DEFAULT_DEV_SERVER;
}

function getAppRoot(): string {
  if (isPackaged) {
    return path.dirname(process.execPath);
  }
  return path.resolve(__dirname, '..');
}

function getBackendPath(): string {
  if (!isPackaged) {
    return path.resolve(__dirname, '../../backend');
  }
  return path.join(process.resourcesPath, 'backend');
}

function getPythonExecutable(): string {
  if (resolvedPython) return resolvedPython;

  const bundledPythonw = path.join(process.resourcesPath || '', 'python', 'pythonw.exe');
  if (fs.existsSync(bundledPythonw)) {
    resolvedPython = bundledPythonw;
    return resolvedPython;
  }
  const bundledPython = path.join(process.resourcesPath || '', 'python', 'python.exe');
  if (fs.existsSync(bundledPython)) {
    resolvedPython = bundledPython;
    return resolvedPython;
  }

  // Prefer pythonw.exe so Windows never flashes a console for the backend.
  for (const candidate of ['pythonw', 'python', 'python3', 'py']) {
    try {
      const output = execFileSync('where.exe', [candidate], {
        encoding: 'utf8',
        windowsHide: true,
      }).trim();
      const first = output.split(/\r?\n/).find(Boolean);
      if (first && fs.existsSync(first)) {
        resolvedPython = first;
        return resolvedPython;
      }
    } catch {
      // try next candidate
    }
  }

  resolvedPython = process.platform === 'win32' ? 'pythonw' : 'python';
  return resolvedPython;
}

function setupContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...(details.responseHeaders ?? {}) };

    if (isPackaged) {
      responseHeaders['Content-Security-Policy'] = [
        [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "connect-src 'self' http://127.0.0.1:8765",
          "img-src 'self' data:",
          "font-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'none'",
          "frame-ancestors 'none'",
        ].join('; '),
      ];
    } else {
      const devOrigin = new URL(getDevServerUrl()).origin;
      const devWs = devOrigin.replace(/^http/, 'ws');
      responseHeaders['Content-Security-Policy'] = [
        [
          `default-src 'self' ${devOrigin} ${devWs}`,
          `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${devOrigin}`,
          `style-src 'self' 'unsafe-inline' ${devOrigin}`,
          `connect-src 'self' http://127.0.0.1:8765 ${devOrigin} ${devWs}`,
          `img-src 'self' data: ${devOrigin}`,
          "font-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
        ].join('; '),
      ];
    }

    callback({ responseHeaders });
  });
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function freeBackendPort(port: number): Promise<void> {
  await freeTcpPort(port, pushRuntimeLog);
}

/** Graceful backend stop — waits for shutdown ack and process exit, no fixed timers. */
async function stopBackend(options?: {
  freePort?: boolean;
  emergencyCleanup?: boolean;
}): Promise<void> {
  const freePort = options?.freePort ?? true;
  const emergencyCleanup = options?.emergencyCleanup ?? true;
  const proc = backendProcess;
  if (!proc) {
    if (freePort) await freeBackendPort(BACKEND_PORT);
    if (emergencyCleanup) await emergencyRuntimeCleanup(pushRuntimeLog);
    return;
  }
  backendProcess = null;

  let shutdownAck = false;
  try {
    const response = await fetch(`${BACKEND_URL}/api/shutdown`, {
      method: 'POST',
      headers: { 'X-PawLink-Token': BACKEND_TOKEN },
    });
    shutdownAck = response.ok;
  } catch {
    // backend unreachable — force-kill below
  }

  if (!shutdownAck) {
    pushRuntimeLog('[Electron] Backend shutdown request failed — forcing stop');
    try {
      proc.kill();
    } catch {
      // ignore
    }
  }

  await waitForProcessExit(proc);

  if (freePort) await freeBackendPort(BACKEND_PORT);
  if (emergencyCleanup) await emergencyRuntimeCleanup(pushRuntimeLog);
}

async function startBackend(): Promise<void> {
  if (backendProcess) return;

  backendStartupLog = '';
  pushRuntimeLog('[Electron] Starting backend…');
  // Only free the API port at startup — mihomo ports are handled when VPN starts.
  await freeBackendPort(BACKEND_PORT);

  const backendDir = getBackendPath();
  const python = getPythonExecutable();
  const script = path.join(backendDir, 'pawlink', 'main.py');

  if (!fs.existsSync(script)) {
    throw new Error(
      `Backend not found: ${script}. ` +
        (isDevMode()
          ? 'Run npm run dev from the frontend folder.'
          : 'Reinstall PawLink.'),
    );
  }

  // In-memory only — never write backend.log (avoids unbounded junk files).
  removeStaleBackendLogFile();

  const spawnOpts: SpawnOptions & { creationflags?: number } = {
    cwd: backendDir,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PYTHONPATH: backendDir,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONLEGACYWINDOWSSTDIO: 'utf-8',
      PAWLINK_API_TOKEN: BACKEND_TOKEN,
      PAWLINK_QUIET: '1',
    },
  };
  if (process.platform === 'win32') {
    spawnOpts.creationflags = CREATE_NO_WINDOW;
  }

  pushRuntimeLog(`[Electron] python=${python}`);
  const proc = spawn(
    python,
    [script, '--host', '127.0.0.1', '--port', String(BACKEND_PORT)],
    spawnOpts,
  );
  backendProcess = proc;

  const appendBackendLog = (chunk: Buffer | string) => {
    const line = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    backendStartupLog = `${backendStartupLog}${line}`.slice(-4000);
    pushRuntimeLog(line);
  };

  proc.stdout?.on('data', appendBackendLog);
  proc.stderr?.on('data', appendBackendLog);
  proc.on('error', (error) => {
    appendBackendLog(`Backend process could not be started: ${error}\n`);
    backendProcess = null;
  });
  proc.on('close', (code) => {
    appendBackendLog(`Backend exited with code ${code}\n`);
    backendProcess = null;
  });

  await waitForBackend();
  pushRuntimeLog('[Electron] Backend ready');
}

function waitForBackend(timeoutMs = BACKEND_STARTUP_TIMEOUT_MS): Promise<void> {
  const start = Date.now();
  return pollUntilOrThrow(
    async () => {
      if (backendProcess === null) {
        const tail = backendStartupLog.trim().split(/\r?\n/).slice(-3).join(' | ');
        throw new Error(
          `Backend process exited before startup (python: ${getPythonExecutable()}). ${tail}`,
        );
      }
      try {
        const res = await fetch(`${BACKEND_URL}/api/health`, {
          headers: { 'X-PawLink-Token': BACKEND_TOKEN },
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    () => {
      const tail = backendStartupLog.trim().split(/\r?\n/).slice(-3).join(' | ');
      return new Error(
        `Backend startup timeout after ${Math.round((Date.now() - start) / 1000)}s (port ${BACKEND_PORT}). ${tail}`,
      );
    },
    100,
    timeoutMs,
  );
}

function isProcessElevated(): boolean {
  if (process.platform !== 'win32') return true;
  try {
    execFileSync('net', ['session'], { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function vbsQuote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Quote a single argv token for ShellExecute lpParameters. */
function shellExecuteArg(value: string): string {
  if (value.length === 0) return '""';
  if (!/[ \t"]/.test(value)) return value;
  return `"${value.replace(/(["\\])/g, '\\$1')}"`;
}

/**
 * Terminate other app *main* processes (not our GPU/renderer children).
 * Uses WMI via wscript — no PowerShell window.
 */
function killOtherAppInstances(): number {
  if (process.platform !== 'win32') return 0;
  const myPid = process.pid;
  const exeName = isPackaged ? path.basename(process.execPath) : 'electron.exe';
  // Dev: frontend/dist-electron → ../../scripts; packaged optional extraResource.
  const candidates = [
    path.resolve(__dirname, '../../scripts/kill-other-instances.vbs'),
    path.join(getAppRoot(), '..', 'scripts', 'kill-other-instances.vbs'),
    path.join(process.resourcesPath || '', 'scripts', 'kill-other-instances.vbs'),
  ];
  const vbs = candidates.find((p) => p && fs.existsSync(p));
  if (!vbs) return 0;

  const args = [String(myPid), exeName];
  if (!isPackaged) args.push(getAppRoot());

  try {
    // cscript (not wscript) so WScript.Echo is captured; windowsHide = no window.
    const out = execFileSync('cscript.exe', ['//Nologo', vbs, ...args], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 20_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const n = Number.parseInt(String(out).trim().split(/\r?\n/).pop() || '', 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function focusExistingInstance(): void {
  showMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.setSkipTaskbar(false);
  mainWindow.show();
  mainWindow.focus();
  if (process.platform === 'win32') {
    mainWindow.setAlwaysOnTop(true);
    mainWindow.setAlwaysOnTop(false);
  }
}

function buildElevatedLaunchArgs(handoffPath: string): string[] {
  const autostartArg = isAutostartLaunch() ? [AUTOSTART_FLAG] : [];
  // Keep argv minimal — Cyrillic/extra flags break ShellExecute quoting.
  if (!isDevMode()) {
    return [...autostartArg, `${HANDOFF_FLAG}${handoffPath}`];
  }
  return [
    getAppRoot(),
    `${DEV_URL_FLAG}http://127.0.0.1:5173`,
    ...autostartArg,
    `${HANDOFF_FLAG}${handoffPath}`,
  ];
}

function tcpPortOpen(host: string, port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function waitForHandoffFile(handoffPath: string, cancelAfterMs: number): Promise<void> {
  const fileName = path.basename(handoffPath);
  const dir = path.dirname(handoffPath);

  return new Promise((resolve, reject) => {
    const finish = (ok: boolean, err?: Error) => {
      cleanup();
      if (ok) {
        try {
          fs.unlinkSync(handoffPath);
        } catch {
          // ignore
        }
        resolve();
        return;
      }
      reject(err ?? new Error('UAC handoff failed'));
    };

    if (fs.existsSync(handoffPath)) {
      finish(true);
      return;
    }

    let watcher: fs.FSWatcher | null = null;
    let cancelTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      watcher?.close();
      if (cancelTimer) clearTimeout(cancelTimer);
    };

    try {
      watcher = fs.watch(dir, (_event, name) => {
        if (name === fileName && fs.existsSync(handoffPath)) {
          finish(true);
        }
      });
    } catch {
      void pollUntil(() => fs.existsSync(handoffPath), 100)
        .then(() => finish(true))
        .catch((err: Error) => finish(false, err));
    }

    cancelTimer = setTimeout(() => {
      finish(
        false,
        new Error('Не удалось запустить от администратора (UAC отклонён или таймаут)'),
      );
    }, cancelAfterMs);
  });
}

async function loadRenderer(win: BrowserWindow): Promise<void> {
  if (!isDevMode()) {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    return;
  }

  const url = getDevServerUrl().replace('://localhost', '://127.0.0.1');
  let port = 5173;
  try {
    port = Number(new URL(url).port || 5173);
  } catch {
    port = 5173;
  }

  const distIndex = path.join(__dirname, '../dist/index.html');
  await pollUntil(async () => {
    if (await tcpPortOpen('127.0.0.1', port)) return true;
    return fs.existsSync(distIndex);
  });

  if (await tcpPortOpen('127.0.0.1', port)) {
    await win.loadURL(url);
    return;
  }

  if (fs.existsSync(distIndex)) {
    pushRuntimeLog('[Electron] Vite unavailable — falling back to dist/index.html');
    await win.loadFile(distIndex);
    return;
  }

  throw new Error(`Vite не отвечает на ${url}. Перезапустите npm run dev в папке frontend.`);
}

/**
 * Relaunch elevated via Shell.Application (UAC) — no PowerShell console.
 * Waits until the elevated process writes the handoff file.
 */
async function relaunchElevated(): Promise<void> {
  const exe = process.execPath;
  const appRoot = getAppRoot();
  const handoffPath = path.join(
    os.tmpdir(),
    `pawlink-handoff-${process.pid}-${randomBytes(6).toString('hex')}.ok`,
  );
  try {
    fs.unlinkSync(handoffPath);
  } catch {
    // ignore
  }

  // In dev, Vite must already be up — elevated window loads it.
  if (isDevMode()) {
    const up = await tcpPortOpen('127.0.0.1', 5173, 800);
    if (!up) {
      throw new Error('Сначала должен работать Vite (npm run dev). Порт 5173 закрыт.');
    }
  }

  const args = buildElevatedLaunchArgs(handoffPath);
  const params = args.map(shellExecuteArg).join(' ');
  const vbsPath = path.join(os.tmpdir(), `pawlink-elevate-${process.pid}.vbs`);
  const vbs = [
    'Set shell = CreateObject("Shell.Application")',
    `shell.ShellExecute ${vbsQuote(exe)}, ${vbsQuote(params)}, ${vbsQuote(appRoot)}, "runas", 1`,
  ].join('\r\n');

  fs.writeFileSync(vbsPath, `\uFEFF${vbs}\r\n`, 'utf16le');
  try {
    execFileSync('wscript.exe', ['//B', '//Nologo', vbsPath], {
      windowsHide: true,
      stdio: 'ignore',
      timeout: 30_000,
    });
  } catch {
    try {
      fs.unlinkSync(vbsPath);
    } catch {
      // ignore
    }
    throw new Error('Не удалось показать запрос UAC');
  }

  try {
    await waitForHandoffFile(handoffPath, 120_000);
  } finally {
    try {
      fs.unlinkSync(vbsPath);
    } catch {
      // ignore
    }
  }
}

function getAppIconCandidates(): string[] {
  return [
    // Prefer ICO for Windows shell surfaces, then the shared brand PNG.
    path.join(__dirname, 'icon.ico'),
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../assets/icon.ico'),
    path.join(__dirname, 'icon.png'),
    path.join(__dirname, '../assets/icon.png'),
    path.join(__dirname, '../assets/tray-icon.png'),
    path.join(__dirname, '../src/assets/brand-icon.png'),
    path.join(process.resourcesPath || '', 'assets', 'icon.ico'),
    path.join(process.resourcesPath || '', 'assets', 'icon.png'),
    path.join(app.getAppPath(), 'assets', 'icon.ico'),
    path.join(app.getAppPath(), 'assets', 'icon.png'),
  ];
}

function getTrayAssetCandidates(fileName: string): string[] {
  return [
    path.join(__dirname, fileName),
    path.join(__dirname, '../assets', fileName),
    path.join(process.resourcesPath || '', 'assets', fileName),
    path.join(app.getAppPath(), 'assets', fileName),
  ];
}

function getConnectedTrayCandidates(): string[] {
  return getTrayAssetCandidates('tray-icon-connected.png');
}

function getConnectingTrayCandidates(): string[] {
  return getTrayAssetCandidates('tray-icon-connecting.png');
}

function getOffTrayCandidates(): string[] {
  return getTrayAssetCandidates('tray-icon-off.png');
}

function getAppIconPath(): string {
  for (const candidate of getAppIconCandidates()) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return '';
}

function getWindowIcon(): Electron.NativeImage {
  if (cachedWindowIcon && !cachedWindowIcon.isEmpty()) return cachedWindowIcon;
  for (const candidate of getAppIconCandidates()) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    const icon = loadNativeImage(candidate);
    if (!icon.isEmpty()) {
      cachedWindowIcon = icon;
      return icon;
    }
  }
  cachedWindowIcon = createFallbackTrayIcon();
  return cachedWindowIcon;
}

/** Prefer buffer load — createFromPath often returns empty on Windows Unicode paths. */
function loadNativeImage(filePath: string): Electron.NativeImage {
  try {
    const buf = fs.readFileSync(filePath);
    const fromBuf = nativeImage.createFromBuffer(buf);
    if (!fromBuf.isEmpty()) return fromBuf;
  } catch {
    // fall through
  }
  try {
    const fromPath = nativeImage.createFromPath(filePath);
    if (!fromPath.isEmpty()) return fromPath;
  } catch {
    // fall through
  }
  return nativeImage.createEmpty();
}

function createFallbackTrayIcon(): Electron.NativeImage {
  // Opaque purple 32×32 PNG (no alpha issues in Windows tray).
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALklEQVR42u3OIQEAAAgDsAenAaFPDMzE/LLTfoqAgICAgICAgICAgICAgMB34ABG7RS1eKnc7AAAAABJRU5ErkJggg==',
    'base64',
  );
  const img = nativeImage.createFromBuffer(png);
  if (!img.isEmpty()) return img;

  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    const o = i * 4;
    buf[o] = 0xff; // B
    buf[o + 1] = 0x7c; // G
    buf[o + 2] = 0x8b; // R
    buf[o + 3] = 0xff; // A
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function prepareTrayImage(icon: Electron.NativeImage): Electron.NativeImage {
  const size = process.platform === 'win32' ? 32 : 22;
  const resized = icon.resize({ width: size, height: size, quality: 'best' });
  try {
    const png = resized.toPNG();
    const flat = nativeImage.createFromBuffer(png);
    if (!flat.isEmpty()) return flat;
  } catch {
    // ignore
  }
  return resized.isEmpty() ? createFallbackTrayIcon() : resized;
}

function loadBaseTrayPaw(): Electron.NativeImage {
  for (const candidate of getTrayAssetCandidates('tray-icon.png')) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    const icon = loadNativeImage(candidate);
    if (!icon.isEmpty()) return icon;
  }
  for (const candidate of getAppIconCandidates().filter((p) => p.toLowerCase().endsWith('.png'))) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    const icon = loadNativeImage(candidate);
    if (!icon.isEmpty()) return icon;
  }
  return createFallbackTrayIcon();
}
function loadTraySource(state: TrayVpnState): Electron.NativeImage {
  const candidates =
    state === 'on'
      ? [
          ...getConnectedTrayCandidates(),
          ...getAppIconCandidates().filter((p) => p.toLowerCase().endsWith('.png')),
        ]
      : state === 'connecting'
        ? [
            ...getConnectingTrayCandidates(),
            ...getOffTrayCandidates(),
            ...getAppIconCandidates().filter((p) => p.toLowerCase().endsWith('.png')),
          ]
        : [
            ...getOffTrayCandidates(),
            ...getAppIconCandidates().filter((p) => p.toLowerCase().endsWith('.png')),
          ];

  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    const icon = loadNativeImage(candidate);
    if (!icon.isEmpty()) return icon;
  }
  return createFallbackTrayIcon();
}

/** Draw a large status badge when dedicated tray assets are missing. */
function drawTrayStatusBadge(
  source: Electron.NativeImage,
  fill: [number, number, number],
  ring: [number, number, number, number],
  alpha = 1,
): Electron.NativeImage {
  try {
    const size = 32;
    const resized = source.resize({ width: size, height: size, quality: 'best' });
    const { width, height } = resized.getSize();
    const bgra = Buffer.from(resized.toBitmap());
    const radius = Math.max(5, Math.round(size * 0.19));
    const cx = width - radius - Math.round(width * 0.04);
    const cy = height - radius - Math.round(height * 0.04);
    const r2 = radius * radius;
    const ringOuter = radius + 2;
    const ringOuter2 = ringOuter * ringOuter;

    for (let y = Math.floor(cy - ringOuter); y <= Math.ceil(cy + ringOuter); y += 1) {
      for (let x = Math.floor(cx - ringOuter); x <= Math.ceil(cx + ringOuter); x += 1) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > ringOuter2) continue;
        const i = (y * width + x) * 4;
        const color = d2 <= r2 ? fill : ring.slice(0, 3) as [number, number, number];
        const a = d2 <= r2 ? Math.round(255 * alpha) : ring[3];
        bgra[i] = color[2];
        bgra[i + 1] = color[1];
        bgra[i + 2] = color[0];
        bgra[i + 3] = a;
      }
    }
    return nativeImage.createFromBitmap(bgra, { width, height });
  } catch {
    return source;
  }
}

function hasTrayAsset(candidates: string[]): boolean {
  return candidates.some((p) => p && fs.existsSync(p));
}

function getTrayIcon(state: TrayVpnState, pulse = 1): Electron.NativeImage {
  const ring: [number, number, number, number] = [15, 23, 42, 255];
  const baseIdle = () => {
    if (cachedTrayIconOff && pulse >= 0.99 && pulse <= 1.01) return cachedTrayIconOff;
    let icon = loadTraySource('off');
    if (!hasTrayAsset(getOffTrayCandidates())) {
      icon = drawTrayStatusBadge(loadBaseTrayPaw(), [239, 68, 68], ring);
    }
    const prepared = prepareTrayImage(icon);
    if (pulse >= 0.99 && pulse <= 1.01) cachedTrayIconOff = prepared;
    return prepared;
  };

  if (state === 'off') return baseIdle();

  if (state === 'on') {
    if (cachedTrayIconConnected && pulse >= 0.99) return cachedTrayIconConnected;
    let icon = loadTraySource('on');
    if (!hasTrayAsset(getConnectedTrayCandidates())) {
      icon = drawTrayStatusBadge(loadBaseTrayPaw(), [34, 197, 94], ring);
    }
    cachedTrayIconConnected = prepareTrayImage(icon);
    return cachedTrayIconConnected;
  }

  // connecting — pulse badge brightness for a subtle tray animation
  let icon = loadTraySource('connecting');
  if (!hasTrayAsset(getConnectingTrayCandidates())) {
    icon = drawTrayStatusBadge(loadBaseTrayPaw(), [251, 191, 36], ring, pulse);
  } else if (pulse < 1) {
    icon = drawTrayStatusBadge(icon, [251, 191, 36], ring, pulse);
  }
  return prepareTrayImage(icon);
}

function showMainWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.setSkipTaskbar(false);
  mainWindow.show();
  mainWindow.focus();
}

async function fetchCoreStatus(): Promise<{
  running: boolean;
  starting: boolean;
  phase?: string;
}> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/core/status`, {
      headers: { 'X-PawLink-Token': BACKEND_TOKEN },
    });
    if (!res.ok) return { running: false, starting: false };
    const data = (await res.json()) as {
      core_running?: boolean;
      core_starting?: boolean;
      connection_phase?: string;
    };
    return {
      running: Boolean(data.core_running),
      starting: Boolean(data.core_starting),
      phase: data.connection_phase,
    };
  } catch {
    return { running: false, starting: false };
  }
}

function resolveTrayState(status: {
  running: boolean;
  starting: boolean;
  phase?: string;
}): TrayVpnState {
  const phase = status.phase;
  if (phase === 'connected') return 'on';
  if (phase === 'connecting' || phase === 'reconnecting' || phase === 'no_link') {
    return 'connecting';
  }
  if (status.running) return 'on';
  if (status.starting) return 'connecting';
  return 'off';
}

function trayTooltipForState(
  state: TrayVpnState,
  phase?: string,
): string {
  const en = getPreferences().language === 'en';
  if (phase === 'no_link') {
    return en ? 'PawLink — connection lost' : 'PawLink — пропало соединение';
  }
  if (phase === 'reconnecting') {
    return en ? 'PawLink — reconnecting…' : 'PawLink — переподключение…';
  }
  if (state === 'on') return en ? 'PawLink — VPN on' : 'PawLink — VPN включён';
  if (state === 'connecting') return en ? 'PawLink — connecting…' : 'PawLink — подключение VPN…';
  return en ? 'PawLink — VPN off' : 'PawLink — VPN выключен';
}

function stopTrayAnimation(): void {
  if (trayAnimTimer) {
    clearInterval(trayAnimTimer);
    trayAnimTimer = null;
  }
  trayAnimFrame = 0;
}

function startTrayAnimation(): void {
  if (trayAnimTimer || !tray) return;
  trayAnimTimer = setInterval(() => {
    if (!tray || lastTrayState !== 'connecting') {
      stopTrayAnimation();
      return;
    }
    trayAnimFrame = (trayAnimFrame + 1) % 20;
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin((trayAnimFrame / 20) * Math.PI * 2));
    try {
      tray.setImage(getTrayIcon('connecting', pulse));
    } catch {
      // ignore
    }
  }, 120);
}

function scheduleTrayRefresh(delayMs: number): void {
  if (trayRefreshTimer) clearTimeout(trayRefreshTimer);
  trayRefreshTimer = setTimeout(() => {
    trayRefreshTimer = null;
    void updateTrayMenu();
  }, delayMs);
}

const TRAY_CONNECT_STAGE_RU: Record<string, string> = {
  precheck: 'Проверка перед подключением',
  binaries: 'Загрузка компонентов',
  ports: 'Выбор портов',
  config: 'Сборка конфигурации',
  mihomo_start: 'Запуск ядра mihomo',
  mihomo_ready: 'Ожидание готовности ядра',
  capture: 'Настройка перехвата трафика',
  unknown: 'Неизвестная ошибка',
};

const TRAY_CONNECT_STAGE_EN: Record<string, string> = {
  precheck: 'Pre-connection checks',
  binaries: 'Downloading components',
  ports: 'Port allocation',
  config: 'Building configuration',
  mihomo_start: 'Starting mihomo core',
  mihomo_ready: 'Waiting for core readiness',
  capture: 'Traffic capture setup',
  unknown: 'Unknown error',
};

function formatTrayConnectFailure(stage: string, message: string, language: 'ru' | 'en'): string {
  const labels = language === 'en' ? TRAY_CONNECT_STAGE_EN : TRAY_CONNECT_STAGE_RU;
  const stageLabel = labels[stage] ?? labels.unknown;
  return language === 'en'
    ? `${stageLabel}: ${message}`
    : `${stageLabel}: ${message}`;
}

function showDesktopNotification(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  new Notification({ title, body }).show();
}

async function parseConnectFailureResponse(res: Response): Promise<{ stage: string; message: string } | null> {
  if (res.ok) return null;
  const text = await res.text().catch(() => '');
  try {
    const payload = JSON.parse(text) as { detail?: unknown };
    const detail = payload.detail;
    if (detail && typeof detail === 'object' && 'stage' in detail && 'message' in detail) {
      const row = detail as { stage?: unknown; message?: unknown };
      if (typeof row.stage === 'string' && typeof row.message === 'string') {
        return { stage: row.stage, message: row.message };
      }
    }
    if (typeof detail === 'string' && detail.trim()) {
      return { stage: 'unknown', message: detail.trim() };
    }
  } catch {
    // ignore JSON parse errors
  }
  return { stage: 'unknown', message: text || res.statusText || 'Connect failed' };
}

async function toggleCoreFromTray(): Promise<void> {
  const status = await fetchCoreStatus();
  // During connect, tray click cancels (stop) instead of being ignored.
  const endpoint =
    status.starting || status.running ? '/api/core/stop' : '/api/core/start';
  try {
    const res = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'X-PawLink-Token': BACKEND_TOKEN },
    });
    if (!res.ok && endpoint.endsWith('/start')) {
      const failure = await parseConnectFailureResponse(res);
      if (failure) {
        const language = getPreferences().language;
        const title =
          language === 'en' ? 'Failed to connect VPN' : 'Не удалось подключиться к VPN';
        showDesktopNotification(
          title,
          formatTrayConnectFailure(failure.stage, failure.message, language),
        );
      }
    }
  } catch {
    const language = getPreferences().language;
    showDesktopNotification(
      language === 'en' ? 'Failed to connect VPN' : 'Не удалось подключиться к VPN',
      language === 'en' ? 'Backend is unavailable' : 'Сервер PawLink недоступен',
    );
  }
  scheduleTrayRefresh(0);
}

async function updateTrayMenu(): Promise<void> {
  if (!tray) return;
  const status = await fetchCoreStatus();
  const vpnState = resolveTrayState(status);

  if (lastTrayState !== vpnState) {
    lastTrayState = vpnState;
    try {
      tray.setImage(getTrayIcon(vpnState));
    } catch {
      // ignore icon swap errors
    }
  }

  // Pulse only while connecting/reconnecting — static amber for no_link.
  if (
    vpnState === 'connecting' &&
    status.phase !== 'no_link'
  ) {
    startTrayAnimation();
  } else {
    stopTrayAnimation();
  }

  const en = getPreferences().language === 'en';
  const needsRetry =
    !status.running &&
    (status.phase === 'no_link' || status.phase === 'reconnecting');
  const canCancelStart = Boolean(status.starting) && !status.running;
  const menu = Menu.buildFromTemplate([
    {
      label: en ? 'Open PawLink' : 'Открыть PawLink',
      click: () => showMainWindow(),
    },
    {
      label: canCancelStart
        ? en
          ? 'Cancel connecting'
          : 'Отменить подключение'
        : status.running && !needsRetry
          ? en
            ? 'Disconnect VPN'
            : 'Отключить VPN'
          : en
            ? 'Connect VPN'
            : 'Подключить VPN',
      click: () => {
        void toggleCoreFromTray();
      },
    },
    { type: 'separator' },
    {
      label: en ? 'Quit' : 'Выход',
      click: () => {
        void quitApplication();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(trayTooltipForState(vpnState, status.phase));
  scheduleTrayRefresh(vpnState === 'connecting' ? 800 : 3_000);
}

function createTray(): void {
  if (tray) return;
  tray = new Tray(getTrayIcon('off'));
  tray.setToolTip('PawLink');
  void updateTrayMenu();
  tray.on('double-click', () => showMainWindow());
}

async function quitApplication(): Promise<void> {
  if (isQuitting) return;
  isQuitting = true;

  // Hide UI immediately — don't wait for backend shutdown.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners('close');
    try {
      mainWindow.hide();
      mainWindow.setSkipTaskbar(true);
    } catch {
      // ignore
    }
  }

  if (trayRefreshTimer) {
    clearTimeout(trayRefreshTimer);
    trayRefreshTimer = null;
  }
  stopTrayAnimation();
  stopAutoUpdateSchedule();
  stopSubscriptionRefresh();
  tray?.destroy();
  tray = null;
  cachedTrayIconOff = null;
  cachedTrayIconConnecting = null;
  cachedTrayIconConnected = null;
  lastTrayState = null;
  cachedWindowIcon = null;
  appIconCache.clear();
  logPump.clear();

  try {
    await stopBackend();
  } catch {
    // ignore shutdown errors on quit
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
    mainWindow = null;
  }
  app.quit();
}

function attachWindowBehavior(win: BrowserWindow): void {
  type WindowWithFlag = BrowserWindow & { pawlinkWindowBehavior?: boolean };
  const tagged = win as WindowWithFlag;
  if (tagged.pawlinkWindowBehavior) return;
  tagged.pawlinkWindowBehavior = true;

  win.on('close', (event) => {
    if (isQuitting || !getPreferences().closeToTray) return;
    event.preventDefault();
    win.hide();
    win.setSkipTaskbar(true);
    if (!tray) createTray();
  });

  win.on('minimize', () => {
    if (getPreferences().minimizeToTray) {
      win.hide();
      win.setSkipTaskbar(true);
      if (!tray) createTray();
    }
  });
}

function createWindow(): void {
  const prefs = getPreferences();
  const startHidden = prefs.startMinimized || isAutostartLaunch();
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    title: 'PawLink',
    icon: getWindowIcon(),
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  attachWindowBehavior(mainWindow);
  bindUpdaterWindow(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (startHidden) {
      mainWindow.hide();
      mainWindow.setSkipTaskbar(true);
      if (!tray) createTray();
      return;
    }
    mainWindow.show();
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    // Ignore failures of our own data: error page.
    if (validatedURL.startsWith('data:')) return;
    pushRuntimeLog(`[Electron] UI failed to load (${code}): ${description} @ ${validatedURL}`);
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const distIndex = path.join(__dirname, '../dist/index.html');
    if (isDevMode() && fs.existsSync(distIndex) && !validatedURL.includes('/dist/')) {
      pushRuntimeLog('[Electron] Retrying with dist/index.html');
      void mainWindow.loadFile(distIndex);
      return;
    }

    const safeDesc = description.replace(/[<>&]/g, '');
    void mainWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html><head><meta charset="utf-8"><title>PawLink</title>
<style>
  body{margin:0;font-family:Segoe UI,sans-serif;background:#0f1117;color:#e5e7eb;
  display:flex;min-height:100vh;align-items:center;justify-content:center}
  main{max-width:440px;padding:24px}
  h1{font-size:18px;margin:0 0 8px}p{opacity:.8;line-height:1.45}
  code{color:#a5b4fc}
</style></head><body><main>
  <h1>Не удалось загрузить интерфейс</h1>
  <p>${safeDesc}</p>
  <p>Закройте все окна PawLink и снова запустите приложение.
  Dev-сервер Vite должен слушать <code>127.0.0.1:5173</code>.</p>
</main></body></html>`)}`,
    );
    if (!mainWindow.isVisible() && !startHidden) mainWindow.show();
  });

  void loadRenderer(mainWindow)
    .then(() => {
      if (!isDevMode() || process.env.PAWLINK_DEVTOOLS !== '1') return;
      if (isHandoffLaunch()) return;
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      pushRuntimeLog(`[Electron] loadRenderer failed: ${message}`);
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const safe = message.replace(/[<>&]/g, '');
      void mainWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          `<!doctype html><html><body style="margin:0;background:#0f1117;color:#e5e7eb;font-family:Segoe UI,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center"><main style="max-width:440px;padding:24px"><h1 style="font-size:18px">Не удалось загрузить интерфейс</h1><p style="opacity:.85">${safe}</p><p style="opacity:.85">Закройте PawLink и перезапустите приложение.</p></main></body></html>`,
        )}`,
      );
      if (!startHidden) mainWindow.show();
    });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('pawlink:get-backend-url', () => BACKEND_URL);
ipcMain.handle('pawlink:get-backend-token', () => BACKEND_TOKEN);
ipcMain.handle('pawlink:restart-backend', async () => {
  await stopBackend();
  await startBackend();
  return BACKEND_URL;
});
ipcMain.handle('pawlink:is-backend-running', () => backendProcess !== null);
ipcMain.handle('pawlink:restart-as-admin', async () => {
  if (process.platform !== 'win32') {
    throw new Error('Elevation is only supported on Windows');
  }
  if (isProcessElevated()) {
    focusExistingInstance();
    return;
  }

  pushRuntimeLog('[Electron] Restarting elevated — releasing single-instance lock');
  isQuitting = true;
  try {
    await stopBackend();
  } catch {
    // continue handoff even if backend stop is noisy
  }

  // Elevated child must be able to acquire the lock; release before spawn.
  app.releaseSingleInstanceLock();

  try {
    await relaunchElevated();
  } catch (err) {
    // UAC cancelled — try to stay alive as the sole instance again.
    isQuitting = false;
    const reclaimed = app.requestSingleInstanceLock();
    if (!reclaimed) {
      pushRuntimeLog('[Electron] Lock lost after failed elevation — exiting');
      app.exit(0);
      return;
    }
    try {
      await startBackend();
    } catch {
      // banner / retry in UI
    }
    throw err;
  }

  if (trayRefreshTimer) {
    clearTimeout(trayRefreshTimer);
    trayRefreshTimer = null;
  }
  try {
    tray?.destroy();
  } catch {
    // ignore
  }
  tray = null;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners('close');
    mainWindow.destroy();
    mainWindow = null;
  }
  app.exit(0);
});
ipcMain.handle('pawlink:get-app-icon', async (_event, iconPath: string | null) => {
  if (!iconPath) return null;
  const raw = iconPath.split(',')[0].trim().replace(/^"|"$/g, '');
  if (!raw) return null;
  if (appIconCache.has(raw)) {
    const hit = appIconCache.get(raw) ?? null;
    appIconCache.delete(raw);
    appIconCache.set(raw, hit);
    return hit;
  }
  if (!fs.existsSync(raw)) {
    appIconCache.set(raw, null);
    trimAppIconCache();
    return null;
  }
  try {
    const image = await app.getFileIcon(raw, { size: 'normal' });
    if (image.isEmpty()) {
      appIconCache.set(raw, null);
      trimAppIconCache();
      return null;
    }
    const dataUrl = image.toDataURL();
    appIconCache.set(raw, dataUrl);
    trimAppIconCache();
    return dataUrl;
  } catch {
    appIconCache.set(raw, null);
    trimAppIconCache();
    return null;
  }
});
ipcMain.handle('pawlink:pick-executable', async (): Promise<string | null> => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Выберите исполняемый файл',
    properties: ['openFile'],
    filters: [
      { name: 'Приложения', extensions: ['exe'] },
      { name: 'Все файлы', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});
ipcMain.handle(
  'pawlink:pick-config-file',
  async (): Promise<{ path: string; raw: string } | null> => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите конфигурацию',
      properties: ['openFile'],
      filters: [
        { name: 'Конфигурации', extensions: ['yaml', 'yml', 'json', 'txt', 'conf'] },
        { name: 'Резервные копии', extensions: ['json'] },
        { name: 'Все файлы', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const selectedPath = result.filePaths[0];
    const raw = await fs.promises.readFile(selectedPath, 'utf8');
    return { path: selectedPath, raw };
  },
);
ipcMain.handle(
  'pawlink:save-text-file',
  async (_event, defaultName: string, content: string): Promise<string | null> => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Сохранить резервную копию',
      defaultPath: defaultName || 'pawlink-backup.json',
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'Все файлы', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePath) return null;
    await fs.promises.writeFile(result.filePath, content, 'utf8');
    return result.filePath;
  },
);
ipcMain.handle('pawlink:get-preferences', () => getPreferences());
ipcMain.handle('pawlink:open-external', async (_event, url: unknown) => {
  if (typeof url !== 'string') return false;
  // Allow only the project GitHub host (releases, issues, main page).
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.hostname !== 'github.com') return false;
  if (!parsed.pathname.startsWith('/FelixEnotix/PawLink')) return false;
  await shell.openExternal(parsed.toString());
  return true;
});
ipcMain.handle('pawlink:set-preferences', (_event, patch: Partial<AppPreferences>) => {
  const next = savePreferences(patch);
  if (typeof patch.autostart === 'boolean') {
    const ok = applyAutostart(patch.autostart);
    if (!ok) {
      pushRuntimeLog('[Electron] Windows autostart could not be registered');
    } else {
      pushRuntimeLog(`[Electron] Windows autostart ${patch.autostart ? 'enabled' : 'disabled'}`);
    }
  }
  if (
    typeof patch.autoUpdate === 'boolean' ||
    typeof patch.updateCheckIntervalHours === 'number'
  ) {
    applyAutoUpdateSchedule();
    if (typeof patch.autoUpdate === 'boolean') {
      pushRuntimeLog(`[Electron] Auto-update checks ${patch.autoUpdate ? 'enabled' : 'disabled'}`);
    }
  }
  if (
    typeof patch.autoRefreshSubscriptions === 'boolean' ||
    typeof patch.subscriptionRefreshIntervalHours === 'number'
  ) {
    applySubscriptionRefreshSchedule();
    if (typeof patch.autoRefreshSubscriptions === 'boolean') {
      pushRuntimeLog(
        `[Electron] Subscription auto-refresh ${patch.autoRefreshSubscriptions ? 'enabled' : 'disabled'}`,
      );
    }
  }
  return next;
});
ipcMain.handle('pawlink:get-app-version', () => app.getVersion());
ipcMain.handle('pawlink:get-update-status', () => getUpdateStatus());
ipcMain.handle('pawlink:check-for-updates', () => checkForUpdates(true));
ipcMain.handle('pawlink:download-update', () => downloadUpdate());
ipcMain.handle('pawlink:install-update', () => installUpdate());
ipcMain.handle('pawlink:open-update-folder', () => {
  openUpdateLocation();
  return true;
});
ipcMain.handle('pawlink:update-subscribe', () => {
  addUpdateSubscriber();
  return true;
});
ipcMain.handle('pawlink:update-unsubscribe', () => {
  removeUpdateSubscriber();
  return true;
});
ipcMain.handle('pawlink:get-autostart-infra', () => getAutostartInfrastructureStatus());
ipcMain.handle('pawlink:remove-autostart-infra', () => {
  const result = removeAutostartInfrastructure();
  if (result.ok) {
    savePreferences({ autostart: false });
    pushRuntimeLog('[Electron] Autostart infrastructure removed');
  }
  return result;
});
ipcMain.handle('pawlink:restore-autostart-infra', () => {
  const result = restoreAutostartInfrastructure();
  if (result.ok) {
    savePreferences({ autostart: true });
    pushRuntimeLog('[Electron] Autostart infrastructure restored for current install path');
  }
  return result;
});
ipcMain.handle('pawlink:show-window', () => {
  showMainWindow();
});
ipcMain.handle(
  'pawlink:show-notification',
  (_event, payload: { title?: string; body?: string }) => {
    const title = payload?.title?.trim();
    const body = payload?.body?.trim();
    if (!title || !body) return false;
    showDesktopNotification(title, body);
    return true;
  },
);
ipcMain.handle('pawlink:quit-app', async () => {
  await quitApplication();
});
ipcMain.handle('pawlink:refresh-tray', async () => {
  if (trayRefreshTimer) clearTimeout(trayRefreshTimer);
  trayRefreshTimer = null;
  await updateTrayMenu();
});
ipcMain.handle('pawlink:get-logs', () => runtimeLogs.slice());
ipcMain.handle('pawlink:clear-logs', () => {
  logPump.clear();
  removeStaleBackendLogFile();
  return true;
});
ipcMain.handle('pawlink:logs-subscribe', () => {
  logPump.addListener();
  return true;
});
ipcMain.handle('pawlink:logs-unsubscribe', () => {
  logPump.removeListener();
  return true;
});

// On UAC handoff the parent exits itself — do NOT taskkill it (that can take down Vite).
if (
  process.platform === 'win32' &&
  isProcessElevated() &&
  !isHandoffLaunch() &&
  !isAutostartLaunch()
) {
  const killed = killOtherAppInstances();
  if (killed > 0) {
    pushRuntimeLog(`[Electron] Cleared ${killed} leftover instance tree(s) before lock`);
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    pushRuntimeLog('[Electron] Second launch — focusing existing window');
    focusExistingInstance();
  });

  app.whenReady().then(async () => {
    if (!isHandoffLaunch() && !isAutostartLaunch()) {
      const killed = killOtherAppInstances();
      if (killed > 0) {
        pushRuntimeLog(`[Electron] Cleared ${killed} duplicate instance tree(s)`);
      }
    }

    setupContentSecurityPolicy();
    loadPreferences();
    // Remove leftover "Electron" welcome-window autostart from old npm-run-dev sessions.
    scrubOrphanElectronAutostart();
    if (getPreferences().autostart) {
      const synced = applyAutostart(true);
      if (!synced) {
        pushRuntimeLog('[Electron] Autostart task registration failed');
      } else {
        pushRuntimeLog('[Electron] Autostart task synced (XML + silent launcher)');
      }
    } else {
      // Still clear orphan Electron Run keys even when autostart is off.
      scrubOrphanElectronAutostart();
    }
    removeStaleBackendLogFile();

    await waitForShellReady();
    createTray();
    createWindow();
    bindQuitForInstall(quitApplication);
    initAutoUpdater();
    initSubscriptionRefresh({
      backendUrl: BACKEND_URL,
      backendToken: BACKEND_TOKEN,
      log: pushRuntimeLog,
    });
    pushRuntimeLog(
      isProcessElevated()
        ? `[Electron] Window ready (elevated${isHandoffLaunch() ? ', handoff' : ''}${isAutostartLaunch() ? ', autostart' : ''})`
        : '[Electron] Window ready (not elevated — TUN unavailable, system proxy OK)',
    );

    void startBackend().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      pushRuntimeLog(`[Electron] Backend failed: ${message}`);
    });

    scheduleTrayRefresh(1_500);

    app.on('activate', () => {
      focusExistingInstance();
    });
  });

  app.on('window-all-closed', () => {
    const prefs = getPreferences();
    if (prefs.closeToTray || prefs.minimizeToTray) {
      return;
    }
    void quitApplication();
  });

  app.on('before-quit', (event) => {
    if (isQuitting) return;
    if (isInstallingUpdate()) {
      isQuitting = true;
      return;
    }
    event.preventDefault();
    void quitApplication();
  });
}
