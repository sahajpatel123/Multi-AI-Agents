import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { scrollBehavior } from '../lib/motion';
import { scrollIntentForLocation } from '../lib/scrollIntent';

/**
 * On path change: scroll to top.
 * On hash navigation: scroll to the matching element when present.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    const intent = scrollIntentForLocation(pathname, hash);
    const behavior = scrollBehavior();

    if (intent.type === 'hash') {
      // Wait a frame so lazy route content can paint.
      const id = window.requestAnimationFrame(() => {
        const el = document.getElementById(intent.id);
        if (el) {
          el.scrollIntoView({ behavior, block: 'start' });
        } else {
          window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        }
      });
      return () => window.cancelAnimationFrame(id);
    }

    // Soft settle on route change; collapses to instant under reduced motion.
    window.scrollTo({ top: 0, left: 0, behavior });
  }, [pathname, hash]);
  return null;
}

export default ScrollToTop;
