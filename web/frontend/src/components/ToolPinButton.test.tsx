import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToolPinButton } from './ToolPinButton';
import { readPinnedTools } from '../lib/pinnedTools';

describe('ToolPinButton', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('renders in the unpressed state when not pinned', () => {
    render(<ToolPinButton path="/persona-battle" />);
    const btn = screen.getByRole('button', { name: /Pin to hub/i });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('pins the path on click and reflects the new state', () => {
    render(<ToolPinButton path="/persona-battle" />);
    fireEvent.click(screen.getByRole('button', { name: /Pin to hub/i }));
    expect(readPinnedTools(window.localStorage)).toEqual(['/persona-battle']);
    expect(screen.getByRole('button', { name: /Unpin from hub/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('unpins on second click', () => {
    render(<ToolPinButton path="/persona-battle" />);
    fireEvent.click(screen.getByRole('button', { name: /Pin to hub/i }));
    fireEvent.click(screen.getByRole('button', { name: /Unpin from hub/i }));
    expect(readPinnedTools(window.localStorage)).toEqual([]);
  });

  it('reflects the existing pinned state on mount', () => {
    window.localStorage.setItem(
      'arena:persona-playground:pinned-tools:v1',
      JSON.stringify(['/persona-battle']),
    );
    render(<ToolPinButton path="/persona-battle" />);
    expect(screen.getByRole('button', { name: /Unpin from hub/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('surfaces a limit hint when the cap (3) is hit', async () => {
    window.localStorage.setItem(
      'arena:persona-playground:pinned-tools:v1',
      JSON.stringify(['/persona-match', '/persona-council', '/persona-battle']),
    );
    render(<ToolPinButton path="/persona-dilemma" />);
    fireEvent.click(screen.getByRole('button', { name: /Pin to hub/i }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Pin to hub/i }).getAttribute('title'),
      ).toContain('unpin one first'),
    );
    expect(readPinnedTools(window.localStorage).length).toBe(3);
  });

  it('cancels the pending limit-hint timer on unmount (no setState after unmount)', () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    try {
      window.localStorage.setItem(
        'arena:persona-playground:pinned-tools:v1',
        JSON.stringify(['/persona-match', '/persona-council', '/persona-battle']),
      );
      const { unmount } = render(<ToolPinButton path="/persona-dilemma" />);
      fireEvent.click(screen.getByRole('button', { name: /Pin to hub/i }));
      expect(clearTimeoutSpy).not.toHaveBeenCalled();
      unmount();
      // Cleanup should have cleared the pending timer.
      expect(clearTimeoutSpy).toHaveBeenCalled();
    } finally {
      clearTimeoutSpy.mockRestore();
    }
  });
});
