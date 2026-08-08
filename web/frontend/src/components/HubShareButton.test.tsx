import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HubShareButton } from './HubShareButton';

describe('HubShareButton', () => {
  let originalClipboard: PropertyDescriptor | undefined;
  let originalHref: string;

  beforeEach(() => {
    originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    originalHref = window.location.href;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      // @ts-expect-error — best-effort cleanup
      delete navigator.clipboard;
    }
    // Restore href by triggering a no-op assign.
    try {
      window.history.replaceState(null, '', '/');
    } catch {
      /* noop */
    }
    void originalHref;
  });

  function stubClipboard(impl: () => Promise<void>) {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockImplementation(impl) },
    });
  }

  it('renders the default idle label', () => {
    render(<HubShareButton />);
    expect(screen.getByRole('button', { name: /Copy link to this view/i }))
      .toBeInTheDocument();
  });

  it('honors a custom label', () => {
    render(<HubShareButton label="Share this hub" />);
    expect(screen.getByRole('button', { name: /Share this hub/i }))
      .toBeInTheDocument();
  });

  it('copies window.location.href when no override is given', async () => {
    stubClipboard(async () => {});
    window.history.replaceState(null, '', '/persona-playground?cat=decide&q=foo');
    render(<HubShareButton />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(screen.getByRole('button').textContent).toMatch(/Copied/i),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/persona-playground?cat=decide&q=foo'),
    );
  });

  it('copies the override url when provided', async () => {
    stubClipboard(async () => {});
    render(<HubShareButton url="https://arena.example/custom" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(screen.getByRole('button').textContent).toMatch(/Copied/i),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://arena.example/custom',
    );
  });

  it('shows the Failed label when clipboard write rejects', async () => {
    stubClipboard(async () => {
      throw new Error('denied');
    });
    render(<HubShareButton />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(screen.getByRole('button').textContent).toMatch(/Failed/i),
    );
  });

  it('flips the aria-label to a failure announcement when the copy fails', async () => {
    stubClipboard(async () => {
      throw new Error('denied');
    });
    render(<HubShareButton />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    await waitFor(() =>
      expect(button.getAttribute('aria-label')).toBe('Copy link failed'),
    );
  });

  it('flips the aria-label back to the idle label after revert', async () => {
    stubClipboard(async () => {});
    render(<HubShareButton label="Share this hub" />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    await waitFor(() =>
      expect(button.getAttribute('aria-label')).toBe('Link copied to clipboard'),
    );
    await waitFor(
      () => expect(button.getAttribute('aria-label')).toBe('Share this hub'),
      { timeout: 3000 },
    );
  });

  it('reverts to the idle label after the timeout', async () => {
    stubClipboard(async () => {});
    render(<HubShareButton />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(screen.getByRole('button').textContent).toMatch(/Copied/i),
    );
    await waitFor(
      () =>
        expect(screen.getByRole('button').textContent).toMatch(/Copy link/i),
      { timeout: 3000 },
    );
  });

  it('renders the hint as the title attribute', () => {
    render(<HubShareButton hint="Shortcut: Shift+L" />);
    expect(screen.getByRole('button').getAttribute('title')).toBe('Shortcut: Shift+L');
  });

  it('exposes a trigger() imperative method via ref', async () => {
    stubClipboard(async () => {});
    const ref = { current: null } as React.RefObject<{ trigger: () => Promise<void> }>;
    render(<HubShareButton ref={ref} url="https://arena.example/imperative" />);
    await ref.current?.trigger();
    await waitFor(() =>
      expect(screen.getByRole('button').textContent).toMatch(/Copied/i),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://arena.example/imperative',
    );
  });
});