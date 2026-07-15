/**
 * Shared motion helpers — keep polish restrained and accessible.
 */

/** True when the user (or OS) prefers reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Duration in ms for micro-interactions. Returns 0 when reduced motion is on
 * so callers can skip timed transitions without forking every animation site.
 */
export function motionDuration(ms: number): number {
  if (ms <= 0) return 0;
  return prefersReducedMotion() ? 0 : ms;
}

/** CSS transition string that collapses to none under reduced motion. */
export function motionTransition(
  property = 'all',
  ms = 200,
  easing = 'cubic-bezier(0.22, 1, 0.36, 1)',
): string {
  if (prefersReducedMotion()) return 'none';
  return `${property} ${ms}ms ${easing}`;
}
