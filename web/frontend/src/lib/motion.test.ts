import { afterEach, describe, expect, it, vi } from 'vitest';
import { motionDuration, motionTransition, prefersReducedMotion } from './motion';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('prefersReducedMotion / motionDuration', () => {
  it('returns false and full duration when matchMedia says no reduce', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, media: '', addEventListener: () => {}, removeEventListener: () => {} })),
    );
    expect(prefersReducedMotion()).toBe(false);
    expect(motionDuration(200)).toBe(200);
    expect(motionTransition('opacity', 180)).toContain('180ms');
  });

  it('collapses duration and transitions when reduce is preferred', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, media: '(prefers-reduced-motion: reduce)', addEventListener: () => {}, removeEventListener: () => {} })),
    );
    expect(prefersReducedMotion()).toBe(true);
    expect(motionDuration(200)).toBe(0);
    expect(motionTransition('all', 200)).toBe('none');
  });
});
