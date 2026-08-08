import { describe, expect, it } from 'vitest';
import { formatRelativeArchiveDate } from './FeaturedArchive';

describe('formatRelativeArchiveDate', () => {
  it('returns "Today" for the current date', () => {
    const today = new Date(2026, 6, 25);
    expect(formatRelativeArchiveDate('2026-07-25', today)).toBe('Today');
  });

  it('returns "Yesterday" for the previous calendar day', () => {
    const today = new Date(2026, 6, 25);
    expect(formatRelativeArchiveDate('2026-07-24', today)).toBe('Yesterday');
  });

  it('returns "Nd ago" for 2–6 days back', () => {
    const today = new Date(2026, 6, 25);
    expect(formatRelativeArchiveDate('2026-07-23', today)).toBe('2d ago');
    expect(formatRelativeArchiveDate('2026-07-22', today)).toBe('3d ago');
    expect(formatRelativeArchiveDate('2026-07-19', today)).toBe('6d ago');
  });

  it('falls back to a short absolute date for older items', () => {
    const today = new Date(2026, 6, 25);
    const out = formatRelativeArchiveDate('2026-07-01', today);
    // Locale-dependent month name; assert on the day number only.
    expect(out).toContain('1');
  });

  it('returns the input string when malformed', () => {
    expect(formatRelativeArchiveDate('not-a-date')).toBe('not-a-date');
    expect(formatRelativeArchiveDate('')).toBe('');
  });

  it('handles the past 7-day boundary correctly', () => {
    const today = new Date(2026, 6, 25);
    // 7+ days back should fall to absolute
    const out = formatRelativeArchiveDate('2026-07-18', today);
    expect(out).not.toContain('ago');
  });
});
