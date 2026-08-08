import { describe, expect, it } from 'vitest';
import { sharesThisWeek } from './RecentShares';
import type { RecentShare } from '../lib/recentShares';

const SHARE: RecentShare = { kind: 'compare', label: 'A vs B', at: 0 };

describe('sharesThisWeek', () => {
  it('returns 0 for an empty list', () => {
    expect(sharesThisWeek([])).toBe(0);
  });

  it('counts shares within the last 7 days', () => {
    const now = new Date(2026, 6, 25, 12, 0, 0).getTime();
    const items: RecentShare[] = [
      { ...SHARE, at: now }, // today
      { ...SHARE, at: now - 86_400_000 }, // yesterday
      { ...SHARE, at: now - 6 * 86_400_000 }, // 6 days ago
    ];
    expect(sharesThisWeek(items, new Date(now))).toBe(3);
  });

  it('excludes shares older than 7 days', () => {
    const now = new Date(2026, 6, 25, 12, 0, 0).getTime();
    const items: RecentShare[] = [
      { ...SHARE, at: now - 7 * 86_400_000 }, // exactly 7 days ago (excluded — strictly &lt; 7d)
      { ...SHARE, at: now - 8 * 86_400_000 }, // 8 days ago
    ];
    expect(sharesThisWeek(items, new Date(now))).toBe(0);
  });

  it('handles a mix of recent and old shares', () => {
    const now = new Date(2026, 6, 25).getTime();
    const items: RecentShare[] = [
      { ...SHARE, at: now },
      { ...SHARE, at: now - 3 * 86_400_000 },
      { ...SHARE, at: now - 10 * 86_400_000 },
      { ...SHARE, at: now - 30 * 86_400_000 },
    ];
    expect(sharesThisWeek(items, new Date(now))).toBe(2);
  });
});
