/**
 * InfoIconPopup.tsx — Reusable info-icon + popup card.
 *
 * Replaces inline tool-explanation paragraphs across all pages. Renders as a
 * small italic "i" icon (slanted i with a dot on top) that, when clicked,
 * opens a centred popover card with the help text.
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
import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';

interface InfoIconPopupProps {
  /** Accessible label for the trigger (e.g. "What does Viral Forge do?"). */
  label: string;
  /** Popup content — can be a string, JSX, or any ReactNode. */
  children: ReactNode;
  /** Optional size variant for the icon. */
  size?: 'sm' | 'md' | 'lg';
  /** Optional className for custom positioning (e.g. 'ml-2'). */
  className?: string;
}

const SIZE_MAP = {
  sm: { icon: 'w-3.5 h-3.5', button: 'w-5 h-5', text: 'text-xs' },
  md: { icon: 'w-4 h-4',     button: 'w-6 h-6', text: 'text-sm' },
  lg: { icon: 'w-5 h-5',     button: 'w-7 h-7', text: 'text-sm' },
};

export function InfoIconPopup({ label, children, size = 'sm', className = '' }: InfoIconPopupProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const s = SIZE_MAP[size];

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Close on click outside
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
    // Use setTimeout to avoid the click that OPENED the popup from immediately closing it
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
        {/* Slanted "i" with a dot on top — the requested info icon.
            We use a serif italic "i" glyph + a small dot above it.
            Built with SVG for consistent rendering across browsers. */}
        <svg
          viewBox="0 0 16 16"
          className={s.icon}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Dot on top */}
          <circle cx="8" cy="2.5" r="1.2" fill="currentColor" />
          {/* Slanted i body — a thin italic line */}
          <path
            d="M9.5 4.5 L6.5 13.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {/* Small serif foot at the bottom for the classic "i" look */}
          <path
            d="M5.5 13.5 L7.5 13.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div
          ref={popupRef}
          role="dialog"
          aria-label={label}
          className="absolute z-[200] top-full mt-2 right-0 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 w-72 sm:w-80 max-w-[calc(100vw-1rem)] p-4 rounded-xl bg-clip-surface border border-white/[0.08] shadow-2xl backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Tail pointer (top-right on mobile, top-center on desktop) */}
          <div className="absolute -top-1.5 right-3 sm:left-1/2 sm:-translate-x-1/2 w-3 h-3 rotate-45 bg-clip-surface border-l border-t border-white/[0.08]" />

          {/* Label header */}
          <p className="text-[10px] uppercase tracking-wider font-bold text-clip-cyan mb-2">
            {label}
          </p>

          {/* Content */}
          <div className={`${s.text} text-clip-muted leading-relaxed`}>
            {children}
          </div>
        </div>
      )}
    </span>
  );
}
