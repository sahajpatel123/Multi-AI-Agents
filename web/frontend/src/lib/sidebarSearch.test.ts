import { describe, expect, it } from 'vitest';
import { filterBySearchQuery, filterTurnsBySearchQuery } from './sidebarSearch';

const turns = [
  { turn_id: '1', prompt: 'Should I ship today?', title: 'Ship check' },
  { turn_id: '2', prompt: 'What is enough?', prompt_category: 'question' },
  { turn_id: '3', prompt: 'Rewrite this email', title: '' },
];

describe('filterTurnsBySearchQuery', () => {
  it('returns all turns when query is empty', () => {
    expect(filterTurnsBySearchQuery(turns, '')).toHaveLength(3);
    expect(filterTurnsBySearchQuery(turns, '   ')).toHaveLength(3);
  });

  it('matches prompt and custom title case-insensitively', () => {
    expect(filterTurnsBySearchQuery(turns, 'SHIP').map((t) => t.turn_id)).toEqual(['1']);
    expect(filterTurnsBySearchQuery(turns, 'enough').map((t) => t.turn_id)).toEqual(['2']);
    expect(filterTurnsBySearchQuery(turns, 'email').map((t) => t.turn_id)).toEqual(['3']);
  });

  it('returns empty when nothing matches', () => {
    expect(filterTurnsBySearchQuery(turns, 'quantum')).toEqual([]);
  });
});

describe('filterBySearchQuery', () => {
  it('matches Agent history-style fields', () => {
    const history = [
      { task_id: 'a', task_text: 'Research quantum computing', title: 'QC brief' },
      { task_id: 'b', task_text: 'Draft a product FAQ', title: null },
    ];
    const hit = filterBySearchQuery(history, 'quantum', (h) => [h.task_text, h.title]);
    expect(hit.map((h) => h.task_id)).toEqual(['a']);
    expect(
      filterBySearchQuery(history, 'FAQ', (h) => [h.task_text, h.title]).map((h) => h.task_id),
    ).toEqual(['b']);
  });
});
