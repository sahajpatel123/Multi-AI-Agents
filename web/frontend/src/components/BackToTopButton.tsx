import { useEffect, useState } from 'react';
import { scrollBehavior } from '../lib/motion';
import { shouldShowBackToTop } from '../lib/backToTop';

/**
 * Floating control for long pages (Agent answers, marketing, changelog).
 * Appears after meaningful scroll; honors prefers-reduced-motion via scrollBehavior().
 */
export function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(shouldShowBackToTop(window.scrollY || window.pageYOffset || 0));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="back-to-top-btn"
      aria-label="Back to top"
      title="Back to top"
      onClick={() => {
        window.scrollTo({ top: 0, left: 0, behavior: scrollBehavior() });
        // Return keyboard focus to main content when present.
        const main = document.getElementById('main-content');
        if (main instanceof HTMLElement) {
          main.focus({ preventScroll: true });
        }
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 19V5M5 12l7-7 7 7"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="back-to-top-btn__label">Top</span>
    </button>
  );
}

export default BackToTopButton;
