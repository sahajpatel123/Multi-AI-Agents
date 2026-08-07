import { describe, expect, it } from 'vitest';
import {
  formatArenaExport,
  formatArenaJsonExport,
  formatArenaWinnerExport,
  pickArenaWinner,
} from './arenaExport';
import type { PromptResponse } from '../types';

const sample: PromptResponse = {
  session_id: 's1',
  prompt: 'Should we ship this week?',
  prompt_category: 'question',
  winner: {} as PromptResponse['winner'],
  winner_agent_id: 'agent_1',
  all_responses: [
    {
      is_winner: false,
      score: 72,
      response: {
        agent_id: 'agent_2',
        agent_number: 2,
        one_liner: 'Question the deadline first.',
        verdict: 'The week is arbitrary.',
        confidence: 0.7,
        key_assumption: 'time pressure is real',
        timestamp: '',
      },
    },
    {
      is_winner: true,
      score: 91,
      response: {
        agent_id: 'agent_1',
        agent_number: 1,
        one_liner: 'Ship the smallest honest slice.',
        verdict: 'Ship a thin vertical that de-risks the week without rewriting the roadmap.',
        confidence: 0.9,
        key_assumption: 'quality bar is fixed',
        timestamp: '',
      },
    },
  ],
  integrity: null,
  tools_used: [],
  timestamp: '',
};

describe('formatArenaExport', () => {
  it('puts the winner first and includes prompt + one-liners', () => {
    const md = formatArenaExport(sample, (id) => ({
      name: id === 'agent_1' ? 'The Analyst' : 'The Philosopher',
    }));
    expect(md).toContain('Should we ship this week?');
    expect(md.indexOf('The Analyst')).toBeLessThan(md.indexOf('The Philosopher'));
    expect(md).toContain('winner');
    expect(md).toContain('Ship the smallest honest slice.');
    expect(md).toContain('Question the deadline first.');
  });
});

describe('pickArenaWinner', () => {
  it('prefers is_winner flag', () => {
    const w = pickArenaWinner(sample);
    expect(w?.response.agent_id).toBe('agent_1');
  });

  it('falls back to winner_agent_id when no flag', () => {
    const unflagged: PromptResponse = {
      ...sample,
      all_responses: sample.all_responses.map((r) => ({ ...r, is_winner: false })),
    };
    expect(pickArenaWinner(unflagged)?.response.agent_id).toBe('agent_1');
  });

  it('returns null for empty responses', () => {
    expect(pickArenaWinner({ ...sample, all_responses: [] })).toBeNull();
  });
});

describe('formatArenaWinnerExport', () => {
  it('exports only the winner with score, take, and assumption', () => {
    const md = formatArenaWinnerExport(sample, (id) => ({
      name: id === 'agent_1' ? 'The Analyst' : 'The Philosopher',
    }));
    expect(md).toContain('# The Analyst · Arena winner');
    expect(md).toContain('Should we ship this week?');
    expect(md).toContain('**Score:** 91');
    expect(md).toContain('Ship the smallest honest slice.');
    expect(md).toContain('Ship a thin vertical');
    expect(md).toContain('quality bar is fixed');
    expect(md).toContain('winner only');
    expect(md).not.toContain('Question the deadline first.');
    expect(md).not.toContain('The Philosopher');
  });

  it('handles missing winner gracefully', () => {
    const md = formatArenaWinnerExport(
      { ...sample, all_responses: [], winner_agent_id: '' },
      () => ({ name: 'X' }),
    );
    expect(md).toContain('No winning take available');
  });
});

describe('formatArenaJsonExport', () => {
  it('serializes the round with winner, scores, and takes', () => {
    const json = formatArenaJsonExport(
      sample,
      (id) => ({
        name: id === 'agent_1' ? 'The Analyst' : 'The Philosopher',
      }),
      { exportedAt: '2026-08-07T00:00:00.000Z' },
    );
    const parsed = JSON.parse(json);
    expect(parsed.exported_from).toBe('arena');
    expect(parsed.exported_at).toBe('2026-08-07T00:00:00.000Z');
    expect(parsed.session_id).toBe('s1');
    expect(parsed.prompt).toBe('Should we ship this week?');
    expect(parsed.prompt_category).toBe('question');
    expect(parsed.winner_agent_id).toBe('agent_1');
    expect(parsed.tools_used).toEqual([]);
    expect(parsed.timestamp).toBe('');
    expect(parsed.takes).toHaveLength(2);
    expect(parsed.takes[0]).toMatchObject({
      agent_id: 'agent_1',
      agent_name: 'The Analyst',
      is_winner: true,
      score: 91,
      confidence: 0.9,
      one_liner: 'Ship the smallest honest slice.',
      key_assumption: 'quality bar is fixed',
    });
    expect(json.endsWith('\n')).toBe(true);
  });

  it('normalizes a missing prompt without crashing', () => {
    const json = formatArenaJsonExport(
      { ...sample, prompt: '' },
      () => ({ name: 'The Analyst' }),
      { exportedAt: '2026-08-07T00:00:00.000Z' },
    );
    const parsed = JSON.parse(json);
    expect(parsed.prompt).toBe('(no prompt)');
    expect(parsed.takes).toHaveLength(2);
  });
});
