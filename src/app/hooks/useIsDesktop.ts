/**
 * useIsDesktop — true when the viewport is at/above the desktop breakpoint
 * (min-width: 900px). Viewport-gated, exactly like isNative() is platform-gated:
 * phones/mobile are always below it, so the app renders its existing mobile
 * layout; a desktop browser is above it and gets the wide treatment.
 *
 * SSR/initial-render safe: defaults to `false` (mobile) until matchMedia is read
 * in an effect, so the first paint is never wider than the real viewport.
 */

import { useEffect, useState } from 'react';

export const DESKTOP_QUERY = '(min-width: 900px)';

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsDesktop(mql.matches);
    update(); // measure now
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return isDesktop;
}
