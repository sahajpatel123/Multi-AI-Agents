import { describe, expect, it } from 'vitest';
import {
  AGENT_HISTORY_SOURCE_ALL,
  agentHistorySourceFilterUseful,
  agentHistorySourceLabel,
  agentHistorySourceFor,
  collectHistorySourceOptions,
  filterAgentHistoryBySource,
} from './agentHistorySourceFilter';

describe('agentHistorySourceFilter', () => {
  const items = [
    { id: 'manual', task_id: 'manual' },
    { id: 'watch', watchlist_item_id: 'watch-1' },
    { id: 'orch', orchestration_id: 'orch-1' },
    { id: 'watch-priority', watchlistItemId: 'watch-2', orchestrationId: 'orch-2' },
  ];

  it('collects only sources present and keeps All first', () => {
    expect(collectHistorySourceOptions(items)).toEqual([
      { value: AGENT_HISTORY_SOURCE_ALL, label: 'All sources' },
      { value: 'standalone', label: 'Standalone' },
      { value: 'watchlist', label: 'Watchlist' },
      { value: 'orchestration', label: 'Orchestration' },
    ]);
  });

  it('filters both API naming styles without mutating the input', () => {
    const all = filterAgentHistoryBySource(items, AGENT_HISTORY_SOURCE_ALL);
    expect(all).toEqual(items);
    expect(all).not.toBe(items);
    expect(filterAgentHistoryBySource(items, 'standalone').map((i) => i.id)).toEqual(['manual']);
    expect(filterAgentHistoryBySource(items, 'watchlist').map((i) => i.id)).toEqual([
      'watch',
      'watch-priority',
    ]);
    expect(filterAgentHistoryBySource(items, 'orchestration').map((i) => i.id)).toEqual(['orch']);
  });

  it('resolves a stable source for row provenance badges', () => {
    expect(agentHistorySourceFor(items[0])).toBe('standalone');
    expect(agentHistorySourceFor(items[1])).toBe('watchlist');
    expect(agentHistorySourceFor(items[2])).toBe('orchestration');
    expect(agentHistorySourceFor(items[3])).toBe('watchlist');
    expect(agentHistorySourceFor(undefined)).toBe('standalone');
  });

  it('treats blank and malformed identifiers as standalone', () => {
    const malformed = [
      { id: 'blank', watchlist_item_id: '  ', orchestrationId: null },
      { id: 'wrong-type', watchlistItemId: 42 as unknown as string },
    ];
    expect(filterAgentHistoryBySource(malformed, 'standalone').map((i) => i.id)).toEqual([
      'blank',
      'wrong-type',
    ]);
    expect(agentHistorySourceFilterUseful(malformed)).toBe(false);
  });

  it('labels known values and falls back safely', () => {
    const options = collectHistorySourceOptions(items);
    expect(agentHistorySourceLabel('watchlist', options)).toBe('Watchlist');
    expect(agentHistorySourceLabel('all', options)).toBe('All sources');
    expect(agentHistorySourceLabel('orchestration', [])).toBe('Orchestration');
    expect(agentHistorySourceLabel('unknown' as never, options)).toBe('All sources');
    expect(agentHistorySourceFilterUseful(items)).toBe(true);
  });

  it('fails open to all rows for malformed runtime filter values', () => {
    expect(filterAgentHistoryBySource(items, 'future-source' as never)).toEqual(items);
    expect(filterAgentHistoryBySource(items, undefined)).toEqual(items);
    expect(filterAgentHistoryBySource(items, null)).toEqual(items);
  });
});
