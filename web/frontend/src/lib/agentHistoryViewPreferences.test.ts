import { beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_HISTORY_VIEW_PREFERENCES_STORAGE_KEY,
  DEFAULT_AGENT_HISTORY_VIEW_PREFERENCES,
  loadAgentHistoryViewPreferences,
  normalizeAgentHistoryViewPreferences,
  persistAgentHistoryViewPreferences,
} from './agentHistoryViewPreferences';

describe('agent history view preferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('uses defaults when storage is missing or corrupt', () => {
    expect(loadAgentHistoryViewPreferences()).toEqual(DEFAULT_AGENT_HISTORY_VIEW_PREFERENCES);

    window.localStorage.setItem(AGENT_HISTORY_VIEW_PREFERENCES_STORAGE_KEY, '{not json');
    expect(loadAgentHistoryViewPreferences()).toEqual(DEFAULT_AGENT_HISTORY_VIEW_PREFERENCES);
  });

  it('round-trips a complete history view', () => {
    const preferences = {
      sort: 'score_desc',
      status: 'completed',
      score: 'high',
      confidence: 'solid',
      recency: 'last_30d',
      feedback: 'accurate',
      topic: 'Product Strategy',
      source: 'watchlist',
      pin: 'pinned',
    } as const;

    expect(persistAgentHistoryViewPreferences(preferences)).toEqual({
      ...preferences,
      topic: 'product strategy',
    });
    expect(loadAgentHistoryViewPreferences()).toEqual({
      ...preferences,
      topic: 'product strategy',
    });
  });

  it('falls back field-by-field for stale values while retaining valid choices', () => {
    expect(
      normalizeAgentHistoryViewPreferences({
        sort: 'future_sort',
        status: 'live',
        score: 42,
        confidence: 'unrated',
        recency: 'tomorrow',
        feedback: 'partial',
        topic: '  Markets  ',
        source: 'future_source',
        pin: 'pinned',
      }),
    ).toEqual({
      sort: 'newest',
      status: 'live',
      score: 'all',
      confidence: 'unrated',
      recency: 'all',
      feedback: 'partial',
      topic: 'markets',
      source: 'all',
      pin: 'pinned',
    });
  });

  it('rejects empty and excessively long topic values', () => {
    expect(normalizeAgentHistoryViewPreferences({ topic: '   ' }).topic).toBe('all');
    expect(normalizeAgentHistoryViewPreferences({ topic: 'x'.repeat(81) }).topic).toBe('all');
  });
});
