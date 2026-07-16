import { describe, expect, it } from 'vitest';
import { formatWatchlistHistoryStats } from './watchlistHistory';

describe('formatWatchlistHistoryStats', () => {
  it('handles empty', () => {
    expect(formatWatchlistHistoryStats(null)).toBe('');
    expect(formatWatchlistHistoryStats({ count: 0 })).toBe('No runs yet');
  });

  it('summarizes scored runs', () => {
    expect(
      formatWatchlistHistoryStats({
        count: 3,
        scored_count: 3,
        avg_score: 70,
        min_score: 60,
        max_score: 80,
      }),
    ).toBe('3 runs · avg 70 · 60–80');
  });

  it('notes unscored subset', () => {
    expect(
      formatWatchlistHistoryStats({
        count: 2,
        scored_count: 1,
        avg_score: 80,
        min_score: 80,
        max_score: 80,
      }),
    ).toBe('2 runs · 1 scored · avg 80 · 80');
  });
});
