import { describe, expect, it } from 'vitest';
import {
  SIDEBAR_SAVED_MIND_ALL,
  collectSavedMindFilterOptions,
  filterSavedByMind,
  sidebarSavedMindFilterLabel,
} from './sidebarSavedMindFilter';

describe('sidebarSavedMindFilter', () => {
  const items = [
    { agent_id: 'analyst', persona_name: 'The Analyst' },
    { agent_id: 'pragmatist', persona_name: 'The Pragmatist' },
    { agent_id: 'analyst', persona_name: 'The Analyst' },
  ];

  it('collects All plus unique minds sorted by label', () => {
    const opts = collectSavedMindFilterOptions(items);
    expect(opts[0]).toEqual({ value: SIDEBAR_SAVED_MIND_ALL, label: 'All' });
    expect(opts.slice(1).map((o) => o.value)).toEqual(['analyst', 'pragmatist']);
    expect(opts[1].label).toBe('The Analyst');
  });

  it('filters by mind and leaves All unchanged', () => {
    expect(filterSavedByMind(items, SIDEBAR_SAVED_MIND_ALL)).toHaveLength(3);
    expect(filterSavedByMind(items, 'analyst')).toHaveLength(2);
    expect(filterSavedByMind(items, 'pragmatist')).toHaveLength(1);
  });

  it('labels the active filter', () => {
    const opts = collectSavedMindFilterOptions(items, () => 'Fallback');
    expect(sidebarSavedMindFilterLabel('analyst', opts)).toBe('The Analyst');
    expect(sidebarSavedMindFilterLabel(SIDEBAR_SAVED_MIND_ALL, opts)).toBe('All');
  });
});
