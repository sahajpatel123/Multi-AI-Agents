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
    expect(container.querySelector('.env-badge--condura')).not.toBeNull();
  });

  it('renders the "Powered by Condura" label for hybrid_prep', () => {
    const { container } = render(<ConduraBadge execution="hybrid_prep" />);
    expect(container.textContent).toMatch(/Powered by Condura/);
    expect(container.querySelector('.env-badge--hybrid_prep')).not.toBeNull();
  });

  it('renders the "Runs on Condura" label for hybrid_delegate', () => {
    const { container } = render(<ConduraBadge execution="hybrid_delegate" />);
    expect(container.textContent).toMatch(/Runs on Condura/);
    expect(container.querySelector('.env-badge--hybrid_delegate')).not.toBeNull();
  });

  it('falls back to "Condura" label for unknown execution values', () => {
    const { container } = render(<ConduraBadge execution="future_env" />);
    expect(container.textContent).toMatch(/Condura/);
    expect(container.querySelector('.env-badge--unknown')).not.toBeNull();
  });

  it('carries a title attribute for the explanatory tooltip', () => {
    const { container } = render(<ConduraBadge execution="condura" />);
    const badge = container.querySelector('span.env-badge');
    expect(badge).toHaveAttribute(
      'title',
      expect.stringContaining('Condura on your computer'),
    );
    expect(badge).toHaveAttribute('aria-label', expect.stringContaining('Needs Condura'));
  });

  it('renders the mark icon as a decorative image (alt="")', () => {
    const { container } = render(<ConduraBadge execution="condura" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('alt', '');
  });

  it('honors the compact prop via class', () => {
    const compact = render(<ConduraBadge execution="condura" compact />);
    expect(compact.container.querySelector('.env-badge')).toHaveClass('env-badge--compact');
  });
});
