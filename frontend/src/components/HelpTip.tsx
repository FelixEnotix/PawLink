import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircleIcon } from './icons';

interface HelpTipProps {
  text: string;
  label?: string;
  className?: string;
}

/**
 * Click-to-open help (not hover). Positions a popover near the "?" button
 * and clamps it inside the viewport for non-standard screens.
 */
export function HelpTip({ text, label = 'Help', className }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; maxWidth: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const place = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const margin = 12;
      const maxWidth = Math.min(340, Math.max(200, window.innerWidth - margin * 2));
      let left = r.left;
      let top = r.bottom + 8;
      if (left + maxWidth > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - margin - maxWidth);
      }
      if (top + 160 > window.innerHeight - margin) {
        top = Math.max(margin, r.top - 8 - 140);
      }
      setCoords({ top, left, maxWidth });
    };

    place();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`help-tip-btn ${className ?? ''}`.trim()}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <HelpCircleIcon size={15} />
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            className="help-tip-popover"
            style={{
              top: coords.top,
              left: coords.left,
              maxWidth: coords.maxWidth,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p>{text}</p>
          </div>,
          document.body,
        )}
    </>
  );
}
