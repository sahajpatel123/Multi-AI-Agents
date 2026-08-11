import { describe, expect, it } from 'vitest';
import { watchlistStatTiles } from './watchlistStatistics';

describe('watchlistStatTiles', () => {
  it('returns empty tiles for nullish stats', () => {
    expect(watchlistStatTiles(null)).toEqual([]);
    expect(watchlistStatTiles(undefined)).toEqual([]);
  });

  it('formats a healthy populated watchlist', () => {
    const tiles = watchlistStatTiles({
      total_items: 2,
      active_items: 1,
      total_runs: 4,
      scored_runs: 3,
      avg_score: 87.5,
      min_score: 60,
      max_score: 92.4,
      success_rate: 75,
    });
    expect(tiles).toEqual([
      { key: 'active', label: 'Active watches', value: '1/2' },
      { key: 'runs', label: 'Research runs', value: '4' },
      { key: 'scored', label: 'Scored runs', value: '3' },
      { key: 'avg', label: 'Average score', value: '88' },
      { key: 'range', label: 'Score range', value: '60–92' },
      { key: 'success', label: 'Scored rate', value: '75%' },
    ]);
  });

  it('keeps dash placeholders when nothing is scored yet', () => {
    const tiles = watchlistStatTiles({
      total_items: 1,
      active_items: 1,
      total_runs: 2,
      scored_runs: 0,
      avg_score: null,
      min_score: null,
      max_score: null,
      success_rate: 0,
    });
    expect(tiles.map(({ key, value }) => ({ key, value }))).toEqual([
      { key: 'active', value: '1/1' },
      { key: 'runs', value: '2' },
      { key: 'scored', value: '0' },
      { key: 'avg', value: '—' },
      { key: 'range', value: '—' },
      { key: 'success', value: '0%' },
    ]);
  });
});
