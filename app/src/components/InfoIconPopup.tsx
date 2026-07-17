/**
 * InfoIconPopup.tsx — Reusable info-icon + popup card.
 *
 * Replaces inline tool-explanation paragraphs across all pages. Renders as a
 * small upright "i" icon (straight lowercase i with dot on top) that, when
 * clicked, opens a popover card with the help text.
 *
 * The popup is rendered via a React portal to <body>, so it is NOT clipped by
 * parent containers with `overflow: hidden` (which was the previous bug — the
 * popup was being cut off inside cards with overflow-hidden). Position is
 * computed from the trigger's bounding rect on every open.
 *
 * Usage:
 *   <InfoIconPopup label="What does Viral Forge do?">
 *     Paste a YouTube URL and get 14 viral strategy outputs in one shot…
 *   </InfoIconPopup>
 *
 * The popup closes on:
 *   - Click outside (backdrop)
 *   - Pressing Escape
 *   - Clicking the icon again
 *
 * Accessibility:
 *   - role="button" + aria-label + aria-expanded on the trigger
 *   - role="dialog" + aria-label on the popup
 *   - Tab focus is preserved; Esc closes
 */
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

interface InfoIconPopupProps {
  /** Accessible label for the trigger (e.g. "What does Viral Forge do?"). */
  label: string;
  /** Popup content — can be a string, JSX, or any ReactNode. */
  children: ReactNode;
  /** Optional size variant for the icon. Defaults to 'sm'. */
  size?: 'sm' | 'md' | 'lg';
  /** Optional className for custom positioning (e.g. 'ml-2'). */
  className?: string;
}

const SIZE_MAP = {
  sm: { icon: 'w-3 h-3',     button: 'w-4 h-4',     text: 'text-xs' },
  md: { icon: 'w-3.5 h-3.5', button: 'w-5 h-5',     text: 'text-sm' },
  lg: { icon: 'w-4 h-4',     button: 'w-6 h-6',     text: 'text-sm' },
};

type PopupPos = { top: number; left: number; arrowLeft: number } | null;

export function InfoIconPopup({ label, children, size = 'sm', className = '' }: InfoIconPopupProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopupPos>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const s = SIZE_MAP[size];

  // Compute popup position from trigger rect. Runs on every open + on scroll/resize.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const compute = () => {
      const r = triggerRef.current!.getBoundingClientRect();
      const POPUP_W = window.innerWidth < 640 ? Math.min(288, window.innerWidth - 16) : 320;
      // Center popup on trigger horizontally, clamp to viewport.
      let left = r.left + r.width / 2 - POPUP_W / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - POPUP_W - 8));
      // Position below trigger with a small gap.
      const top = r.bottom + 8;
      // Arrow points back up at the trigger — its left offset is the trigger's
      // center relative to the popup's left edge.
      const arrowLeft = Math.max(16, Math.min(POPUP_W - 16, r.left + r.width / 2 - left));
      setPos({ top, left, arrowLeft });
    };
    compute();
    // Recompute on scroll/resize (popup should track the trigger).
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Close on click outside (both trigger + popup)
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        popupRef.current && !popupRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const id = setTimeout(() => window.addEventListener('click', onClick), 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener('click', onClick);
    };
  }, [open]);

  return (
    <span className={`relative inline-flex align-middle ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(prev => !prev); }}
        aria-label={label}
        aria-expanded={open}
        title={label}
        className={`${s.button} inline-flex items-center justify-center rounded-full text-clip-muted hover:text-clip-cyan hover:bg-clip-cyan/10 transition-colors flex-shrink-0`}
      >
        {/* Straight upright "i" with a dot on top. Built with SVG for
            consistent rendering. Smaller than the previous slanted version. */}
        <svg
          viewBox="0 0 16 16"
          className={s.icon}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Dot on top */}
          <circle cx="8" cy="3" r="1.4" fill="currentColor" />
          {/* Straight vertical i body */}
          <path
            d="M8 5.5 L8 13"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          ref={popupRef}
          role="dialog"
          aria-label={label}
          style={{
            position: 'fixed',
            top: `${pos.top}px`,
            left: `${pos.left}px`,
            zIndex: 9999,
          }}
          className="w-72 sm:w-80 max-w-[calc(100vw-1rem)] p-4 rounded-xl bg-clip-surface border border-white/[0.08] shadow-2xl backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Tail pointer — points up at the trigger */}
          <div
            className="absolute -top-1.5 w-3 h-3 rotate-45 bg-clip-surface border-l border-t border-white/[0.08]"
            style={{ left: `${pos.arrowLeft - 6}px` }}
          />

          {/* Label header */}
          <p className="text-[10px] uppercase tracking-wider font-bold text-clip-cyan mb-2">
            {label}
          </p>

          {/* Content */}
          <div className={`${s.text} text-clip-muted leading-relaxed`}>
            {children}
          </div>
        </div>,
        document.body
      )}
    </span>
  );
}
