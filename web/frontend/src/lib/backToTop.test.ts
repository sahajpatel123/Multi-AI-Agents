import { describe, expect, it } from 'vitest';
import { BACK_TO_TOP_THRESHOLD_PX, shouldShowBackToTop } from './backToTop';

describe('backToTop', () => {
  it('hides near the top of the page', () => {
    expect(shouldShowBackToTop(0)).toBe(false);
    expect(shouldShowBackToTop(BACK_TO_TOP_THRESHOLD_PX - 1)).toBe(false);
  });

  it('shows past the threshold', () => {
    expect(shouldShowBackToTop(BACK_TO_TOP_THRESHOLD_PX)).toBe(true);
    expect(shouldShowBackToTop(2000)).toBe(true);
  });
});
