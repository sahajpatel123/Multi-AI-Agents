import { describe, expect, it } from 'vitest';
import {
  BACK_TO_TOP_THRESHOLD_PX,
  progressRingDashOffset,
  scrollProgressRatio,
  shouldShowBackToTop,
} from './backToTop';

describe('backToTop', () => {
  it('hides near the top of the page', () => {
    expect(shouldShowBackToTop(0)).toBe(false);
    expect(shouldShowBackToTop(BACK_TO_TOP_THRESHOLD_PX - 1)).toBe(false);
  });

  it('shows past the threshold', () => {
    expect(shouldShowBackToTop(BACK_TO_TOP_THRESHOLD_PX)).toBe(true);
    expect(shouldShowBackToTop(2000)).toBe(true);
  });

  it('computes scroll progress ratio', () => {
    expect(scrollProgressRatio(0, 2000, 1000)).toBe(0);
    expect(scrollProgressRatio(500, 2000, 1000)).toBe(0.5);
    expect(scrollProgressRatio(1000, 2000, 1000)).toBe(1);
    expect(scrollProgressRatio(9999, 2000, 1000)).toBe(1);
    expect(scrollProgressRatio(10, 100, 100)).toBe(0);
  });

  it('maps progress to ring dash offset', () => {
    const c = 100;
    expect(progressRingDashOffset(0, c)).toBe(100);
    expect(progressRingDashOffset(0.5, c)).toBe(50);
    expect(progressRingDashOffset(1, c)).toBe(0);
  });
});
