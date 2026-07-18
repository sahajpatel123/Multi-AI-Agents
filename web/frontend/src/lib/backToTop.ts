/** Pure helpers for the floating Back-to-top control. */

/** Show after the user has scrolled past roughly one viewport of content. */
export const BACK_TO_TOP_THRESHOLD_PX = 480;

export function shouldShowBackToTop(scrollY: number, threshold = BACK_TO_TOP_THRESHOLD_PX): boolean {
  return Number.isFinite(scrollY) && scrollY >= threshold;
}

/**
 * Document scroll progress as 0–1 (how far through the page the user is).
 * Safe when document height is zero or not yet measurable.
 */
export function scrollProgressRatio(
  scrollY: number,
  scrollHeight: number,
  viewportHeight: number,
): number {
  if (!Number.isFinite(scrollY) || !Number.isFinite(scrollHeight) || !Number.isFinite(viewportHeight)) {
    return 0;
  }
  const max = Math.max(0, scrollHeight - viewportHeight);
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, scrollY / max));
}

/** SVG circle stroke-dashoffset for a progress ring (full = 0 progress remaining). */
export function progressRingDashOffset(progress01: number, circumference: number): number {
  const p = Math.min(1, Math.max(0, progress01));
  const c = Math.max(0, circumference);
  return c * (1 - p);
}
