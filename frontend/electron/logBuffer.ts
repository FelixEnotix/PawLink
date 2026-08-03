/** In-memory ring buffer for UI logs. Never writes to disk. */

export const MAX_LOG_LINES = 800;
export const MAX_LOG_LINE_CHARS = 1200;
export const LOG_FLUSH_MS = 80;
export const MAX_BATCH_LINES = 40;

export function normalizeLogChunk(chunk: string): string[] {
  const text = chunk.replace(/\r/g, '').trimEnd();
  if (!text) return [];
  const parts: string[] = [];
  for (const raw of text.split('\n')) {
    if (!raw) continue;
    parts.push(raw.length > MAX_LOG_LINE_CHARS ? `${raw.slice(0, MAX_LOG_LINE_CHARS)}…` : raw);
  }
  return parts;
}

export function appendLogLines(buffer: string[], lines: string[], maxLines = MAX_LOG_LINES): number {
  if (lines.length === 0) return 0;
  buffer.push(...lines);
  const overflow = buffer.length - maxLines;
  if (overflow > 0) {
    buffer.splice(0, overflow);
  }
  return lines.length;
}

export function createLogPump(options: {
  buffer: string[];
  maxLines?: number;
  flushMs?: number;
  maxBatch?: number;
  onBatch: (lines: string[]) => void;
}) {
  const maxLines = options.maxLines ?? MAX_LOG_LINES;
  const flushMs = options.flushMs ?? LOG_FLUSH_MS;
  const maxBatch = options.maxBatch ?? MAX_BATCH_LINES;
  let pending: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let listeners = 0;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending.length === 0 || listeners <= 0) {
      pending = [];
      return;
    }
    const batch = pending.splice(0, maxBatch);
    if (pending.length > 0) {
      // Drop backlog under flood — keep only the newest chunk.
      if (pending.length > maxBatch * 2) {
        pending = pending.slice(-maxBatch);
      }
      timer = setTimeout(flush, flushMs);
    }
    options.onBatch(batch);
  };

  return {
    push(chunk: string): void {
      const lines = normalizeLogChunk(chunk);
      if (!lines.length) return;
      appendLogLines(options.buffer, lines, maxLines);
      if (listeners <= 0) return;
      pending.push(...lines);
      if (pending.length > maxBatch * 4) {
        pending = pending.slice(-maxBatch);
      }
      if (!timer) {
        timer = setTimeout(flush, flushMs);
      }
    },
    addListener(): void {
      listeners += 1;
    },
    removeListener(): void {
      listeners = Math.max(0, listeners - 1);
      if (listeners === 0) {
        pending = [];
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      }
    },
    clear(): void {
      options.buffer.length = 0;
      pending = [];
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    get listenerCount(): number {
      return listeners;
    },
  };
}
