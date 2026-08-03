const MAX_CACHE = 80;
const cache = new Map<string, Promise<string | null>>();

function trimCache(): void {
  while (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Deduplicate and cache Electron getFileIcon → data URL lookups. */
export function loadAppIcon(iconPath: string | null | undefined): Promise<string | null> {
  if (!iconPath || !window.pawlink?.getAppIcon) {
    return Promise.resolve(null);
  }
  const key = iconPath;
  const hit = cache.get(key);
  if (hit) {
    // Refresh insertion order for a simple LRU.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const pending = window.pawlink
    .getAppIcon(iconPath)
    .then((url) => url)
    .catch(() => null);
  cache.set(key, pending);
  trimCache();
  return pending;
}
