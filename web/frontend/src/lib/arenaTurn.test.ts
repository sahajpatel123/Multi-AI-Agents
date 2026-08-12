import { describe, expect, it } from 'vitest';
import type { AgentResponse, SessionTurn } from '../types';
import { buildSessionTurnResponse } from './arenaTurn';

const agentResponse = (agentId: string): AgentResponse => ({
  agent_id: agentId,
  agent_number: agentId === 'agent_1' ? 1 : 2,
  verdict: `${agentId} verdict`,
  one_liner: `${agentId} one-liner`,
  confidence: 80,
  key_assumption: 'Assumption',
  timestamp: '2026-08-12T10:00:00Z',
});

const turn: SessionTurn = {
  turn_id: 'turn-1',
  prompt: 'Should we ship today?',
  agent_responses: {
    agent_1: agentResponse('agent_1'),
    agent_2: agentResponse('agent_2'),
  },
  winner_id: 'agent_1',
  timestamp: '2026-08-12T10:00:00Z',
};

describe('buildSessionTurnResponse', () => {
  it('uses the explicitly supplied session id for the rehydrated turn', () => {
    const response = buildSessionTurnResponse(turn, 'resumed-session');
    expect(response.session_id).toBe('resumed-session');
  });

  it('marks the stored winner as the 100-score winner and others at 75', () => {
    const response = buildSessionTurnResponse(turn, 'session-a');
    expect(response.winner_agent_id).toBe('agent_1');
    expect(response.winner.agent_id).toBe('agent_1');
    expect(
      response.all_responses.find((scored) => scored.response.agent_id === 'agent_1'),
    ).toMatchObject({ score: 100, is_winner: true });
    expect(
      response.all_responses.find((scored) => scored.response.agent_id === 'agent_2'),
    ).toMatchObject({ score: 75, is_winner: false });
  });

  it('defaults prompt_category and tools_used for older stored turns', () => {
    const response = buildSessionTurnResponse(
      { ...turn, prompt_category: undefined },
      'session-a',
    );
    expect(response.prompt_category).toBe('');
    expect(response.tools_used).toEqual([]);
  });
});
