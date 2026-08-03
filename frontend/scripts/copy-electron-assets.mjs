import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const distElectron = path.join(frontendRoot, 'dist-electron');

const pngSources = [
  path.join(frontendRoot, 'assets', 'icon.png'),
  path.join(frontendRoot, 'assets', 'tray-icon.png'),
  path.join(frontendRoot, 'src', 'assets', 'brand-icon.png'),
];
const icoSources = [
  path.join(frontendRoot, 'build', 'icon.ico'),
  path.join(frontendRoot, 'assets', 'icon.ico'),
];
const connectedTray = path.join(frontendRoot, 'assets', 'tray-icon-connected.png');
const offTray = path.join(frontendRoot, 'assets', 'tray-icon-off.png');
const connectingTray = path.join(frontendRoot, 'assets', 'tray-icon-connecting.png');

const png = pngSources.find((p) => fs.existsSync(p));
if (!png) {
  console.warn('[copy-electron-assets] No icon.png found — tray/window may be blank');
  process.exit(0);
}

fs.mkdirSync(distElectron, { recursive: true });
fs.copyFileSync(png, path.join(distElectron, 'icon.png'));
console.log(`[copy-electron-assets] ${path.relative(frontendRoot, png)} → dist-electron/icon.png`);

if (fs.existsSync(connectedTray)) {
  fs.copyFileSync(connectedTray, path.join(distElectron, 'tray-icon-connected.png'));
  console.log(
    `[copy-electron-assets] tray-icon-connected.png → dist-electron/tray-icon-connected.png`,
  );
}

for (const [src, name] of [
  [offTray, 'tray-icon-off.png'],
  [connectingTray, 'tray-icon-connecting.png'],
]) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distElectron, name));
    console.log(`[copy-electron-assets] ${name} → dist-electron/${name}`);
  }
}

const ico = icoSources.find((p) => fs.existsSync(p));
if (ico) {
  fs.copyFileSync(ico, path.join(distElectron, 'icon.ico'));
  console.log(`[copy-electron-assets] ${path.relative(frontendRoot, ico)} → dist-electron/icon.ico`);
}
