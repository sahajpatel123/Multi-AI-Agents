import { useEffect, useState } from 'react';
import { prefersReducedMotion, scrollBehavior } from '../lib/motion';
import {
  progressRingDashOffset,
  scrollProgressRatio,
  shouldShowBackToTop,
} from '../lib/backToTop';

const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Floating control for long pages (Agent answers, marketing, changelog).
 * Appears after meaningful scroll; shows document progress on the ring.
 */
export function BackToTopButton() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const reducedMotion = prefersReducedMotion();

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      const y = window.scrollY || window.pageYOffset || 0;
      const doc = document.documentElement;
      const scrollHeight = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0);
      const vh = window.innerHeight || doc.clientHeight || 0;
      setVisible(shouldShowBackToTop(y));
      setProgress(scrollProgressRatio(y, scrollHeight, vh));
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  if (!visible) return null;

  const dashOffset = progressRingDashOffset(progress, RING_C);
  const pct = Math.round(progress * 100);

  return (
    <button
      type="button"
      className={[
        'back-to-top-btn',
        reducedMotion ? 'back-to-top-btn--static' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`Back to top, ${pct}% through page`}
      title={`Back to top · ${pct}%`}
      onClick={() => {
        window.scrollTo({ top: 0, left: 0, behavior: scrollBehavior() });
        const main = document.getElementById('main-content');
        if (main instanceof HTMLElement) {
          main.focus({ preventScroll: true });
        }
      }}
    >
      <span className="back-to-top-btn__ring-wrap" aria-hidden>
        <svg className="back-to-top-btn__ring" width="36" height="36" viewBox="0 0 36 36">
          <circle
            className="back-to-top-btn__ring-track"
            cx="18"
            cy="18"
            r={RING_R}
            fill="none"
            strokeWidth="2"
          />
          <circle
            className="back-to-top-btn__ring-progress"
            cx="18"
            cy="18"
            r={RING_R}
            fill="none"
            strokeWidth="2"
            strokeDasharray={RING_C}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 18 18)"
          />
        </svg>
        <svg className="back-to-top-btn__arrow" width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 19V5M5 12l7-7 7 7"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="back-to-top-btn__label">Top</span>
    </button>
  );
}

export default BackToTopButton;
