import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { CollapsiblePrompt } from './CollapsiblePrompt';

// Stub useIsMobile so we don't depend on jsdom's matchMedia behavior.
vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

function installMatchMedia(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('reduce') ? reduce : false,
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

describe('CollapsiblePrompt', () => {
  it('renders short text without collapse affordance', () => {
    installMatchMedia(false);
    const { container, queryByRole } = render(
      <CollapsiblePrompt text="A short prompt." />,
    );
    expect(container.textContent).toContain('A short prompt.');
    // No role=button — short text is plain.
    expect(queryByRole('button')).toBeNull();
  });

  it('renders long text as a button with aria-expanded=false', () => {
    installMatchMedia(false);
    const longText = 'This is a deliberately long prompt that exceeds the collapsible threshold so the affordance should appear. '.repeat(3);
    const { getByRole } = render(<CollapsiblePrompt text={longText} />);
    const btn = getByRole('button');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('toggles aria-expanded on click', () => {
    installMatchMedia(false);
    const longText = 'Long prompt. '.repeat(10);
    const { getByRole } = render(<CollapsiblePrompt text={longText} />);
    const btn = getByRole('button');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('responds to Enter and Space keys', () => {
    installMatchMedia(false);
    const longText = 'Long prompt. '.repeat(10);
    const { getByRole } = render(<CollapsiblePrompt text={longText} />);
    const btn = getByRole('button');
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('resets to collapsed when the text prop changes', () => {
    installMatchMedia(false);
    const longText = 'Long prompt. '.repeat(10);
    const { getByRole, rerender } = render(
      <CollapsiblePrompt text={longText} />,
    );
    const btn = getByRole('button');
    // Expand it.
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    // Re-render with new text — must reset to collapsed.
    rerender(<CollapsiblePrompt text={"A completely different prompt that is also long enough to be collapsible in the lib. ".repeat(2)} />);
    // Note: whether the new text is "long" depends on isCollapsiblePrompt's
    // threshold. We just check the expanded flag — re-collapsed is the
    // contract.
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('honors prefers-reduced-motion (no transition)', () => {
    installMatchMedia(true);
    const longText = 'Long prompt. '.repeat(10);
    const { container } = render(<CollapsiblePrompt text={longText} />);
    // The inner collapse div has transition='none' when reduced motion
    // is on (the lib helper returns that value).
    const collapseDiv = container.querySelector('div[style*="max-height"]');
    expect(collapseDiv).not.toBeNull();
    expect((collapseDiv as HTMLElement).style.transition).toBe('none');
  });
});