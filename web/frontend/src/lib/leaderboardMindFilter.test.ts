import { describe, expect, it } from 'vitest';
import {
  LEADERBOARD_MIND_ALL,
  filterLeaderboardTurnsByMind,
  filterLeaderboardTurnsByQuery,
  formatLeaderboardPromptCopy,
  leaderboardMindFilterLabel,
  leaderboardMindFilterUseful,
} from './leaderboardMindFilter';

const TURNS = [
  { turnId: '1', winnerId: 'agent_1', prompt: 'A' },
  { turnId: '2', winnerId: 'agent_2', prompt: 'B' },
  { turnId: '3', winnerId: 'agent_1', prompt: 'C' },
];

describe('filterLeaderboardTurnsByMind', () => {
  it('returns all for all / empty', () => {
    expect(filterLeaderboardTurnsByMind(TURNS, LEADERBOARD_MIND_ALL)).toHaveLength(3);
    expect(filterLeaderboardTurnsByMind(TURNS, '')).toHaveLength(3);
  });

  it('filters by winner', () => {
    expect(
      filterLeaderboardTurnsByMind(TURNS, 'agent_1').map((t) => t.turnId),
    ).toEqual(['1', '3']);
    expect(filterLeaderboardTurnsByMind(TURNS, 'agent_2')).toHaveLength(1);
  });

  it('does not mutate', () => {
    const copy = TURNS.map((t) => ({ ...t }));
    filterLeaderboardTurnsByMind(TURNS, 'agent_1');
    expect(TURNS).toEqual(copy);
  });
});

describe('filterLeaderboardTurnsByQuery', () => {
  const searchableTurns = [
    {
      turnId: '1',
      winnerId: 'agent_1',
      prompt: 'Should we launch now?',
      winnerName: 'The Analyst',
      oneLiner: 'Ship the smallest honest slice.',
    },
    {
      turnId: '2',
      winnerId: 'agent_2',
      prompt: 'How should we price the product?',
      winnerName: 'The Pragmatist',
      oneLiner: 'Test willingness to pay before scaling.',
    },
  ];

  it('matches prompt, winner, and answer text case-insensitively', () => {
    expect(filterLeaderboardTurnsByQuery(searchableTurns, 'LAUNCH').map((t) => t.turnId)).toEqual([
      '1',
    ]);
    expect(filterLeaderboardTurnsByQuery(searchableTurns, 'pragmatist')).toHaveLength(1);
    expect(filterLeaderboardTurnsByQuery(searchableTurns, 'willingness to pay')).toHaveLength(1);
  });

  it('matches diacritics-insensitively for easier keyboard search', () => {
    const turnsWithDiacritics = [
      {
        ...searchableTurns[0],
        prompt: 'Should we launch the café pilot?',
      },
    ];

    expect(filterLeaderboardTurnsByQuery(turnsWithDiacritics, 'CAFE')).toHaveLength(1);
  });

  it('requires every search term and keeps the original list unchanged', () => {
    const original = searchableTurns.map((turn) => ({ ...turn }));
    expect(filterLeaderboardTurnsByQuery(searchableTurns, 'launch analyst')).toHaveLength(1);
    expect(filterLeaderboardTurnsByQuery(searchableTurns, 'launch pricing')).toHaveLength(0);
    expect(filterLeaderboardTurnsByQuery(searchableTurns, '   ')).toHaveLength(2);
    expect(searchableTurns).toEqual(original);
  });
});

describe('leaderboardMindFilterLabel', () => {
  it('labels all and named minds', () => {
    expect(leaderboardMindFilterLabel(LEADERBOARD_MIND_ALL)).toBe('All minds');
    expect(leaderboardMindFilterLabel('agent_1', (id) => (id === 'agent_1' ? 'Claude' : null))).toBe(
      'Claude',
    );
    expect(leaderboardMindFilterLabel('x')).toBe('x');
  });
});

describe('leaderboardMindFilterUseful', () => {
  it('true when ≥2 winners', () => {
    expect(leaderboardMindFilterUseful(TURNS)).toBe(true);
    expect(leaderboardMindFilterUseful([{ winnerId: 'a' }, { winnerId: 'a' }])).toBe(false);
    expect(leaderboardMindFilterUseful([])).toBe(false);
  });
});

describe('formatLeaderboardPromptCopy', () => {
  it('builds markdown with winner and take', () => {
    const md = formatLeaderboardPromptCopy({
      prompt: 'What is X?',
      winnerName: 'Claude',
      fullTake: 'X is …',
    });
    expect(md).toContain('# What is X?');
    expect(md).toContain('**Winner:** Claude');
    expect(md).toContain('X is …');
  });
});
