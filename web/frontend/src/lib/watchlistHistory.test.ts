import { describe, expect, it } from 'vitest';
import {
  formatWatchlistHistoryExport,
  formatWatchlistHistoryStats,
  readableAgentAnswerText,
  watchlistScoreTrend,
} from './watchlistHistory';

describe('readableAgentAnswerText', () => {
  it('returns empty for missing or blank answers', () => {
    expect(readableAgentAnswerText(null)).toBe('');
    expect(readableAgentAnswerText(undefined)).toBe('');
    expect(readableAgentAnswerText('   ')).toBe('');
  });

  it('passes free text through', () => {
    expect(readableAgentAnswerText('  The IPO pipeline remains strong.  ')).toBe(
      'The IPO pipeline remains strong.',
    );
  });

  it('flattens structured sentences into readable paragraphs', () => {
    const raw = JSON.stringify({
      sentences: [
        { text: 'First paragraph.', confidence: 'supported', type: 'fact' },
        { text: '## Bottom line\nSecond paragraph.', confidence: 'verified' },
      ],
      overall_confidence: 78,
    });
    expect(readableAgentAnswerText(raw)).toBe(
      'First paragraph.\n\n## Bottom line\nSecond paragraph.',
    );
  });

  it('falls back to one_liner, final_answer, or text fields', () => {
    expect(
      readableAgentAnswerText(
        JSON.stringify({ sentences: [], one_liner: 'Short takeaway.' }),
      ),
    ).toBe('Short takeaway.');
    expect(
      readableAgentAnswerText(JSON.stringify({ final_answer: 'Full report text.' })),
    ).toBe('Full report text.');
    expect(readableAgentAnswerText(JSON.stringify({ text: 'Plain text field.' }))).toBe(
      'Plain text field.',
    );
  });

  it('treats unusable JSON payloads as no answer', () => {
    expect(readableAgentAnswerText('{}')).toBe('');
    expect(readableAgentAnswerText('[]')).toBe('');
    expect(readableAgentAnswerText('{"unknown": 1}')).toBe('');
  });

  it('keeps raw text when JSON-looking content does not parse', () => {
    expect(readableAgentAnswerText('{ not valid json')).toBe('{ not valid json');
  });
});

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
