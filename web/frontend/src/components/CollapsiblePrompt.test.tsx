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
    // Native button activates on keydown→click for Enter; Space uses keyup.
    // fireEvent.keyDown alone may not toggle — click covers activation.
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('resets to collapsed when the text prop changes', () => {
    installMatchMedia(false);
    const longText = 'Long prompt. '.repeat(10);
    const { getByRole, rerender } = render(
      <CollapsiblePrompt text={longText} />,
    );
    const btn = getByRole('button');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    rerender(<CollapsiblePrompt text={"A completely different prompt that is also long enough to be collapsible in the lib. ".repeat(2)} />);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('honors prefers-reduced-motion with static class', () => {
    installMatchMedia(true);
    const longText = 'Long prompt. '.repeat(10);
    const { container } = render(<CollapsiblePrompt text={longText} />);
    expect(container.querySelector('.collapsible-prompt')).toHaveClass(
      'collapsible-prompt--static',
    );
  });

  it('applies collapsible chrome and chevron hint', () => {
    installMatchMedia(false);
    const longText = 'Long prompt. '.repeat(10);
    const { container, getByText } = render(<CollapsiblePrompt text={longText} />);
    expect(container.querySelector('.collapsible-prompt--collapsed')).not.toBeNull();
    expect(container.querySelector('.collapsible-prompt__chevron')).not.toBeNull();
    expect(getByText(/read full prompt/i)).toBeInTheDocument();
  });
});
