/** Pure helpers for the floating Back-to-top control. */

/** Show after the user has scrolled past roughly one viewport of content. */
export const BACK_TO_TOP_THRESHOLD_PX = 480;

export function shouldShowBackToTop(scrollY: number, threshold = BACK_TO_TOP_THRESHOLD_PX): boolean {
  return Number.isFinite(scrollY) && scrollY >= threshold;
}
