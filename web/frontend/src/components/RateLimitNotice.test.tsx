import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitNotice } from './RateLimitNotice';
import { formatRateLimitCountdown } from '../lib/rateLimit';

const detail = {
  error: 'rate_limit_exceeded' as const,
  message: 'Daily message limit reached.',
  resets_at: '2026-08-25T00:00:00',
  retry_after_seconds: 43_200,
};

describe('RateLimitNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats countdowns without hiding the seconds near a reset', () => {
    expect(formatRateLimitCountdown(0)).toBe('now');
    expect(formatRateLimitCountdown(65)).toBe('1m 5s');
    expect(formatRateLimitCountdown(3_661)).toBe('1h 1m');
    expect(formatRateLimitCountdown(90_000)).toBe('1d 1h');
  });

  it('shows the server-provided UTC reset countdown and ticks it down', () => {
    render(<RateLimitNotice detail={detail} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Available again in 12h 0m (UTC).');

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Available again in 11h 59m (UTC).');
  });

  it('uses relative retry windows without claiming they are UTC resets', () => {
    render(
      <RateLimitNotice
        detail={{
          error: 'rate_limit_exceeded',
          message: 'Too many requests. Try again soon.',
          resets_at: null,
          retry_after_seconds: 61,
        }}
      />,
    );

    expect(screen.getByText('Rate limit reached')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Available again in 1m 1s.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('(UTC)');
  });

  it('does not invent a reset time when the server cannot provide one', () => {
    render(
      <RateLimitNotice
        detail={{
          error: 'rate_limit_exceeded',
          message: 'Daily token budget reached.',
          scope: 'tokens',
          resets_at: null,
          retry_after_seconds: null,
        }}
      />,
    );

    expect(screen.getByText('Daily token budget reached')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Reset timing is unavailable. Refresh your limits before trying again.',
    );
  });

  it('supports refresh and dismiss actions', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const onDismiss = vi.fn();
    render(
      <RateLimitNotice detail={detail} onRefresh={onRefresh} onDismiss={onDismiss} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh limits' }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss daily limit notice' }));

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
