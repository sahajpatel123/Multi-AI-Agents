import { describe, expect, it } from 'vitest';
import {
  agentHistorySortLabel,
  sortAgentHistoryItems,
} from './agentHistorySort';

const sample = [
  {
    id: 'a',
    title: 'Zebra markets',
    score: 40,
    createdAt: '2026-01-01T00:00:00Z',
    isLive: false,
  },
  {
    id: 'b',
    title: 'Alpha runway',
    score: 90,
    createdAt: '2026-03-01T00:00:00Z',
    isLive: true,
  },
  {
    id: 'c',
    title: null,
    question: 'Middle question',
    score: null,
    createdAt: '2026-02-01T00:00:00Z',
    isLive: false,
  },
];

describe('sortAgentHistoryItems', () => {
  it('sorts newest first by default', () => {
    const ids = sortAgentHistoryItems(sample, 'newest').map((i) => i.id);
    expect(ids).toEqual(['b', 'c', 'a']);
  });

  it('sorts by score high to low with missing last', () => {
    const ids = sortAgentHistoryItems(sample, 'score_desc').map((i) => i.id);
    expect(ids).toEqual(['b', 'a', 'c']);
  });

  it('sorts live first then newest', () => {
    const ids = sortAgentHistoryItems(sample, 'live_first').map((i) => i.id);
    expect(ids[0]).toBe('b');
  });

  it('sorts by title', () => {
    const ids = sortAgentHistoryItems(sample, 'title').map((i) => i.id);
    expect(ids).toEqual(['b', 'c', 'a']);
  });

  it('keeps pinned tasks first in every sort mode', () => {
    const pinnedFirst = sortAgentHistoryItems(sample, 'newest', ['a', 'c']);
    expect(pinnedFirst.map((i) => i.id)).toEqual(['c', 'a', 'b']);

    const byScore = sortAgentHistoryItems(sample, 'score_desc', ['a']);
    expect(byScore.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('respects the selected sort within pinned and unpinned groups', () => {
    const sorted = sortAgentHistoryItems(sample, 'score_desc', ['b', 'a']);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('ignores pinned ids that are not present', () => {
    const ids = sortAgentHistoryItems(sample, 'newest', ['ghost']).map((i) => i.id);
    expect(ids).toEqual(['b', 'c', 'a']);
  });
});

describe('agentHistorySortLabel', () => {
  it('labels known sorts', () => {
    expect(agentHistorySortLabel('score_desc')).toBe('Score · high');
    expect(agentHistorySortLabel('live_first')).toBe('Live first');
  });
});
