import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { MotionButton } from './MotionButton';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const stubMatchMedia = (prefersReduced: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      // Full MediaQueryList shape — framer-motion's reduced-motion detector
      // calls addListener/removeListener (legacy) AND addEventListener/
      // removeEventListener (standard). jsdom's stub in test/setup.ts only
      // provides the standard pair; we need both here.
      matches: prefersReduced,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })),
  );

describe('MotionButton', () => {
  it('renders children with the base arena-btn class', () => {
    stubMatchMedia(false);
    const { getByRole } = render(<MotionButton>Send</MotionButton>);
    const btn = getByRole('button', { name: 'Send' });
    expect(btn).toHaveClass('arena-btn', 'arena-btn--primary');
  });

  it('applies the variant and size classes', () => {
    stubMatchMedia(false);
    const { getByRole } = render(
      <MotionButton variant="danger" size="lg">
        Delete
      </MotionButton>,
    );
    const btn = getByRole('button', { name: 'Delete' });
    expect(btn).toHaveClass('arena-btn--danger', 'arena-btn--lg');
  });

  it('disables interaction when loading or disabled', () => {
    stubMatchMedia(false);
    const onClick = vi.fn();
    const { getByRole, container } = render(
      <MotionButton loading onClick={onClick}>
        Save
      </MotionButton>,
    );
    const btn = getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.arena-btn-spinner')).not.toBeNull();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies motion-btn chrome class', () => {
    stubMatchMedia(false);
    const { getByRole } = render(<MotionButton>Lift</MotionButton>);
    expect(getByRole('button', { name: 'Lift' })).toHaveClass('motion-btn');
  });

  it('fires onClick when enabled', () => {
    stubMatchMedia(false);
    const onClick = vi.fn();
    const { getByRole } = render(
      <MotionButton onClick={onClick}>Run</MotionButton>,
    );
    fireEvent.click(getByRole('button', { name: 'Run' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('sets type=button by default so it never accidentally submits forms', () => {
    stubMatchMedia(false);
    const { getByRole } = render(<MotionButton>Go</MotionButton>);
    expect(getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('respects explicit type="submit"', () => {
    stubMatchMedia(false);
    const { getByRole } = render(<MotionButton type="submit">Send</MotionButton>);
    expect(getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('renders fullWidth class when fullWidth prop is set', () => {
    stubMatchMedia(false);
    const { getByRole } = render(<MotionButton fullWidth>Wide</MotionButton>);
    expect(getByRole('button')).toHaveClass('arena-btn--full');
  });

  it('forwards refs so parents can imperatively focus the button', () => {
    stubMatchMedia(false);
    const ref = { current: null as HTMLButtonElement | null };
    render(<MotionButton ref={ref}>Focus me</MotionButton>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    ref.current?.focus();
    expect(document.activeElement).toHaveTextContent('Focus me');
  });
});

describe('MotionButton reduced-motion behavior', () => {
  it('does not crash under prefers-reduced-motion', () => {
    // The most important regression check: motion handlers must be a no-op
    // (not an error) when the OS says the user wants less motion.
    stubMatchMedia(true);
    const { getByRole } = render(<MotionButton>Calm</MotionButton>);
    const btn = getByRole('button', { name: 'Calm' });
    expect(btn).toBeInTheDocument();
    fireEvent.mouseEnter(btn);
    fireEvent.mouseDown(btn);
    fireEvent.click(btn);
  });
});

describe('MotionButton accessibility', () => {
  it('passes through aria-* attributes', () => {
    stubMatchMedia(false);
    const { getByRole } = render(
      <MotionButton aria-label="Close dialog" aria-pressed={false}>
        ×
      </MotionButton>,
    );
    const btn = getByRole('button', { name: 'Close dialog' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });
});