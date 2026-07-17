import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ConduraBadge } from './ConduraBadge';

describe('ConduraBadge', () => {
  it('renders nothing when execution is undefined or "web"', () => {
    const { container: a } = render(<ConduraBadge execution={undefined} />);
    expect(a.firstChild).toBeNull();

    const { container: b } = render(<ConduraBadge execution="web" />);
    expect(b.firstChild).toBeNull();
  });

  it('renders the "Needs Condura" label for condura execution', () => {
    const { container } = render(<ConduraBadge execution="condura" />);
    expect(container.textContent).toMatch(/Needs Condura/);
  });

  it('renders the "Powered by Condura" label for hybrid_prep', () => {
    const { container } = render(<ConduraBadge execution="hybrid_prep" />);
    expect(container.textContent).toMatch(/Powered by Condura/);
  });

  it('renders the "Runs on Condura" label for hybrid_delegate', () => {
    const { container } = render(<ConduraBadge execution="hybrid_delegate" />);
    expect(container.textContent).toMatch(/Runs on Condura/);
  });

  it('falls back to "Condura" label for unknown execution values', () => {
    const { container } = render(<ConduraBadge execution="future_env" />);
    expect(container.textContent).toMatch(/Condura/);
  });

  it('carries a title attribute for the explanatory tooltip', () => {
    const { container } = render(<ConduraBadge execution="condura" />);
    const badge = container.querySelector('span');
    expect(badge).toHaveAttribute(
      'title',
      expect.stringContaining('Condura on your computer'),
    );
  });

  it('renders the mark icon as a decorative image (alt="")', () => {
    const { container } = render(<ConduraBadge execution="condura" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    // alt="" is the canonical "decorative" — screen readers skip it.
    expect(img).toHaveAttribute('alt', '');
  });

  it('honors the compact prop (smaller font + padding)', () => {
    const normal = render(<ConduraBadge execution="condura" />);
    const compact = render(<ConduraBadge execution="condura" compact />);
    const normalStyle = normal.container.querySelector('span')!.style;
    const compactStyle = compact.container.querySelector('span')!.style;
    // Compact must be smaller than normal.
    expect(parseFloat(compactStyle.fontSize)).toBeLessThan(parseFloat(normalStyle.fontSize));
  });
});