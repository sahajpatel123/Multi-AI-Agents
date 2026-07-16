import { describe, expect, it } from 'vitest';
import {
  sidebarRecentsSortLabel,
  sidebarSavedSortLabel,
  sortSidebarRecents,
  sortSidebarSaved,
} from './sidebarListSort';

describe('sortSidebarRecents', () => {
  const sample = [
    {
      turn_id: '1',
      prompt: 'Zebra question',
      title: null,
      winner_id: 'agent_2',
      winnerName: 'Pragmatist',
      timestamp: '2026-01-01T00:00:00Z',
    },
    {
      turn_id: '2',
      prompt: 'Alpha question',
      title: 'Custom alpha',
      winner_id: 'agent_1',
      winnerName: 'Analyst',
      timestamp: '2026-03-01T00:00:00Z',
    },
  ];

  it('sorts newest first', () => {
    expect(sortSidebarRecents(sample, 'newest').map((t) => t.turn_id)).toEqual(['2', '1']);
  });

  it('sorts by winner name', () => {
    expect(sortSidebarRecents(sample, 'winner').map((t) => t.turn_id)).toEqual(['2', '1']);
  });

  it('labels sorts', () => {
    expect(sidebarRecentsSortLabel('title')).toBe('Title');
  });
});

describe('sortSidebarSaved', () => {
  const sample = [
    { id: 1, mindName: 'Stoic', score: 40, timestamp: '2026-01-01T00:00:00Z' },
    { id: 2, mindName: 'Analyst', score: 90, timestamp: '2026-03-01T00:00:00Z' },
    { id: 3, mindName: 'Empath', score: null, timestamp: '2026-02-01T00:00:00Z' },
  ];

  it('sorts by score high to low', () => {
    expect(sortSidebarSaved(sample, 'score_desc').map((s) => s.id)).toEqual([2, 1, 3]);
  });

  it('sorts by mind', () => {
    expect(sortSidebarSaved(sample, 'mind').map((s) => s.id)).toEqual([2, 3, 1]);
  });

  it('labels sorts', () => {
    expect(sidebarSavedSortLabel('score_asc')).toBe('Score · low');
  });
});
