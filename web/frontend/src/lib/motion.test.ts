import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INTERACTION,
  MOTION_MS,
  interactiveTransition,
  motionDuration,
  motionTransition,
  prefersReducedMotion,
  scrollBehavior,
} from './motion';

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
    expect(scrollBehavior()).toBe('smooth');
  });

  it('collapses duration and transitions when reduce is preferred', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, media: '(prefers-reduced-motion: reduce)', addEventListener: () => {}, removeEventListener: () => {} })),
    );
    expect(prefersReducedMotion()).toBe(true);
    expect(motionDuration(200)).toBe(0);
    expect(motionTransition('all', 200)).toBe('none');
    expect(scrollBehavior()).toBe('auto');
  });
});

describe('interaction tokens', () => {
  it('exposes stable hover/tap presets for framer-motion CTAs', () => {
    expect(INTERACTION.hover.y).toBe(-2);
    expect(INTERACTION.hover.scale).toBeGreaterThan(1);
    expect(INTERACTION.tap.scale).toBeLessThan(1);
    expect(MOTION_MS.hover).toBeGreaterThan(0);
    expect(MOTION_MS.press).toBeLessThan(MOTION_MS.hover);
  });

  it('builds multi-property interactive transitions', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, media: '', addEventListener: () => {}, removeEventListener: () => {} })),
    );
    const t = interactiveTransition();
    expect(t).toContain('transform');
    expect(t).toContain('box-shadow');
    expect(t).toContain(`${MOTION_MS.hover}ms`);
  });

  it('collapses interactive transitions under reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, media: '(prefers-reduced-motion: reduce)', addEventListener: () => {}, removeEventListener: () => {} })),
    );
    expect(interactiveTransition()).toBe('none');
  });
});
