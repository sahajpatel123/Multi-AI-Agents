import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Button } from './Button';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Button motion wiring', () => {
  it('applies full transition when reduced motion is off', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        media: '',
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
    const { getByRole } = render(<Button>Go</Button>);
    const btn = getByRole('button', { name: 'Go' });
    expect(btn.style.transition).toMatch(/240ms|280ms/);
    expect(btn.style.transition).toMatch(/transform/);
    expect(btn.style.transition).toMatch(/box-shadow/);
  });

  it('collapses transition to none when reduced motion is on', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
    const { getByRole } = render(<Button>Go</Button>);
    const btn = getByRole('button', { name: 'Go' });
    expect(btn.style.transition).toBe('none');
  });
});
