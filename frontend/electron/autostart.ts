import { app } from 'electron';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/** Passed to the exe when Windows autostart launches PawLink. */
export const AUTOSTART_FLAG = '--pawlink-autostart';

const TASK_NAME = 'PawLinkAutostart';
const LAUNCHER_VBS = 'autostart.vbs';
const TASK_XML = 'autostart.xml';
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

export function isAutostartLaunch(): boolean {
  return process.argv.includes(AUTOSTART_FLAG);
}

function taskDir(): string {
  const dir = path.join(app.getPath('userData'), 'tasks');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function vbsQuote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function normalizePathKey(value: string): string {
  return path.normalize(value).toLowerCase();
}

/** Silent launcher — wscript //B, no console window. */
function writeAutostartLauncher(exePath: string): string {
  const vbsPath = path.join(taskDir(), LAUNCHER_VBS);
  const escapedExe = exePath.replace(/"/g, '""');
  const vbs = [
    "' PawLink silent autostart launcher",
    'Set sh = CreateObject("WScript.Shell")',
    `sh.Run """${escapedExe}"" ${AUTOSTART_FLAG}", 0, False`,
    '',
  ].join('\r\n');
  fs.writeFileSync(vbsPath, `\uFEFF${vbs}`, 'utf16le');
  return vbsPath;
}

function buildTaskXml(wscriptPath: string, vbsPath: string): string {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <Delay>PT8S</Delay>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>3</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${vbsQuote(wscriptPath)}</Command>
      <Arguments>//B //Nologo ${vbsQuote(vbsPath)}</Arguments>
    </Exec>
  </Actions>
</Task>
`;
}

function regExe(): string {
  return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
}

function schtasksExe(): string {
  return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'schtasks.exe');
}

function deleteRunValue(valueName: string): void {
  try {
    execFileSync(regExe(), ['delete', RUN_KEY, '/v', valueName, '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch {
    // value may not exist
  }
}

function listRunValues(): Array<{ name: string; data: string }> {
  try {
    const out = execFileSync(regExe(), ['query', RUN_KEY], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      encoding: 'utf8',
    });
    const rows: Array<{ name: string; data: string }> = [];
    for (const line of out.split(/\r?\n/)) {
      // REG_SZ lines: "    Name    REG_SZ    data"
      const m = line.match(/^\s+(\S+)\s+REG_\w+\s+(.+)$/i);
      if (!m) continue;
      rows.push({ name: m[1], data: m[2].trim() });
    }
    return rows;
  } catch {
    return [];
  }
}

/**
 * Remove leftover Startup entries that launch bare electron.exe from node_modules
 * (created when autostart was toggled during `npm run dev`).
 */
export function scrubOrphanElectronAutostart(): void {
  if (process.platform !== 'win32') return;

  // Known Electron login-item names for unpackaged / wrong registrations.
  for (const name of ['electron.app.Electron', 'electron.app.electron', 'electron.app.pawlink']) {
    deleteRunValue(name);
  }

  for (const row of listRunValues()) {
    const data = normalizePathKey(row.data);
    if (
      data.includes(`${path.sep}node_modules${path.sep}electron${path.sep}dist${path.sep}electron.exe`) ||
      (data.endsWith(`${path.sep}electron.exe`) && data.includes('node_modules'))
    ) {
      deleteRunValue(row.name);
    }
  }

  try {
    app.setLoginItemSettings({ openAtLogin: false });
  } catch {
    // ignore
  }
}

function clearElectronLoginItem(): void {
  try {
    app.setLoginItemSettings({ openAtLogin: false, path: process.execPath });
  } catch {
    // ignore
  }
  try {
    app.setLoginItemSettings({ openAtLogin: false });
  } catch {
    // ignore
  }
}

function deleteScheduledTask(): void {
  try {
    execFileSync(schtasksExe(), ['/Delete', '/TN', TASK_NAME, '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch {
    // task may not exist
  }
}

function createScheduledTask(exePath: string): void {
  const vbsPath = writeAutostartLauncher(exePath);
  const wscriptPath = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');
  const xmlPath = path.join(taskDir(), TASK_XML);
  const xml = buildTaskXml(wscriptPath, vbsPath);
  fs.writeFileSync(xmlPath, Buffer.from(`\ufeff${xml}`, 'utf16le'));

  execFileSync(schtasksExe(), ['/Create', '/TN', TASK_NAME, '/XML', xmlPath, '/F'], {
    stdio: 'pipe',
    windowsHide: true,
    encoding: 'utf8',
  });
}

function verifyScheduledTask(): boolean {
  try {
    execFileSync(schtasksExe(), ['/Query', '/TN', TASK_NAME], {
      stdio: 'pipe',
      windowsHide: true,
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

/** Enable or disable Windows autostart. Returns whether the desired state is active. */
export function applyAutostart(enabled: boolean): boolean {
  if (process.platform !== 'win32') return true;

  // Always remove broken Electron/dev login items first.
  scrubOrphanElectronAutostart();
  clearElectronLoginItem();

  if (!enabled) {
    deleteScheduledTask();
    return true;
  }

  // Dev mode must never register bare electron.exe — it opens the Electron welcome window.
  if (!app.isPackaged) {
    return false;
  }

  try {
    createScheduledTask(process.execPath);
    return verifyScheduledTask();
  } catch {
    return false;
  }
}

export function isAutostartActive(): boolean {
  if (process.platform !== 'win32') return false;
  return verifyScheduledTask();
}

export interface AutostartInfrastructureStatus {
  supported: boolean;
  taskRegistered: boolean;
  launcherFilesPresent: boolean;
  /** Task + launcher exist and point to this exe (any install folder). */
  ready: boolean;
  installPath: string;
  taskName: string;
}

export type AutostartInfraResult =
  | { ok: true }
  | { ok: false; code: 'already_exists' | 'nothing_to_remove' | 'unsupported' | 'failed'; message?: string };

function launcherPointsToExe(exePath: string): boolean {
  const vbsPath = path.join(taskDir(), LAUNCHER_VBS);
  if (!fs.existsSync(vbsPath)) return false;
  try {
    const raw = fs.readFileSync(vbsPath);
    const text =
      raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe
        ? raw.toString('utf16le')
        : raw.toString('utf8');
    return normalizePathKey(text).includes(normalizePathKey(exePath));
  } catch {
    return false;
  }
}

function launcherFilesPresent(): boolean {
  const dir = path.join(app.getPath('userData'), 'tasks');
  return fs.existsSync(path.join(dir, LAUNCHER_VBS)) && fs.existsSync(path.join(dir, TASK_XML));
}

function removeLauncherFiles(): void {
  const dir = path.join(app.getPath('userData'), 'tasks');
  for (const name of [LAUNCHER_VBS, TASK_XML]) {
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      // ignore
    }
  }
}

export function getAutostartInfrastructureStatus(): AutostartInfrastructureStatus {
  const installPath = process.execPath;
  const base = {
    installPath,
    taskName: TASK_NAME,
    taskRegistered: false,
    launcherFilesPresent: false,
    ready: false,
  };

  if (process.platform !== 'win32' || !app.isPackaged) {
    return { ...base, supported: false };
  }

  const taskRegistered = verifyScheduledTask();
  const filesPresent = launcherFilesPresent();
  const ready = taskRegistered && filesPresent && launcherPointsToExe(installPath);

  return {
    ...base,
    supported: true,
    taskRegistered,
    launcherFilesPresent: filesPresent,
    ready,
  };
}

export function removeAutostartInfrastructure(): AutostartInfraResult {
  if (process.platform !== 'win32' || !app.isPackaged) {
    return { ok: false, code: 'unsupported' };
  }

  const before = getAutostartInfrastructureStatus();
  const hadSomething = before.taskRegistered || before.launcherFilesPresent;

  scrubOrphanElectronAutostart();
  clearElectronLoginItem();

  if (!hadSomething) {
    return { ok: false, code: 'nothing_to_remove' };
  }

  deleteScheduledTask();
  removeLauncherFiles();

  return { ok: true };
}

export function restoreAutostartInfrastructure(): AutostartInfraResult {
  if (process.platform !== 'win32' || !app.isPackaged) {
    return { ok: false, code: 'unsupported' };
  }

  if (getAutostartInfrastructureStatus().ready) {
    return { ok: false, code: 'already_exists' };
  }

  scrubOrphanElectronAutostart();
  clearElectronLoginItem();

  try {
    createScheduledTask(process.execPath);
    if (!getAutostartInfrastructureStatus().ready) {
      return { ok: false, code: 'failed', message: 'Task verification failed' };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: 'failed', message };
  }
}
