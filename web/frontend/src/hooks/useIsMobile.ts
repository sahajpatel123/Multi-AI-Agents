import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 768;
const SMALL_BREAKPOINT = 480;

function getMatches(query: string) {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(query).matches;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => getMatches(`(max-width: ${MOBILE_BREAKPOINT}px)`));

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  return isMobile;
}

export function useIsSmallScreen() {
  const [isSmallScreen, setIsSmallScreen] = useState(() => getMatches(`(max-width: ${SMALL_BREAKPOINT}px)`));

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${SMALL_BREAKPOINT}px)`);
    const handleChange = () => setIsSmallScreen(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  return isSmallScreen;
}
