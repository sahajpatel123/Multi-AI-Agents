import { afterEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { LoadingSkeleton } from './LoadingSkeleton';

function installMatchMedia(reducedMotion: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('reduce') ? reducedMotion : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: undefined,
  });
});

describe('LoadingSkeleton', () => {
  it('renders four cards by default (canonical panel size)', () => {
    installMatchMedia(false);
    const { container } = render(<LoadingSkeleton />);
    expect(container.querySelectorAll('.arena-skeleton__card').length).toBe(4);
  });

  it('honors count prop', () => {
    installMatchMedia(false);
    const { container } = render(<LoadingSkeleton count={2} />);
    expect(container.querySelectorAll('.arena-skeleton__card').length).toBe(2);
  });

  it('caps count at the number of available agents', () => {
    installMatchMedia(false);
    const { container } = render(<LoadingSkeleton count={99} />);
    expect(container.querySelectorAll('.arena-skeleton__card').length).toBe(4);
  });

  it('has role=status and aria-live=polite so screen readers announce it', () => {
    installMatchMedia(false);
    const { container } = render(<LoadingSkeleton />);
    const region = container.querySelector('[role="status"]');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-busy', 'true');
  });

  it('uses a custom aria-label when provided', () => {
    installMatchMedia(false);
    const { container } = render(
      <LoadingSkeleton label="Fetching arena responses" />,
    );
    expect(container.querySelector('[role="status"]')).toHaveAttribute(
      'aria-label',
      'Fetching arena responses',
    );
  });

  it('animates when prefers-reduced-motion is off', () => {
    installMatchMedia(false);
    const { container } = render(<LoadingSkeleton />);
    expect(container.querySelector('.arena-skeleton')).toHaveClass('arena-skeleton--animate');
    expect(container.querySelector('.arena-skeleton__shimmer')).not.toBeNull();
  });

  it('skips the shimmer when prefers-reduced-motion is on', () => {
    installMatchMedia(true);
    const { container } = render(<LoadingSkeleton />);
    expect(container.querySelector('.arena-skeleton')).toHaveClass('arena-skeleton--static');
    expect(container.querySelector('.arena-skeleton__shimmer')).toBeNull();
  });
});
