/**
 * useBodyScrollLock — locks the parent body from scrolling while an overlay
 * (modal / drawer / full-view) is open.
 *
 * The classic `document.body.style.overflow = 'hidden'` approach fails on
 * iOS Safari and some Android browsers — the body still scrolls under the
 * overlay when the user drags inside it. The robust pattern is to switch
 * body to `position: fixed` and remember the scroll position so we can
 * restore it when the overlay closes. We also add `overscroll-behavior:
 * contain` on the body so wheel/trackpad scroll-chaining is suppressed.
 *
 * Usage:
 *   useBodyScrollLock(isOpen);
 *
 * Or, if the hook should always be active when the component mounts:
 *   useBodyScrollLock(true);
 */
import { useEffect } from 'react';

export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const prev = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      width: document.body.style.width,
      height: document.body.style.height,
      overscroll: document.body.style.overscrollBehavior,
    };
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = `-${scrollX}px`;
    document.body.style.width = '100%';
    document.body.style.height = 'auto';
    document.body.style.overscrollBehavior = 'contain';

    return () => {
      // Restore previous styles
      document.body.style.overflow = prev.overflow;
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.left = prev.left;
      document.body.style.width = prev.width;
      document.body.style.height = prev.height;
      document.body.style.overscrollBehavior = prev.overscroll;
      // Restore scroll position
      window.scrollTo(scrollX, scrollY);
    };
  }, [active]);
}
