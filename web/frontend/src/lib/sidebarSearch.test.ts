import { describe, expect, it } from 'vitest';
import {
  filterBySearchQuery,
  filterSessionsBySearchQuery,
  filterTurnsBySearchQuery,
} from './sidebarSearch';

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

  it('matches saved takes by one-liner or prompt', () => {
    const saved = [
      { id: 1, one_liner: 'Ship the smallest slice', prompt: 'Should I ship?' },
      { id: 2, one_liner: 'Enough is peace', prompt: 'What is enough?' },
    ];
    expect(
      filterBySearchQuery(saved, 'ship', (s) => [s.one_liner, s.prompt]).map((s) => s.id),
    ).toEqual([1]);
    expect(
      filterBySearchQuery(saved, 'enough', (s) => [s.one_liner, s.prompt]).map((s) => s.id),
    ).toEqual([2]);
  });
});

describe('filterSessionsBySearchQuery', () => {
  const sessions = [
    {
      session_id: 'chat-1',
      title: 'Launch plan review',
      topics: ['launch', 'marketing'],
      primary_topic: 'launch',
      last_prompt: 'Should we ship today?',
    },
    {
      session_id: 'chat-2',
      title: null,
      topics: [],
      primary_topic: null,
      last_prompt: 'Rewrite this email',
    },
  ];

  it('returns all sessions when query is empty', () => {
    expect(filterSessionsBySearchQuery(sessions, '')).toHaveLength(2);
    expect(filterSessionsBySearchQuery(sessions, '   ')).toHaveLength(2);
  });

  it('matches title, last prompt, primary topic, and topic list case-insensitively', () => {
    expect(filterSessionsBySearchQuery(sessions, 'PLAN').map((s) => s.session_id)).toEqual([
      'chat-1',
    ]);
    expect(filterSessionsBySearchQuery(sessions, 'email').map((s) => s.session_id)).toEqual([
      'chat-2',
    ]);
    expect(filterSessionsBySearchQuery(sessions, 'marketing').map((s) => s.session_id)).toEqual([
      'chat-1',
    ]);
    expect(filterSessionsBySearchQuery(sessions, 'launch').map((s) => s.session_id)).toEqual([
      'chat-1',
    ]);
  });

  it('returns empty when nothing matches', () => {
    expect(filterSessionsBySearchQuery(sessions, 'quantum')).toEqual([]);
  });
});
