import { describe, expect, it } from 'vitest';
import {
  agentHistoryRecencyFilterUseful,
  agentHistoryRecencyLabel,
  filterAgentHistoryByRecency,
} from './agentHistoryRecencyFilter';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-16T12:00:00Z').getTime();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('agentHistoryRecencyFilter', () => {
  const items = [
    { id: 'hour', created_at: iso(1 * 60 * 60 * 1000) }, // 1h ago
    { id: 'day', created_at: iso(DAY) }, // 1d ago (boundary)
    { id: 'week', created_at: iso(6 * DAY) }, // 6d ago
    { id: 'month', created_at: iso(29 * DAY) }, // 29d ago
    { id: 'year', created_at: iso(400 * DAY) }, // >1y ago
    { id: 'undated', created_at: null },
    { id: 'garbage' }, // undefined
  ];

  it('returns all (including undated) when filter is all', () => {
    expect(filterAgentHistoryByRecency(items, 'all', NOW)).toHaveLength(7);
  });

  it('last_24h keeps items within 24h inclusive, drops undated', () => {
    const r = filterAgentHistoryByRecency(items, 'last_24h', NOW).map((i) => i.id);
    expect(r).toEqual(['hour', 'day']);
  });

  it('last_7d keeps items up to 7 days inclusive, drops undated', () => {
    const r = filterAgentHistoryByRecency(items, 'last_7d', NOW).map((i) => i.id);
    expect(r).toEqual(['hour', 'day', 'week']);
  });

  it('last_30d keeps items up to 30 days inclusive', () => {
    const r = filterAgentHistoryByRecency(items, 'last_30d', NOW).map((i) => i.id);
    expect(r).toEqual(['hour', 'day', 'week', 'month']);
  });

  it('older keeps items strictly older than 30d, drops undated', () => {
    const r = filterAgentHistoryByRecency(items, 'older', NOW).map((i) => i.id);
    expect(r).toEqual(['year']);
  });

  it('treats invalid ISO as undated and drops from non-all filters', () => {
    const dirty = [
      { id: 'x', created_at: 'not-a-date' },
      { id: 'y', created_at: iso(DAY) },
    ];
    expect(filterAgentHistoryByRecency(dirty, 'last_24h', NOW).map((i) => i.id)).toEqual([
      'y',
    ]);
    expect(filterAgentHistoryByRecency(dirty, 'older', NOW).map((i) => i.id)).toEqual([]);
    // 'all' keeps them all
    expect(filterAgentHistoryByRecency(dirty, 'all', NOW)).toHaveLength(2);
  });

  it('does not mutate input', () => {
    const copy = items.map((i) => ({ ...i }));
    filterAgentHistoryByRecency(items, 'last_7d', NOW);
    expect(items).toEqual(copy);
  });

  it('handles empty input', () => {
    expect(filterAgentHistoryByRecency([], 'last_24h', NOW)).toEqual([]);
    expect(filterAgentHistoryByRecency(undefined as unknown as never[], 'all', NOW)).toEqual([]);
  });

  it('detects when chips are useful', () => {
    expect(agentHistoryRecencyFilterUseful(items, NOW)).toBe(true);
    expect(
      agentHistoryRecencyFilterUseful(
        [{ created_at: null }, { created_at: undefined }, {}],
        NOW,
      ),
    ).toBe(false);
    expect(agentHistoryRecencyFilterUseful([], NOW)).toBe(false);
  });

  it('labels filters', () => {
    expect(agentHistoryRecencyLabel('last_24h')).toBe('Last 24h');
    expect(agentHistoryRecencyLabel('last_7d')).toBe('Last 7 days');
    expect(agentHistoryRecencyLabel('last_30d')).toBe('Last 30 days');
    expect(agentHistoryRecencyLabel('older')).toBe('Older');
    expect(agentHistoryRecencyLabel('all')).toBe('All time');
  });
});
