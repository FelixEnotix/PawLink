const FLAG_MAP: Record<string, string> = {
  US: '🇺🇸',
  USA: '🇺🇸',
  GB: '🇬🇧',
  UK: '🇬🇧',
  DE: '🇩🇪',
  FR: '🇫🇷',
  NL: '🇳🇱',
  RU: '🇷🇺',
  JP: '🇯🇵',
  SG: '🇸🇬',
  HK: '🇭🇰',
  KR: '🇰🇷',
  FI: '🇫🇮',
  SE: '🇸🇪',
  CH: '🇨🇭',
  PL: '🇵🇱',
  CZ: '🇨🇿',
  TR: '🇹🇷',
  AE: '🇦🇪',
  IN: '🇮🇳',
  CA: '🇨🇦',
  AU: '🇦🇺',
  BR: '🇧🇷',
  IT: '🇮🇹',
  ES: '🇪🇸',
  UA: '🇺🇦',
  KZ: '🇰🇿',
  LV: '🇱🇻',
  LT: '🇱🇹',
  EE: '🇪🇪',
  NO: '🇳🇴',
  DK: '🇩🇰',
  AT: '🇦🇹',
  BE: '🇧🇪',
  IE: '🇮🇪',
  IL: '🇮🇱',
  TW: '🇹🇼',
  MY: '🇲🇾',
  TH: '🇹🇭',
  VN: '🇻🇳',
  ID: '🇮🇩',
  PH: '🇵🇭',
  MX: '🇲🇽',
  AR: '🇦🇷',
  CL: '🇨🇱',
  CO: '🇨🇴',
  PT: '🇵🇹',
  RO: '🇷🇴',
  HU: '🇭🇺',
  GR: '🇬🇷',
  BG: '🇧🇬',
  RS: '🇷🇸',
  HR: '🇭🇷',
  SK: '🇸🇰',
  SI: '🇸🇮',
  LU: '🇱🇺',
  IS: '🇮🇸',
  NZ: '🇳🇿',
  ZA: '🇿🇦',
  EG: '🇪🇬',
  SA: '🇸🇦',
  QA: '🇶🇦',
  KW: '🇰🇼',
  PK: '🇵🇰',
  BD: '🇧🇩',
  IR: '🇮🇷',
  IQ: '🇮🇶',
};

const NAME_KEYWORDS: Record<string, string> = {
  美国: '🇺🇸',
  美國: '🇺🇸',
  香港: '🇭🇰',
  台湾: '🇹🇼',
  台灣: '🇹🇼',
  日本: '🇯🇵',
  韩国: '🇰🇷',
  韓國: '🇰🇷',
  新加坡: '🇸🇬',
  英国: '🇬🇧',
  英國: '🇬🇧',
  德国: '🇩🇪',
  德國: '🇩🇪',
  法国: '🇫🇷',
  法國: '🇫🇷',
  荷兰: '🇳🇱',
  荷蘭: '🇳🇱',
  俄罗斯: '🇷🇺',
  俄羅斯: '🇷🇺',
  加拿大: '🇨🇦',
  澳大利亚: '🇦🇺',
  澳洲: '🇦🇺',
  印度: '🇮🇳',
  土耳其: '🇹🇷',
  巴西: '🇧🇷',
  意大利: '🇮🇹',
  義大利: '🇮🇹',
  西班牙: '🇪🇸',
  乌克兰: '🇺🇦',
  烏克蘭: '🇺🇦',
  波兰: '🇵🇱',
  波蘭: '🇵🇱',
  芬兰: '🇫🇮',
  芬蘭: '🇫🇮',
  瑞典: '🇸🇪',
  瑞士: '🇨🇭',
  泰国: '🇹🇭',
  泰國: '🇹🇭',
  越南: '🇻🇳',
  马来西亚: '🇲🇾',
  馬來西亞: '🇲🇾',
  印尼: '🇮🇩',
  印度尼西亚: '🇮🇩',
  菲律宾: '🇵🇭',
  菲律賓: '🇵🇭',
};

const REGIONAL_PAIR = /\uD83C[\uDDE6-\uDDFF]\uD83C[\uDDE6-\uDDFF]/;

export function extractEmojiFlag(name: string): string | null {
  const pair = name.match(REGIONAL_PAIR);
  if (pair) return pair[0];

  const pictographic = name.match(/^[\p{Extended_Pictographic}\uFE0F\u200D]+/u);
  if (pictographic && pictographic[0].length >= 2) {
    return pictographic[0].trim();
  }

  return null;
}

export function getFlag(name: string): string {
  const emoji = extractEmojiFlag(name);
  if (emoji) return emoji;

  for (const [keyword, flag] of Object.entries(NAME_KEYWORDS)) {
    if (name.includes(keyword)) return flag;
  }

  const upper = name.toUpperCase();
  const codes = Object.keys(FLAG_MAP).sort((a, b) => b.length - a.length);
  for (const code of codes) {
    const pattern = new RegExp(`(?:^|[\\s|｜\\[\\(\\-–—_/])${code}(?:[\\s|｜\\]\\)\\-–—_/]|$)`);
    if (pattern.test(upper) || upper.startsWith(`${code} `) || upper.startsWith(`${code}-`)) {
      return FLAG_MAP[code];
    }
    if (upper.includes(code)) return FLAG_MAP[code];
  }

  return '🌐';
}

export function stripLeadingFlag(name: string): string {
  const emoji = extractEmojiFlag(name);
  if (!emoji) return name.trim();
  return name.replace(emoji, '').replace(/^[\s|｜\-–—\[\]()]+/, '').trim() || name.trim();
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatLatency(latencyMs?: number | null): string {
  if (latencyMs == null) return '—';
  return `${Math.round(latencyMs)} ms`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '0 B/s';
  return `${formatBytes(bytesPerSecond)}/s`;
}

export type NodeSortMode = 'default' | 'ping' | 'name';

export function sortProfiles<T extends { id: string; name: string }>(
  profiles: T[],
  health: Record<string, { latency_ms?: number | null }>,
  mode: NodeSortMode,
): T[] {
  const list = [...profiles];
  if (mode === 'default') return list;
  if (mode === 'name') {
    return list.sort((a, b) => stripLeadingFlag(a.name).localeCompare(stripLeadingFlag(b.name), 'ru'));
  }
  return list.sort((a, b) => {
    const la = health[a.id]?.latency_ms;
    const lb = health[b.id]?.latency_ms;
    if (la == null && lb == null) return 0;
    if (la == null) return 1;
    if (lb == null) return -1;
    return la - lb;
  });
}
