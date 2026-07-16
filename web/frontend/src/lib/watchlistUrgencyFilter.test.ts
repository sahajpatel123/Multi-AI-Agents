import { describe, expect, it } from 'vitest';
import {
  filterWatchlistByUrgency,
  watchlistUrgencyBucket,
  watchlistUrgencyFilterUseful,
  watchlistUrgencyLabel,
} from './watchlistUrgencyFilter';

const NOW = new Date('2026-07-16T12:00:00.000Z').getTime();
const hour = 60 * 60 * 1000;

const sample = [
  {
    id: 'over',
    is_active: true,
    next_run_at: new Date(NOW - hour).toISOString(),
  },
  {
    id: 'soon',
    isActive: true,
    nextRunAt: new Date(NOW + 2 * hour).toISOString(),
  },
  {
    id: 'later',
    is_active: true,
    next_run_at: new Date(NOW + 48 * hour).toISOString(),
  },
  {
    id: 'paused',
    is_active: false,
    next_run_at: new Date(NOW - hour).toISOString(),
  },
];

describe('watchlistUrgencyBucket', () => {
  it('classifies overdue, due soon, later, and paused', () => {
    expect(watchlistUrgencyBucket(sample[0], NOW)).toBe('overdue');
    expect(watchlistUrgencyBucket(sample[1], NOW)).toBe('due_soon');
    expect(watchlistUrgencyBucket(sample[2], NOW)).toBe('later');
    expect(watchlistUrgencyBucket(sample[3], NOW)).toBe('paused');
  });

  it('treats missing next run as later when active', () => {
    expect(watchlistUrgencyBucket({ is_active: true, next_run_at: null }, NOW)).toBe(
      'later',
    );
  });
});

describe('filterWatchlistByUrgency', () => {
  it('returns all for all filter', () => {
    expect(filterWatchlistByUrgency(sample, 'all', NOW)).toHaveLength(4);
  });

  it('filters each bucket and excludes paused from timing buckets', () => {
    expect(filterWatchlistByUrgency(sample, 'overdue', NOW).map((i) => i.id)).toEqual([
      'over',
    ]);
    expect(filterWatchlistByUrgency(sample, 'due_soon', NOW).map((i) => i.id)).toEqual([
      'soon',
    ]);
    expect(filterWatchlistByUrgency(sample, 'later', NOW).map((i) => i.id)).toEqual([
      'later',
    ]);
  });

  it('does not mutate input', () => {
    const copy = [...sample];
    filterWatchlistByUrgency(sample, 'overdue', NOW);
    expect(sample).toEqual(copy);
  });
});

describe('watchlistUrgencyFilterUseful', () => {
  it('is true when any overdue or due-soon exists', () => {
    expect(watchlistUrgencyFilterUseful(sample, NOW)).toBe(true);
    expect(
      watchlistUrgencyFilterUseful(
        [{ is_active: true, next_run_at: new Date(NOW + 48 * hour).toISOString() }],
        NOW,
      ),
    ).toBe(false);
  });
});

describe('watchlistUrgencyLabel', () => {
  it('returns labels', () => {
    expect(watchlistUrgencyLabel('all')).toBe('All timing');
    expect(watchlistUrgencyLabel('overdue')).toBe('Overdue');
    expect(watchlistUrgencyLabel('due_soon')).toBe('Due soon');
  });
});
