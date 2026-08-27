import { describe, expect, it } from 'vitest';
import {
  AGENT_HISTORY_SHARED_SEARCH_MAX_LENGTH,
  AGENT_HISTORY_VIEW_QUERY_KEYS,
  buildAgentHistoryViewUrl,
  readAgentHistoryViewFromSearchParams,
} from './agentHistoryViewLink';

const preferences = {
  sort: 'score_desc',
  status: 'completed',
  score: 'high',
  confidence: 'solid',
  recency: 'last_30d',
  feedback: 'accurate',
  topic: 'product strategy',
  source: 'watchlist',
  pin: 'pinned',
} as const;

describe('Agent history view links', () => {
  it('serializes the complete shareable view and removes task deep-link state', () => {
    const shared = buildAgentHistoryViewUrl(
      'https://arena.test/agent?task_id=task-7&q=private%20prompt&createRoom=1&tab=history&history_pin=pinned',
      preferences,
      '  IPO outlook  ',
    );
    const url = new URL(shared);

    expect(url.pathname).toBe('/agent');
    expect(url.searchParams.get('task_id')).toBeNull();
    expect(url.searchParams.get('q')).toBeNull();
    expect(url.searchParams.get('createRoom')).toBeNull();
    expect(url.searchParams.get('tab')).toBe('history');
    expect(url.searchParams.get(AGENT_HISTORY_VIEW_QUERY_KEYS.marker)).toBe('1');
    expect(url.searchParams.get(AGENT_HISTORY_VIEW_QUERY_KEYS.sort)).toBe('score_desc');
    expect(url.searchParams.get(AGENT_HISTORY_VIEW_QUERY_KEYS.status)).toBe('completed');
    expect(url.searchParams.get(AGENT_HISTORY_VIEW_QUERY_KEYS.topic)).toBe('product strategy');
    expect(url.searchParams.get(AGENT_HISTORY_VIEW_QUERY_KEYS.search)).toBe('IPO outlook');
    // Pins are browser-local and are intentionally never put in a shared URL.
    expect(url.searchParams.has('history_pin')).toBe(false);
  });

  it('strips NULs and caps shared search by Unicode code point', () => {
    const search = `\u0000${'🙂'.repeat(AGENT_HISTORY_SHARED_SEARCH_MAX_LENGTH + 20)}`;
    const shared = buildAgentHistoryViewUrl('https://arena.test/agent', preferences, search);
    const url = new URL(shared);

    expect(url.searchParams.get(AGENT_HISTORY_VIEW_QUERY_KEYS.search)).toBe(
      '🙂'.repeat(AGENT_HISTORY_SHARED_SEARCH_MAX_LENGTH),
    );
  });

  it('reads and normalizes a shared view while resetting local pins', () => {
    const params = new URLSearchParams(
      'history_view=1&history_sort=score_desc&history_status=completed&history_topic=%20Markets%20&history_q=%20IPO%20',
    );
    const result = readAgentHistoryViewFromSearchParams(params, preferences);

    expect(result).toEqual({
      preferences: {
        ...preferences,
        topic: 'markets',
        pin: 'all',
      },
      searchQuery: 'IPO',
    });
  });

  it('ignores malformed values field-by-field and bounds shared search text', () => {
    const params = new URLSearchParams({
      history_view: '1',
      history_sort: 'not-a-sort',
      history_status: 'live',
      history_source: 'not-a-source',
      history_q: ` ${'x'.repeat(AGENT_HISTORY_SHARED_SEARCH_MAX_LENGTH + 20)} `,
    });
    const result = readAgentHistoryViewFromSearchParams(params, preferences);

    expect(result?.preferences.sort).toBe('newest');
    expect(result?.preferences.status).toBe('live');
    expect(result?.preferences.source).toBe('all');
    expect(result?.preferences.pin).toBe('all');
    expect(result?.searchQuery).toBe('x'.repeat(AGENT_HISTORY_SHARED_SEARCH_MAX_LENGTH));
  });

  it('returns null when no history view params are present', () => {
    expect(readAgentHistoryViewFromSearchParams(new URLSearchParams('task_id=task-7'))).toBeNull();
  });
});
