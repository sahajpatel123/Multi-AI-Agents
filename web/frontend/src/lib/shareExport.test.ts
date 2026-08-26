import { describe, expect, it } from 'vitest';
import { buildShareRoundJsonPayload, buildShareTakeJsonPayload } from './shareExport';

describe('shareExport', () => {
  it('keeps a single take structured without altering Markdown', () => {
    expect(
      buildShareTakeJsonPayload({
        agentId: 'agent_1',
        agentName: 'The Analyst',
        prompt: 'Should I ship?',
        response: 'Ship the **smallest** honest slice.',
        shareUrl: 'https://arena.example/share?agent=agent_1',
      }),
    ).toEqual({
      schema_version: 1,
      kind: 'take',
      agent: { id: 'agent_1', name: 'The Analyst' },
      prompt: 'Should I ship?',
      response: 'Ship the **smallest** honest slice.',
      share_url: 'https://arena.example/share?agent=agent_1',
    });
  });

  it('normalizes round metadata and bounded scores for downstream readers', () => {
    expect(
      buildShareRoundJsonPayload({
        round: {
          prompt: 'Choose carefully',
          winnerAgentId: 'agent_2',
          takes: [
            { agentId: 'agent_1', oneLiner: 'A', score: 101.4 },
            { agentId: '', oneLiner: 'B', score: Number.NaN },
          ],
        },
        resolveAgentName: (id) => (id === 'agent_1' ? 'The Analyst' : ''),
      }),
    ).toEqual({
      schema_version: 1,
      kind: 'round',
      prompt: 'Choose carefully',
      winner_agent_id: 'agent_2',
      takes: [
        { agent_id: 'agent_1', agent_name: 'The Analyst', one_liner: 'A', score: 100 },
        { agent_id: null, agent_name: 'Arena mind', one_liner: 'B', score: null },
      ],
      share_url: null,
    });
  });
});
