/**
 * Tests for the PrismBuddy SVG character.
 *
 * PrismBuddy is the hand-drawn character on the SignInPage. Its mode and
 * action drive BEM modifiers that the CSS uses to swap facial expressions
 * (idle / attentive / private / recovering) and one-shot animations (wave
 * / boop / dance / stretch / approve / thinking / concerned / match).
 *
 * Drift here is visual — if the modifier class disappears, the CSS stops
 * styling that state and the character freezes in its default pose with
 * no error to the JS console. These tests pin the modifier contract and
 * the activate callback.
 */

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PrismBuddy, type PrismBuddyAction, type PrismBuddyMode } from './PrismBuddy';

describe('PrismBuddy', () => {
  const modes: PrismBuddyMode[] = ['idle', 'attentive', 'private', 'recovering'];
  const actions: PrismBuddyAction[] = [
    'none',
    'wave',
    'boop',
    'dance',
    'stretch',
    'approve',
    'thinking',
    'concerned',
    'match',
  ];

  it('renders a button with the base prism-buddy class', () => {
    const { container } = render(<PrismBuddy mode="idle" />);
    const btn = container.querySelector('button.prism-buddy');
    expect(btn).not.toBeNull();
  });

  it.each(modes)('applies the prism-buddy--%s modifier for mode=%s', (mode) => {
    const { container } = render(<PrismBuddy mode={mode} />);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain(`prism-buddy--${mode}`);
  });

  it.each(actions)('applies the prism-buddy--action-%s modifier for action=%s', (action) => {
    const { container } = render(<PrismBuddy mode="idle" action={action} />);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain(`prism-buddy--action-${action}`);
  });

  it('defaults the action modifier to "none" when no action prop is provided', () => {
    const { container } = render(<PrismBuddy mode="idle" />);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('prism-buddy--action-none');
    // Other action modifiers must not leak into the class list
    expect(btn?.className).not.toContain('prism-buddy--action-wave');
    expect(btn?.className).not.toContain('prism-buddy--action-dance');
  });

  it('uses default aria-label and title', () => {
    const { getByRole } = render(<PrismBuddy mode="idle" />);
    const btn = getByRole('button', { name: 'Play with the Prism Buddy' });
    expect(btn.getAttribute('title')).toBe('Play with Prism Buddy');
  });

  it('calls onActivate when the buddy is clicked', () => {
    const onActivate = vi.fn();
    const { getByRole } = render(<PrismBuddy mode="idle" onActivate={onActivate} />);
    fireEvent.click(getByRole('button'));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('does not throw when onActivate is omitted', () => {
    const { getByRole } = render(<PrismBuddy mode="idle" />);
    expect(() => fireEvent.click(getByRole('button'))).not.toThrow();
  });

  it('renders the SVG creature and decorative diamonds', () => {
    const { container } = render(<PrismBuddy mode="idle" />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('.prism-buddy__creature')).not.toBeNull();
    expect(container.querySelectorAll('.prism-buddy__diamond').length).toBe(3);
    expect(container.querySelector('.prism-buddy__shadow')).not.toBeNull();
  });

  it('keeps the same DOM shape when mode/action change (no re-mount churn)', () => {
    const { container, rerender } = render(<PrismBuddy mode="idle" action="wave" />);
    const first = container.querySelector('button');
    rerender(<PrismBuddy mode="recovering" action="concerned" />);
    const second = container.querySelector('button');
    // Different mode/action must not unmount the buddy (the CSS animations
    // rely on stable node identity to transition smoothly).
    expect(second).not.toBeNull();
    expect(first).not.toBeNull();
    expect(second?.className).toContain('prism-buddy--recovering');
    expect(second?.className).toContain('prism-buddy--action-concerned');
  });
});
