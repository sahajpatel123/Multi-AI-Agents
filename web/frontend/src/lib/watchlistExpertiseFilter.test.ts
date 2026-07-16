import { describe, expect, it } from 'vitest';
import {
  WATCHLIST_EXPERTISE_ALL,
  collectWatchlistExpertiseOptions,
  filterWatchlistByExpertise,
  watchlistExpertiseFilterUseful,
  watchlistExpertiseLabel,
} from './watchlistExpertiseFilter';

describe('watchlistExpertiseFilter', () => {
  const items = [
    { id: 'a', expertise_level: 'expert' },
    { id: 'b', expertise_level: 'curious' },
    { id: 'c', expertise_level: 'Expert' },
  ];

  it('collects All levels plus unique expertise sorted by label', () => {
    const opts = collectWatchlistExpertiseOptions(items);
    expect(opts[0]).toEqual({ value: WATCHLIST_EXPERTISE_ALL, label: 'All levels' });
    expect(opts.slice(1).map((o) => o.value)).toEqual(['curious', 'expert']);
    expect(opts[1].label).toBe('Curious');
  });

  it('filters by expertise case-insensitively', () => {
    expect(filterWatchlistByExpertise(items, WATCHLIST_EXPERTISE_ALL)).toHaveLength(3);
    expect(filterWatchlistByExpertise(items, 'expert').map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('detects usefulness and labels', () => {
    expect(watchlistExpertiseFilterUseful(items)).toBe(true);
    expect(watchlistExpertiseFilterUseful([{ expertise_level: 'expert' }])).toBe(false);
    const opts = collectWatchlistExpertiseOptions(items);
    expect(watchlistExpertiseLabel('curious', opts)).toBe('Curious');
  });
});
