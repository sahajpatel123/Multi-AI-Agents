import { describe, expect, it } from 'vitest';
import {
  formatWatchlistExport,
  formatWatchlistItemCopy,
  formatWatchlistQuestionCopy,
} from './watchlistExport';

describe('formatWatchlistExport', () => {
  it('formats active and paused items with cadence labels', () => {
    const md = formatWatchlistExport({
      activeCount: 1,
      activeCap: 10,
      items: [
        {
          question: 'Will rates cut this quarter?',
          intervalHours: 24,
          isActive: true,
          runCount: 3,
          lastRunAt: '2026-07-01T12:00:00.000Z',
          nextRunAt: '2026-07-02T12:00:00.000Z',
          latestTitle: 'Macro scan',
          latestScore: 81,
          expertiseLevel: 'expert',
          expertiseDomain: 'macro',
        },
        {
          question: 'Paused topic',
          intervalHours: 168,
          isActive: false,
          runCount: 0,
        },
      ],
    });

    expect(md).toContain('# Agent Watchlist');
    expect(md).toContain('**Active:** 1 / 10');
    expect(md).toContain('## 1. Will rates cut this quarter?');
    expect(md).toContain('**Status:** Active');
    expect(md).toContain('**Cadence:** Daily (24h)');
    expect(md).toContain('**Latest:** Macro scan (81/100)');
    expect(md).toContain('**Expertise:** expert · macro');
    expect(md).toContain('## 2. Paused topic');
    expect(md).toContain('**Status:** Paused');
    expect(md).toContain('Weekly (7d)');
    expect(md).toMatch(/Shared from Arena Agent Watchlist/);
  });

  it('notes empty filtered views and filter labels', () => {
    const md = formatWatchlistExport({
      items: [],
      filterNote: 'status: paused',
    });
    expect(md).toMatch(/No watched tasks/i);
    expect(md).toContain('_Filtered view: status: paused_');
  });

  it('labels 3-day cadence', () => {
    const md = formatWatchlistExport({
      items: [{ question: 'X', intervalHours: 72, isActive: true }],
    });
    expect(md).toContain('Every 3 days');
  });
});

describe('formatWatchlistItemCopy', () => {
  it('snapshots one watch as markdown', () => {
    const md = formatWatchlistItemCopy({
      question: 'Will rates cut this quarter?',
      intervalHours: 24,
      isActive: true,
      runCount: 3,
      lastRunAt: '2026-07-01T12:00:00.000Z',
      nextRunAt: '2026-07-02T12:00:00.000Z',
      latestTitle: 'Macro scan',
      latestScore: 81,
      expertiseLevel: 'expert',
      expertiseDomain: 'macro',
    });
    expect(md).toContain('# Will rates cut this quarter?');
    expect(md).toContain('**Status:** Active');
    expect(md).toContain('**Cadence:** Daily (24h)');
    expect(md).toContain('**Latest:** Macro scan (81/100)');
    expect(md).toContain('Shared from Arena Agent Watchlist');
  });

  it('returns empty for blank question', () => {
    expect(formatWatchlistItemCopy({ question: '  ', intervalHours: 24, isActive: true })).toBe(
      '',
    );
  });
});

describe('formatWatchlistQuestionCopy', () => {
  it('returns trimmed question with trailing newline', () => {
    expect(formatWatchlistQuestionCopy('  Ship today?  ')).toBe('Ship today?\n');
  });

  it('returns empty for blank', () => {
    expect(formatWatchlistQuestionCopy('   ')).toBe('');
  });
});
