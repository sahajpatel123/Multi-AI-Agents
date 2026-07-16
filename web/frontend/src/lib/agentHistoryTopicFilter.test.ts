import { describe, expect, it } from 'vitest';
import {
  AGENT_HISTORY_TOPIC_ALL,
  agentHistoryTopicFilterUseful,
  agentHistoryTopicLabel,
  collectHistoryTopicOptions,
  filterAgentHistoryByTopic,
} from './agentHistoryTopicFilter';

describe('agentHistoryTopicFilter', () => {
  const items = [
    { id: 'a', topics: ['Rates', 'Fed'] },
    { id: 'b', topics: ['rates', 'Housing'] },
    { id: 'c', topics: ['AI'] },
  ];

  it('collects All topics plus unique topics by frequency', () => {
    const opts = collectHistoryTopicOptions(items);
    expect(opts[0]).toEqual({ value: AGENT_HISTORY_TOPIC_ALL, label: 'All topics' });
    expect(opts.slice(1).map((o) => o.value)).toEqual(['rates', 'ai', 'fed', 'housing']);
  });

  it('filters by topic case-insensitively', () => {
    expect(filterAgentHistoryByTopic(items, AGENT_HISTORY_TOPIC_ALL)).toHaveLength(3);
    expect(filterAgentHistoryByTopic(items, 'rates').map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('detects usefulness and labels', () => {
    expect(agentHistoryTopicFilterUseful(items)).toBe(true);
    expect(agentHistoryTopicFilterUseful([{ topics: [] }])).toBe(false);
    const opts = collectHistoryTopicOptions(items);
    expect(agentHistoryTopicLabel('ai', opts)).toBe('AI');
  });
});
