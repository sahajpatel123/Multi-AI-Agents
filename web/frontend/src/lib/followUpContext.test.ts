import { describe, expect, it } from 'vitest';
import type { PromptResponse } from '../types';
import {
  buildFollowUpContext,
  FOLLOW_UP_MAX_ITEM_CHARS,
  FOLLOW_UP_MAX_TOTAL_CHARS,
} from './followUpContext';

function makeResponse(
  prompt: string,
  verdicts: Array<{ agent_id: string; verdict: string }>,
): PromptResponse {
  return {
    session_id: 's1',
    prompt,
    prompt_category: 'question',
    winner: {
      agent_id: verdicts[0]?.agent_id || 'agent_1',
      agent_number: 1,
      verdict: verdicts[0]?.verdict || '',
      one_liner: '',
      confidence: 50,
      key_assumption: '',
      timestamp: '2026-01-01T00:00:00Z',
    },
    winner_agent_id: verdicts[0]?.agent_id || 'agent_1',
    all_responses: verdicts.map((v, i) => ({
      response: {
        agent_id: v.agent_id,
        agent_number: i + 1,
        verdict: v.verdict,
        one_liner: '',
        confidence: 50,
        key_assumption: '',
        timestamp: '2026-01-01T00:00:00Z',
      },
      score: 80 - i,
      is_winner: i === 0,
    })),
    integrity: null,
    tools_used: [],
    timestamp: '2026-01-01T00:00:00Z',
  };
}

describe('buildFollowUpContext', () => {
  it('includes the original question first', () => {
    const ctx = buildFollowUpContext(makeResponse('Is UBI good?', []));
    expect(ctx).toEqual([{ role: 'user', content: 'Is UBI good?' }]);
  });

  it('adds one assistant item per verdict with resolved names', () => {
    const ctx = buildFollowUpContext(
      makeResponse('Q', [
        { agent_id: 'agent_1', verdict: 'Yes.' },
        { agent_id: 'agent_2', verdict: 'No.' },
      ]),
      (id) => (id === 'agent_1' ? 'The Analyst' : undefined),
    );
    expect(ctx).toEqual([
      { role: 'user', content: 'Q' },
      { role: 'assistant', agent_id: 'agent_1', name: 'The Analyst', content: 'Yes.' },
      { role: 'assistant', agent_id: 'agent_2', name: undefined, content: 'No.' },
    ]);
  });

  it('skips empty verdicts', () => {
    const ctx = buildFollowUpContext(
      makeResponse('Q', [
        { agent_id: 'agent_1', verdict: '' },
        { agent_id: 'agent_2', verdict: 'Real answer.' },
      ]),
    );
    expect(ctx).toHaveLength(2);
    expect(ctx[1].content).toBe('Real answer.');
  });

  it('truncates oversized verdicts to the per-item cap', () => {
    const huge = 'x'.repeat(FOLLOW_UP_MAX_ITEM_CHARS + 500);
    const ctx = buildFollowUpContext(makeResponse('Q', [{ agent_id: 'agent_1', verdict: huge }]));
    expect(ctx[1].content.length).toBe(FOLLOW_UP_MAX_ITEM_CHARS);
  });

  it('drops tail items when the total budget overflows', () => {
    const big = 'y'.repeat(1500);
    const verdicts = Array.from({ length: 8 }, (_, i) => ({
      agent_id: `agent_${i + 1}`,
      verdict: big,
    }));
    const ctx = buildFollowUpContext(makeResponse('Q', verdicts));
    const total = ctx.reduce((sum, item) => sum + item.content.length, 0);
    expect(total).toBeLessThanOrEqual(FOLLOW_UP_MAX_TOTAL_CHARS);
    expect(ctx.length).toBeLessThan(verdicts.length + 1);
    expect(ctx[0]).toEqual({ role: 'user', content: 'Q' });
  });
});
