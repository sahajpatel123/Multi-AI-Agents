import { describe, expect, it } from 'vitest';
import { isWatchlistInterval, WATCHLIST_INTERVALS } from './watchlistIntervals';

describe('watchlistIntervals', () => {
  it('exposes the three backend-supported cadences', () => {
    expect(WATCHLIST_INTERVALS.map((o) => o.hours)).toEqual([24, 72, 168]);
  });

  it('accepts only known interval hours', () => {
    expect(isWatchlistInterval(24)).toBe(true);
    expect(isWatchlistInterval(72)).toBe(true);
    expect(isWatchlistInterval(168)).toBe(true);
    expect(isWatchlistInterval(12)).toBe(false);
    expect(isWatchlistInterval(48)).toBe(false);
  });
});
