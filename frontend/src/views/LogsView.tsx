import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/LocaleContext';

const MAX_RENDER = 800;

export function LogsView() {
  const { t } = useI18n();
  const [lines, setLines] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const endRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const api = window.pawlink;
    if (!api?.getLogs) {
      setLines([t.logs.desktopOnly]);
      return;
    }

    void api.getLogs().then((initial) => {
      if (!cancelled) setLines(initial.slice(-MAX_RENDER));
    });

    const appendBatch = (batch: string[]) => {
      if (!batch.length) return;
      setLines((prev) => {
        if (batch.length >= MAX_RENDER) return batch.slice(-MAX_RENDER);
        const keep = MAX_RENDER - batch.length;
        return prev.length > keep ? [...prev.slice(-keep), ...batch] : [...prev, ...batch];
      });
    };

    const unsubscribeBatch = api.onLogBatch?.(appendBatch);
    const unsubscribeLine = !api.onLogBatch
      ? api.onLogLine?.((line) => appendBatch([line]))
      : undefined;

    return () => {
      cancelled = true;
      unsubscribeBatch?.();
      unsubscribeLine?.();
    };
  }, [t.logs.desktopOnly]);

  useEffect(() => {
    if (!autoScroll) return;
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines, autoScroll]);

  const clearLogs = async () => {
    await window.pawlink?.clearLogs?.();
    setLines([]);
  };

  const copyLogs = async () => {
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  return (
    <div className="logs-view">
      <div className="logs-toolbar">
        <div className="logs-toolbar-copy">
          <p className="hint">{t.logs.hint}</p>
          <p className="hint logs-autotrim">{t.logs.autoTrim}</p>
        </div>
        <div className="logs-toolbar-actions">
          <label className="logs-autoscroll">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            {t.logs.autoscroll}
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyLogs()}>
            {t.logs.copy}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void clearLogs()}>
            {t.logs.clear}
          </button>
        </div>
      </div>
      <div
        ref={boxRef}
        className="logs-panel"
        onScroll={() => {
          const el = boxRef.current;
          if (!el) return;
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          if (!nearBottom && autoScroll) setAutoScroll(false);
        }}
      >
        {lines.length === 0 ? (
          <div className="logs-empty">{t.logs.empty}</div>
        ) : (
          lines.map((line, idx) => (
            <div key={`${idx}-${line.slice(0, 24)}`} className="logs-line">
              {line}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
