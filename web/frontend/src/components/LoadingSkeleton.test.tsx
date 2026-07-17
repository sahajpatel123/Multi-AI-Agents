import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { LoadingSkeleton } from './LoadingSkeleton';

/**
 * Capture and restore matchMedia across tests — the reduced-motion
 * helper depends on it, so we need a stable, controllable implementation
 * that doesn't leak between cases.
 */
function installMatchMedia(reducedMotion: boolean) {
  const listeners: Array<() => void> = [];
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('reduce') ? reducedMotion : false,
      media: query,
      onchange: null,
      addListener: (cb: () => void) => listeners.push(cb),
      removeListener: (cb: () => void) => {
        const i = listeners.indexOf(cb);
        if (i !== -1) listeners.splice(i, 1);
      },
      addEventListener: (_: string, cb: () => void) => listeners.push(cb),
      removeEventListener: (_: string, cb: () => void) => {
        const i = listeners.indexOf(cb);
        if (i !== -1) listeners.splice(i, 1);
      },
      dispatchEvent: () => false,
    }),
  });
  return listeners;
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
    // Each card has 5 inner pulse elements per the layout.
    expect(container.querySelectorAll('[role="status"] > div').length).toBe(4);
  });

  it('honors count prop', () => {
    installMatchMedia(false);
    const { container } = render(<LoadingSkeleton count={2} />);
    expect(container.querySelectorAll('[role="status"] > div').length).toBe(2);
  });

  it('caps count at the number of available agents', () => {
    installMatchMedia(false);
    const { container } = render(<LoadingSkeleton count={99} />);
    // We have 4 canonical agents — count > 4 should cap at 4.
    expect(container.querySelectorAll('[role="status"] > div').length).toBe(4);
  });

  it('has role=status and aria-live=polite so screen readers announce it', () => {
    installMatchMedia(false);
    const { container } = render(<LoadingSkeleton />);
    const region = container.querySelector('[role="status"]');
    expect(region).toHaveAttribute('aria-live', 'polite');
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
    // Pulse overlay is rendered as a child div when animation is on.
    expect(container.querySelector('.pointer-events-none')).not.toBeNull();
  });

  it('skips the pulse overlay when prefers-reduced-motion is on', () => {
    installMatchMedia(true);
    const { container } = render(<LoadingSkeleton />);
    // Vestibular users get static skeletons — no perpetual shimmer.
    expect(container.querySelector('.pointer-events-none')).toBeNull();
  });
});