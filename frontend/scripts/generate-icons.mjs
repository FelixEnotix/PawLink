/**
 * Build a multi-size Windows .ico + tray PNGs from the master brand icon.
 * - Strips the solid white canvas to true transparency (keeps the white paw).
 * - Writes tray-icon.png and tray-icon-connected.png (green status badge).
 * Run: node scripts/generate-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(frontendRoot, '..');
const require = createRequire(import.meta.url);

const master =
  [
    path.join(frontendRoot, 'assets', 'icon.png'),
    path.join(frontendRoot, 'src', 'assets', 'brand-icon.png'),
  ].find((p) => fs.existsSync(p)) ?? null;

if (!master) {
  console.error('[generate-icons] Master PNG not found');
  process.exit(1);
}

const buildDir = path.join(frontendRoot, 'build');
const assetsDir = path.join(frontendRoot, 'assets');
const rootAssets = path.join(projectRoot, 'assets');
fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(assetsDir, { recursive: true });
fs.mkdirSync(rootAssets, { recursive: true });

try {
  require.resolve('png-to-ico');
} catch {
  console.error('[generate-icons] Missing png-to-ico. Run: npm install');
  process.exit(1);
}

/** Near-white canvas connected to edges → alpha 0 (white paw stays). */
function clearWhiteCanvas(png) {
  const { width: w, height: h, data } = png;
  const isBg = (i) => {
    const a = data[i + 3];
    if (a < 10) return true;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    return r > 240 && g > 240 && b > 240;
  };

  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qh = 0;
  let qt = 0;

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (seen[idx]) return;
    const i = idx << 2;
    if (!isBg(i)) return;
    seen[idx] = 1;
    queue[qt++] = idx;
  };

  for (let x = 0; x < w; x += 1) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    push(0, y);
    push(w - 1, y);
  }

  let cleared = 0;
  while (qh < qt) {
    const idx = queue[qh++];
    const i = idx << 2;
    data[i + 3] = 0;
    cleared += 1;
    const x = idx % w;
    const y = (idx - x) / w;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return cleared;
}

function clonePng(src) {
  const out = new PNG({ width: src.width, height: src.height });
  src.data.copy(out.data);
  return out;
}

/** Draw a filled circle with a soft ring (RGBA into png buffer). */
function drawBadge(png, cx, cy, radius, fill, ring) {
  const { width: w, height: h, data } = png;
  const r2 = radius * radius;
  const ringOuter = radius + 2;
  const ringOuter2 = ringOuter * ringOuter;
  for (let y = Math.floor(cy - ringOuter); y <= Math.ceil(cy + ringOuter); y += 1) {
    for (let x = Math.floor(cx - ringOuter); x <= Math.ceil(cx + ringOuter); x += 1) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > ringOuter2) continue;
      const i = (y * w + x) << 2;
      const color = d2 <= r2 ? fill : ring;
      // Overwrite opaque — badge must stay visible on tray.
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = color[3];
    }
  }
}

function writePng(filePath, png) {
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

const raw = PNG.sync.read(fs.readFileSync(master));
const cleared = clearWhiteCanvas(raw);
console.log(`[generate-icons] cleared white canvas pixels: ${cleared}`);

// Persist transparent master into assets (paw only — badges are separate files).
const transparentPng = PNG.sync.write(raw);
const pawTargets = [
  path.join(assetsDir, 'icon.png'),
  path.join(assetsDir, 'tray-icon.png'),
  path.join(frontendRoot, 'src', 'assets', 'brand-icon.png'),
];
for (const dest of pawTargets) {
  fs.writeFileSync(dest, transparentPng);
  console.log(`[generate-icons] wrote ${path.relative(projectRoot, dest)}`);
}

function makeBadgedTray(fill, ring) {
  const out = clonePng(raw);
  const badgeR = Math.max(52, Math.round(out.width * 0.17));
  const cx = out.width - badgeR - Math.round(out.width * 0.05);
  const cy = out.height - badgeR - Math.round(out.height * 0.05);
  drawBadge(out, cx, cy, badgeR, fill, ring);
  return out;
}

const ring = [15, 23, 42, 255];
const offPath = path.join(assetsDir, 'tray-icon-off.png');
writePng(offPath, makeBadgedTray([239, 68, 68, 255], ring));
console.log(`[generate-icons] wrote ${path.relative(projectRoot, offPath)}`);

const connectingPath = path.join(assetsDir, 'tray-icon-connecting.png');
writePng(connectingPath, makeBadgedTray([251, 191, 36, 255], ring));
console.log(`[generate-icons] wrote ${path.relative(projectRoot, connectingPath)}`);

// Connected tray: paw + green status badge (bottom-right).
const connected = makeBadgedTray([34, 197, 94, 255], ring);
const connectedPath = path.join(assetsDir, 'tray-icon-connected.png');
writePng(connectedPath, connected);
console.log(`[generate-icons] wrote ${path.relative(projectRoot, connectedPath)}`);

const pngToIco = (await import('png-to-ico')).default;
// png-to-ico reads from path — use the transparent icon we just wrote.
const icoBuf = await pngToIco(path.join(assetsDir, 'icon.png'));
const icoTargets = [
  path.join(buildDir, 'icon.ico'),
  path.join(assetsDir, 'icon.ico'),
  path.join(rootAssets, 'icon.ico'),
];
for (const dest of icoTargets) {
  fs.writeFileSync(dest, icoBuf);
  console.log(`[generate-icons] wrote ${path.relative(projectRoot, dest)} (${icoBuf.length} bytes)`);
}

console.log('[generate-icons] done');
