import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ViewId } from '../../App';
import { useI18n } from '../../i18n/LocaleContext';
import { TOUR_STEPS, type TourStepId } from '../../setup/tourSteps';

interface SetupTourProps {
  active: boolean;
  onNavigate: (view: ViewId) => void;
  onSettingsScroll: (section: string) => void;
  onFinish: () => void;
}

interface HoleRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function padRect(r: DOMRect, pad = 8): HoleRect {
  return {
    top: Math.max(0, r.top - pad),
    left: Math.max(0, r.left - pad),
    width: Math.min(window.innerWidth - Math.max(0, r.left - pad), r.width + pad * 2),
    height: Math.min(window.innerHeight - Math.max(0, r.top - pad), r.height + pad * 2),
  };
}

export function SetupTour({ active, onNavigate, onSettingsScroll, onFinish }: SetupTourProps) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [hole, setHole] = useState<HoleRect | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number; maxWidth: number }>({
    top: 24,
    left: 24,
    maxWidth: 360,
  });

  const step = TOUR_STEPS[index];
  const total = TOUR_STEPS.length;

  const copy = useMemo(() => {
    const id = step?.id as TourStepId | undefined;
    if (!id) return { title: '', body: '' };
    return t.setup.steps[id];
  }, [step?.id, t]);

  // Reset when tour opens.
  useEffect(() => {
    if (active) setIndex(0);
  }, [active]);

  // Navigate / scroll for current step, then measure.
  useEffect(() => {
    if (!active || !step) return;
    let cancelled = false;
    let tries = 0;

    const prepare = async () => {
      if (step.view) onNavigate(step.view);
      await new Promise((r) => setTimeout(r, step.view === 'settings' ? 120 : 60));
      if (cancelled) return;
      if (step.settingsScroll) onSettingsScroll(step.settingsScroll);
      await new Promise((r) => setTimeout(r, step.settingsScroll ? 280 : 40));
      if (cancelled) return;

      const measure = () => {
        if (cancelled) return;
        if (!step.selector) {
          setHole(null);
          const maxWidth = Math.min(420, window.innerWidth - 32);
          setCardPos({
            top: Math.max(24, (window.innerHeight - 220) / 2),
            left: Math.max(16, (window.innerWidth - maxWidth) / 2),
            maxWidth,
          });
          return;
        }
        const el = document.querySelector(step.selector) as HTMLElement | null;
        if (!el) {
          tries += 1;
          if (tries < 12) {
            window.setTimeout(measure, 80);
          } else {
            setHole(null);
          }
          return;
        }
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        window.setTimeout(() => {
          if (cancelled) return;
          const r = el.getBoundingClientRect();
          const h = padRect(r, 10);
          setHole(h);

          const maxWidth = Math.min(380, Math.max(240, window.innerWidth - 32));
          const gap = 14;
          let top = h.top + h.height + gap;
          let left = Math.min(h.left, window.innerWidth - maxWidth - 16);
          left = Math.max(16, left);

          const preferAbove =
            step.prefer === 'above' ||
            (step.prefer !== 'below' && top + 200 > window.innerHeight - 16);
          if (preferAbove) {
            top = Math.max(16, h.top - gap - 180);
          }
          if (top + 200 > window.innerHeight - 12) {
            top = Math.max(16, window.innerHeight - 220);
          }
          setCardPos({ top, left, maxWidth });
        }, 180);
      };

      measure();
    };

    void prepare();
    const onResize = () => {
      tries = 0;
      void prepare();
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
    };
  }, [active, step, index, onNavigate, onSettingsScroll]);

  useLayoutEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);

  if (!active || !step) return null;

  const isLast = index >= total - 1;
  const arrowSide =
    hole && cardPos.top > hole.top + hole.height / 2 ? 'up' : hole ? 'down' : null;

  return createPortal(
    <div className="setup-tour-root" role="dialog" aria-modal="true" aria-labelledby="setup-tour-title">
      <div className="setup-tour-dim" aria-hidden="true">
        {hole ? (
          <div
            className="setup-tour-hole"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
            }}
          />
        ) : null}
      </div>

      {hole && arrowSide ? (
        <div
          className={`setup-tour-arrow setup-tour-arrow-${arrowSide}`}
          style={{
            top:
              arrowSide === 'up'
                ? hole.top + hole.height + 2
                : Math.max(0, cardPos.top - 10),
            left: hole.left + hole.width / 2,
          }}
          aria-hidden="true"
        />
      ) : null}

      <div
        className="setup-tour-card"
        style={{
          top: cardPos.top,
          left: cardPos.left,
          maxWidth: cardPos.maxWidth,
          width: `min(${cardPos.maxWidth}px, calc(100vw - 32px))`,
        }}
      >
        <p className="setup-tour-progress">{t.setup.stepOf(index + 1, total)}</p>
        <h3 id="setup-tour-title">{copy.title}</h3>
        <p className="setup-tour-body">{copy.body}</p>
        <div className="setup-tour-actions">
          <button type="button" className="btn btn-ghost" onClick={onFinish}>
            {t.setup.skip}
          </button>
          <div className="setup-tour-nav">
            {index > 0 && (
              <button type="button" className="btn btn-secondary" onClick={() => setIndex((i) => i - 1)}>
                {t.setup.back}
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (isLast) onFinish();
                else setIndex((i) => i + 1);
              }}
            >
              {isLast ? t.setup.done : t.setup.next}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
