import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { Button } from './Button';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Button', () => {
  it('renders children with default variant + size classes', () => {
    const { getByRole } = render(<Button>Send</Button>);
    const btn = getByRole('button', { name: 'Send' });
    expect(btn).toHaveClass('arena-btn', 'arena-btn--primary', 'arena-btn--md');
  });

  it('applies variant and size classes', () => {
    const { getByRole } = render(
      <Button variant="danger" size="lg">
        Delete
      </Button>,
    );
    expect(getByRole('button', { name: 'Delete' })).toHaveClass(
      'arena-btn--danger',
      'arena-btn--lg',
    );
  });

  it('applies full-width class when fullWidth is true', () => {
    const { getByRole } = render(<Button fullWidth>Wide</Button>);
    expect(getByRole('button')).toHaveClass('arena-btn--full');
  });

  it('defaults to type="button" so it never accidentally submits forms', () => {
    const { getByRole } = render(<Button>Go</Button>);
    expect(getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('respects explicit type="submit"', () => {
    const { getByRole } = render(<Button type="submit">Send</Button>);
    expect(getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('disables interaction when loading', () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const btn = getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disables when explicitly disabled', () => {
    const { getByRole } = render(<Button disabled>Off</Button>);
    expect(getByRole('button', { name: 'Off' })).toBeDisabled();
  });

  it('fires onClick when enabled', () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <Button onClick={onClick}>Run</Button>,
    );
    fireEvent.click(getByRole('button', { name: 'Run' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('forwards refs so parents can imperatively focus the button', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Focus me</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    ref.current?.focus();
    expect(document.activeElement).toHaveTextContent('Focus me');
  });

  it('renders an icon to the left of the label', () => {
    const { container, getByRole } = render(
      <Button icon={<span data-testid="leading-icon" />}>With icon</Button>,
    );
    expect(getByRole('button', { name: 'With icon' })).toBeInTheDocument();
    expect(container.querySelector('[data-testid="leading-icon"]')).not.toBeNull();
  });

  it('renders an icon to the right of the label (but not while loading)', () => {
    const { container: c1 } = render(
      <Button iconRight={<span data-testid="trailing-icon" />}>Idle</Button>,
    );
    expect(c1.querySelector('[data-testid="trailing-icon"]')).not.toBeNull();

    // When loading, iconRight is suppressed — the spinner takes the slot.
    const { container: c2 } = render(
      <Button loading iconRight={<span data-testid="trailing-icon" />}>
        Saving
      </Button>,
    );
    expect(c2.querySelector('[data-testid="trailing-icon"]')).toBeNull();
  });

  it('merges a custom className with the variant classes', () => {
    const { getByRole } = render(
      <Button className="extra-class">Merged</Button>,
    );
    const btn = getByRole('button', { name: 'Merged' });
    expect(btn).toHaveClass('arena-btn', 'arena-btn--primary');
    expect(btn).toHaveClass('extra-class');
  });
});