import { describe, expect, it } from 'vitest';
import { sortWatchlistItems, watchlistSortLabel } from './watchlistSort';

const sample = [
  {
    id: 'paused',
    question: 'Zulu topic',
    isActive: false,
    nextRunAt: '2026-01-01T00:00:00Z',
    lastRunAt: '2026-06-01T00:00:00Z',
    runCount: 10,
    latestScore: 95,
  },
  {
    id: 'soon',
    question: 'Alpha topic',
    isActive: true,
    nextRunAt: '2026-07-01T08:00:00Z',
    lastRunAt: '2026-06-30T00:00:00Z',
    runCount: 2,
    latestScore: 70,
  },
  {
    id: 'later',
    question: 'Middle topic',
    isActive: true,
    nextRunAt: '2026-07-03T08:00:00Z',
    lastRunAt: '2026-05-01T00:00:00Z',
    runCount: 5,
    latestScore: 88,
  },
];

describe('sortWatchlistItems', () => {
  it('sorts next-soon with active first and soonest next', () => {
    expect(sortWatchlistItems(sample, 'next_soon').map((i) => i.id)).toEqual([
      'soon',
      'later',
      'paused',
    ]);
  });

  it('sorts next-late with later active first', () => {
    expect(sortWatchlistItems(sample, 'next_late').map((i) => i.id)).toEqual([
      'later',
      'soon',
      'paused',
    ]);
  });

  it('sorts by last run descending', () => {
    expect(sortWatchlistItems(sample, 'last_run').map((i) => i.id)).toEqual([
      'soon',
      'paused',
      'later',
    ]);
  });

  it('sorts by score high to low', () => {
    expect(sortWatchlistItems(sample, 'score_desc').map((i) => i.id)).toEqual([
      'paused',
      'later',
      'soon',
    ]);
  });

  it('sorts by most runs', () => {
    expect(sortWatchlistItems(sample, 'runs').map((i) => i.id)).toEqual([
      'paused',
      'later',
      'soon',
    ]);
  });

  it('sorts questions alphabetically', () => {
    expect(sortWatchlistItems(sample, 'question').map((i) => i.id)).toEqual([
      'soon',
      'later',
      'paused',
    ]);
  });

  it('does not mutate input', () => {
    const copy = [...sample];
    sortWatchlistItems(sample, 'question');
    expect(sample).toEqual(copy);
  });
});

describe('watchlistSortLabel', () => {
  it('returns labels', () => {
    expect(watchlistSortLabel('next_soon')).toBe('Next run · soon');
    expect(watchlistSortLabel('score_desc')).toBe('Score · high');
  });
});
