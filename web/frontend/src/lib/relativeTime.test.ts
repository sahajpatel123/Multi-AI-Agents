import { describe, expect, it } from 'vitest';
import { formatRelativeFuture, formatRelativePast } from './relativeTime';

const NOW = new Date('2026-07-16T12:00:00Z').getTime();
const ago = (sec: number) => new Date(NOW - sec * 1000).toISOString();
const inFuture = (sec: number) => new Date(NOW + sec * 1000).toISOString();

describe('formatRelativePast', () => {
  it('returns fallback for null', () => {
    expect(formatRelativePast(null, { fallback: '—', now: NOW })).toBe('—');
  });

  it('returns fallback for invalid iso', () => {
    expect(formatRelativePast('not-a-date', { fallback: '?', now: NOW })).toBe('?');
  });

  it('clamps future iso to 0 seconds (no negative ages)', () => {
    expect(formatRelativePast(inFuture(60), { now: NOW })).toBe('just now');
  });

  it('uses just now / Xm / Xh / Xd boundaries', () => {
    expect(formatRelativePast(ago(0), { now: NOW })).toBe('just now');
    expect(formatRelativePast(ago(59), { now: NOW })).toBe('just now');
    expect(formatRelativePast(ago(60), { now: NOW })).toBe('1m ago');
    expect(formatRelativePast(ago(59 * 60), { now: NOW })).toBe('59m ago');
    expect(formatRelativePast(ago(60 * 60), { now: NOW })).toBe('1h ago');
    expect(formatRelativePast(ago(23 * 60 * 60), { now: NOW })).toBe('23h ago');
    expect(formatRelativePast(ago(24 * 60 * 60), { now: NOW })).toBe('1d ago');
    expect(formatRelativePast(ago(6 * 24 * 60 * 60), { now: NOW })).toBe('6d ago');
  });

  it('uses locale date when localeAfterDays is set and exceeded', () => {
    const result = formatRelativePast(ago(30 * 24 * 60 * 60), {
      now: NOW,
      localeAfterDays: 7,
    });
    // Exact value depends on the runner locale; just confirm it's not "30d ago".
    expect(result).not.toBe('30d ago');
    expect(result.length).toBeGreaterThan(0);
  });

  it('keeps Nd format when localeAfterDays is 0 (off)', () => {
    expect(
      formatRelativePast(ago(30 * 24 * 60 * 60), { now: NOW, localeAfterDays: 0 }),
    ).toBe('30d ago');
  });
});

describe('formatRelativeFuture', () => {
  it('returns fallback for null', () => {
    expect(formatRelativeFuture(null, { fallback: '—', now: NOW })).toBe('—');
  });

  it('returns due now for past timestamps', () => {
    expect(formatRelativeFuture(ago(60), { now: NOW })).toBe('due now');
  });

  it('formats future timestamps', () => {
    expect(formatRelativeFuture(inFuture(0), { now: NOW })).toBe('in <1m');
    expect(formatRelativeFuture(inFuture(60 * 5), { now: NOW })).toBe('in 5m');
    expect(formatRelativeFuture(inFuture(60 * 60), { now: NOW })).toBe('in 1h');
    expect(formatRelativeFuture(inFuture(60 * 60 * 23), { now: NOW })).toBe('in 23h');
    expect(formatRelativeFuture(inFuture(60 * 60 * 24), { now: NOW })).toBe('in 1d');
  });
});
