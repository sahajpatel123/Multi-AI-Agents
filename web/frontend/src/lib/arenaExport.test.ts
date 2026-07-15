import { describe, expect, it } from 'vitest';
import { formatArenaExport } from './arenaExport';
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
        verdict: 'Ship the smallest honest slice.',
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
