import { describe, expect, it } from 'vitest';
import {
  filterWatchlistByCadence,
  watchlistCadenceFilterUseful,
  watchlistCadenceLabel,
} from './watchlistCadenceFilter';

const sample = [
  { id: 'a', interval_hours: 24 },
  { id: 'b', intervalHours: 72 },
  { id: 'c', interval_hours: 24 },
  { id: 'd', interval_hours: 168 },
];

describe('filterWatchlistByCadence', () => {
  it('returns all for all filter', () => {
    expect(filterWatchlistByCadence(sample, 'all')).toHaveLength(4);
  });

  it('filters by daily and weekly', () => {
    expect(filterWatchlistByCadence(sample, 24).map((i) => i.id)).toEqual(['a', 'c']);
    expect(filterWatchlistByCadence(sample, 168).map((i) => i.id)).toEqual(['d']);
  });

  it('does not mutate input', () => {
    const copy = [...sample];
    filterWatchlistByCadence(sample, 24);
    expect(sample).toEqual(copy);
  });
});

describe('watchlistCadenceFilterUseful', () => {
  it('is true only when multiple cadences exist', () => {
    expect(watchlistCadenceFilterUseful(sample)).toBe(true);
    expect(watchlistCadenceFilterUseful([{ interval_hours: 24 }, { interval_hours: 24 }])).toBe(
      false,
    );
  });
});

describe('watchlistCadenceLabel', () => {
  it('returns labels', () => {
    expect(watchlistCadenceLabel('all')).toBe('All cadences');
    expect(watchlistCadenceLabel(24)).toBe('Daily');
  });
});
