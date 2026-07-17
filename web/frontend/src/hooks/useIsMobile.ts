import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query and re-render whenever its match
 * state changes. Returns null during SSR (no window) so the first
 * client render can mark the layout correctly without a flicker.
 *
 * The hook handles three subtle behaviors:
 *
 *  - SSR safety: returns the initial match state synchronously when
 *    window exists, null otherwise. A null return signals 'unknown
 *    yet' — components can render a neutral default rather than
 *    guessing.
 *  - Lazy initial state via the `() => ...` form of useState so the
 *    matchMedia call runs once on mount, not on every render.
 *  - Listener cleanup: removes the change listener on unmount and
 *    on query change (the effect re-runs if `query` ever changes).
 */
export function useMediaQuery(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia(query);
    // Sync the state in case the query changed since mount.
    setMatches(media.matches);
    const handleChange = () => setMatches(media.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

const MOBILE_BREAKPOINT = 768;
const SMALL_BREAKPOINT = 480;

export function useIsMobile() {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT}px)`) ?? false;
}

export function useIsSmallScreen() {
  return useMediaQuery(`(max-width: ${SMALL_BREAKPOINT}px)`) ?? false;
}