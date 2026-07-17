import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import MicroLoader from './MicroLoader';

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

describe('MicroLoader', () => {
  it('renders with role=status for AT announcement', () => {
    installMatchMedia(false);
    const { container } = render(<MicroLoader />);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it('carries aria-busy=true so AT knows the region is loading', () => {
    installMatchMedia(false);
    const { container } = render(<MicroLoader />);
    expect(container.querySelector('[role="status"]')).toHaveAttribute('aria-busy', 'true');
  });

  it('uses the supplied label as aria-label', () => {
    installMatchMedia(false);
    const { container } = render(<MicroLoader label="Analyzing your answer" />);
    expect(container.querySelector('[role="status"]')).toHaveAttribute(
      'aria-label',
      'Analyzing your answer',
    );
  });

  it('falls back to "Loading" when no label is given', () => {
    installMatchMedia(false);
    const { container } = render(<MicroLoader />);
    expect(container.querySelector('[role="status"]')).toHaveAttribute('aria-label', 'Loading');
  });

  it('renders a canvas when motion is allowed', () => {
    installMatchMedia(false);
    const { container } = render(<MicroLoader />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders text instead of canvas when prefers-reduced-motion', () => {
    installMatchMedia(true);
    const { container } = render(<MicroLoader label="Working" />);
    // No canvas — the static text label replaces it.
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.textContent).toMatch(/Working/);
  });

  it('renders a screen-reader-only text node for the label', () => {
    installMatchMedia(false);
    const { container } = render(<MicroLoader label="Thinking" />);
    // The screen-reader-only span carries the label so AT users hear it
    // even while the canvas animates silently.
    expect(container.textContent).toMatch(/Thinking/);
  });

  it('respects cycleWords=false (one-shot loader)', () => {
    installMatchMedia(false);
    // Smoke test — we don't simulate the rAF loop, just confirm the
    // prop is accepted without throwing and renders the canvas.
    const { container } = render(<MicroLoader cycleWords={false} />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });
});