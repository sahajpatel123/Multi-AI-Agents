import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Pressable } from './Pressable';

vi.mock('../lib/motion', async () => {
  const actual = await vi.importActual<typeof import('../lib/motion')>('../lib/motion');
  return {
    ...actual,
    prefersReducedMotion: () => true,
  };
});

describe('Pressable', () => {
  it('renders a button with caller classes and children', () => {
    render(
      <Pressable className="pricing-tier-card__cta" onClick={() => {}}>
        <span>Get Plus</span>
      </Pressable>,
    );
    const btn = screen.getByRole('button', { name: 'Get Plus' });
    expect(btn).toHaveClass('pricing-tier-card__cta');
    expect(btn).not.toHaveClass('arena-btn');
  });

  it('fires onClick', () => {
    const onClick = vi.fn();
    render(
      <Pressable onClick={onClick}>
        Tap
      </Pressable>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tap' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
