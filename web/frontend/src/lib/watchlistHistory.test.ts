import { describe, expect, it } from 'vitest';
import {
  formatWatchlistHistoryExport,
  formatWatchlistHistoryStats,
  watchlistScoreTrend,
} from './watchlistHistory';

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

describe('watchlistScoreTrend', () => {
  it('returns null with fewer than two scored runs', () => {
    expect(watchlistScoreTrend([])).toBeNull();
    expect(watchlistScoreTrend([{ final_score: 70 }])).toBeNull();
    expect(watchlistScoreTrend([{ final_score: null }, { final_score: 70 }])).toBeNull();
  });

  it('compares newest scored to prior scored', () => {
    const t = watchlistScoreTrend([
      { final_score: 80 },
      { final_score: null },
      { final_score: 70 },
    ]);
    expect(t?.delta).toBe(10);
    expect(t?.label).toBe('↑ 10 vs prior');
  });
});

describe('formatWatchlistHistoryExport', () => {
  it('includes question, stats, and runs', () => {
    const md = formatWatchlistHistoryExport({
      question: 'Quantum trends?',
      stats: { count: 2, scored_count: 2, avg_score: 75, min_score: 70, max_score: 80 },
      trend: { delta: 10, latest: 80, previous: 70, label: '↑ 10 vs prior' },
      items: [
        { task_id: 'a', title: 'Latest', final_score: 80, created_at: '2026-07-16T12:00:00.000Z' },
        { task_id: 'b', title: 'Prior', final_score: 70, created_at: '2026-07-15T12:00:00.000Z' },
      ],
    });
    expect(md).toContain('Quantum trends?');
    expect(md).toContain('↑ 10 vs prior');
    expect(md).toContain('Latest');
    expect(md).toContain('80/100');
  });
});
