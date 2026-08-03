import { execFileSync } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { pollUntil } from './pollUntil';

/** Default Mihomo mixed port — same as PawLink backend config. */
export const MIHOMO_MIXED_PORT = 7890;
/** Default Mihomo external controller port. */
export const MIHOMO_CONTROLLER_PORT = 9090;

const PORT_POLL_MS = 100;
const RUNTIME_PORTS_FILE = path.join(os.homedir(), '.pawlink', 'runtime_ports.json');

export interface MihomoRuntimePorts {
  mixed: number;
  controller: number;
}

export function readPersistedMihomoPorts(): MihomoRuntimePorts {
  try {
    const raw = fs.readFileSync(RUNTIME_PORTS_FILE, 'utf8');
    const data = JSON.parse(raw) as { mixed_port?: number; controller_port?: number };
    return {
      mixed: Number(data.mixed_port) || MIHOMO_MIXED_PORT,
      controller: Number(data.controller_port) || MIHOMO_CONTROLLER_PORT,
    };
  } catch {
    return { mixed: MIHOMO_MIXED_PORT, controller: MIHOMO_CONTROLLER_PORT };
  }
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function waitUntilPortFree(port: number): Promise<void> {
  await pollUntil(async () => isPortFree(port), PORT_POLL_MS);
}

function listeningPids(port: number): number[] {
  try {
    const out = execFileSync('netstat', ['-ano', '-p', 'tcp'], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    });
    const pids = new Set<number>();
    for (const line of out.split(/\r?\n/)) {
      if (!/LISTENING/i.test(line)) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) continue;
      const local = parts[1] ?? '';
      if (!local.endsWith(`:${port}`)) continue;
      const pid = Number(parts[parts.length - 1]);
      if (Number.isFinite(pid) && pid > 0) pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

function pawlinkPidsOnPort(port: number): number[] {
  return listeningPids(port).filter((pid) => {
    try {
      const out = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-WindowStyle',
          'Hidden',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
        ],
        { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      return out.toLowerCase().includes('.pawlink');
    } catch {
      return false;
    }
  });
}

/** Stop PawLink mihomo on a port — never kills Clash Verge / other VPN clients. */
export async function freeTcpPort(port: number, log?: (msg: string) => void): Promise<void> {
  if (process.platform !== 'win32') return;
  if (await isPortFree(port)) return;

  for (const pid of pawlinkPidsOnPort(port)) {
    try {
      execFileSync('taskkill', ['/F', '/PID', String(pid)], {
        windowsHide: true,
        stdio: 'ignore',
      });
      log?.(`[Electron] Freed port ${port} (PID ${pid})`);
    } catch {
      // process may already be gone
    }
  }

  await waitUntilPortFree(port);
}

/**
 * Disable Windows system proxy when it points at PawLink's mixed port.
 * Checks both default and persisted runtime ports.
 */
export function clearStaleSystemProxy(ports?: MihomoRuntimePorts): void {
  if (process.platform !== 'win32') return;
  const runtime = ports ?? readPersistedMihomoPorts();
  const targets = new Set([
    `127.0.0.1:${MIHOMO_MIXED_PORT}`,
    `127.0.0.1:${runtime.mixed}`,
  ]);
  const targetList = [...targets].map((t) => `'${t.replace(/'/g, "''")}'`).join(',');
  const script = [
    "$k='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'",
    '$p=Get-ItemProperty $k',
    `$targets=@(${targetList})`,
    'if($p.ProxyEnable -eq 1){',
    '  foreach($t in $targets){',
    '    if($p.ProxyServer -eq $t -or $p.ProxyServer -like "*$t*"){',
    '      Set-ItemProperty $k ProxyEnable 0; break',
    '    }',
    '  }',
    '}',
  ].join('; ');
  try {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
      { windowsHide: true, stdio: 'ignore' },
    );
  } catch {
    // ignore registry / PowerShell errors on quit
  }
}

/** Verify mihomo ports and proxy are released after backend shutdown. */
export async function emergencyRuntimeCleanup(log?: (msg: string) => void): Promise<void> {
  if (process.platform !== 'win32') return;
  const ports = readPersistedMihomoPorts();
  await freeTcpPort(ports.mixed, log);
  await freeTcpPort(ports.controller, log);
  clearStaleSystemProxy(ports);
}

/** Wait until a child process exits — event-driven, no deadline. */
export function waitForProcessExit(
  proc: { exitCode: number | null; once(event: 'close', listener: () => void): void },
): Promise<void> {
  if (proc.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    proc.once('close', () => resolve());
  });
}
