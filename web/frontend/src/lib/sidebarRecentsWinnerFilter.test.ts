import { describe, expect, it } from 'vitest';
import {
  SIDEBAR_RECENTS_WINNER_ALL,
  collectRecentsWinnerFilterOptions,
  filterRecentsByWinner,
  sidebarRecentsWinnerFilterLabel,
} from './sidebarRecentsWinnerFilter';

describe('sidebarRecentsWinnerFilter', () => {
  const items = [
    { winner_id: 'agent_1', winnerName: 'The Analyst' },
    { winner_id: 'agent_2', winnerName: 'The Pragmatist' },
    { winner_id: 'agent_1', winnerName: 'The Analyst' },
  ];

  it('collects All winners plus unique minds sorted by label', () => {
    const opts = collectRecentsWinnerFilterOptions(items);
    expect(opts[0]).toEqual({ value: SIDEBAR_RECENTS_WINNER_ALL, label: 'All winners' });
    expect(opts.slice(1).map((o) => o.value)).toEqual(['agent_1', 'agent_2']);
    expect(opts[1].label).toBe('The Analyst');
  });

  it('filters by winner and leaves All unchanged', () => {
    expect(filterRecentsByWinner(items, SIDEBAR_RECENTS_WINNER_ALL)).toHaveLength(3);
    expect(filterRecentsByWinner(items, 'agent_1')).toHaveLength(2);
    expect(filterRecentsByWinner(items, 'agent_2')).toHaveLength(1);
  });

  it('labels the active filter', () => {
    const opts = collectRecentsWinnerFilterOptions(items);
    expect(sidebarRecentsWinnerFilterLabel('agent_1', opts)).toBe('The Analyst');
    expect(sidebarRecentsWinnerFilterLabel(SIDEBAR_RECENTS_WINNER_ALL, opts)).toBe('All winners');
  });
});
