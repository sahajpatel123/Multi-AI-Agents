import { describe, expect, it } from 'vitest';
import {
  formatDebateChallengedCopy,
  formatDebateExport,
  formatDebateJsonExport,
  formatDebateInterjectionCopy,
  formatDebateReactionCopy,
  formatDiscussExport,
  formatDiscussJsonExport,
  formatDiscussMessageCopy,
  type DebateExportRound,
  type ThreadMessage,
} from './threadExport';

describe('formatDiscussExport', () => {
  it('formats a conversation with attribution', () => {
    const md = formatDiscussExport({
      agentName: 'The Analyst',
      originalPrompt: 'Should I ship today?',
      messages: [
        { role: 'user', content: 'What is the risk?' },
        { role: 'agent', content: 'Ship the smallest honest slice.' },
      ],
    });
    expect(md).toContain('# Arena Discuss — The Analyst');
    expect(md).toContain('Should I ship today?');
    expect(md).toContain('**You:** What is the risk?');
    expect(md).toContain('**The Analyst:** Ship the smallest honest slice.');
    expect(md).toContain('Shared from Arena Discuss');
  });

  it('handles empty history honestly', () => {
    const md = formatDiscussExport({
      agentName: 'Marcus',
      originalPrompt: 'Q',
      messages: [],
    });
    expect(md).toContain('No messages yet');
  });

  it('treats a non-array history as empty instead of throwing', () => {
    const md = formatDiscussExport({
      agentName: 'Marcus',
      originalPrompt: 'Q',
      messages: { not: 'an array' } as unknown as ThreadMessage[],
    });
    expect(md).toContain('No messages yet');
  });

  it('skips null messages and whitespace-only bodies', () => {
    const md = formatDiscussExport({
      agentName: '  ',
      originalPrompt: '   ',
      messages: [
        null as unknown as ThreadMessage,
        { role: 'user', content: '   ' },
        { role: 'agent', content: '  Keep this  ' },
      ],
    });
    expect(md).toContain('Arena mind');
    expect(md).toContain('(no prompt)');
    expect(md).not.toContain('**You:**');
    expect(md).toContain('Keep this');
  });
});

describe('formatDiscussMessageCopy', () => {
  it('copies user message as plain text', () => {
    expect(
      formatDiscussMessageCopy({ role: 'user', content: '  What about cost?  ' }),
    ).toBe('What about cost?\n');
  });

  it('attributes agent takes and can include the question', () => {
    const md = formatDiscussMessageCopy({
      role: 'agent',
      content: 'Ship the smallest honest slice.',
      agentName: 'The Analyst',
      originalPrompt: 'Should I ship?',
      includeQuestion: true,
    });
    expect(md).toContain('**Question:** Should I ship?');
    expect(md).toContain('**The Analyst:**');
    expect(md).toContain('Ship the smallest honest slice.');
  });

  it('returns empty for blank content', () => {
    expect(formatDiscussMessageCopy({ role: 'user', content: '   ' })).toBe('');
  });
});

describe('formatDebateExport', () => {
  it('formats rounds with reactions and interjections', () => {
    const md = formatDebateExport({
      originalPrompt: 'Is this fair?',
      challengedAgentName: 'The Pragmatist',
      challengedOneLiner: 'Ship it.',
      rounds: [
        {
          roundNumber: 1,
          userInterjection: 'But latency?',
          reactions: [
            { agentName: 'The Analyst', content: 'Measure first.', stance: 'pushback' },
          ],
        },
      ],
    });
    expect(md).toContain('# Arena Debate');
    expect(md).toContain('Is this fair?');
    expect(md).toContain('The Pragmatist');
    expect(md).toContain('## Round 1');
    expect(md).toContain('Your interjection');
    expect(md).toContain('The Analyst');
    expect(md).toContain('Measure first.');
    expect(md).toContain('Shared from Arena Debate');
  });

  it('normalizes malformed rounds instead of printing NaN/undefined', () => {
    const md = formatDebateExport({
      originalPrompt: 'Q',
      challengedAgentName: 'The Pragmatist',
      rounds: [
        null as unknown as DebateExportRound,
        { roundNumber: Number.NaN, reactions: [] },
        {
          roundNumber: 0,
          reactions: [
            { agentName: '  ', content: '   ', stance: '' },
          ],
        },
      ],
    });
    expect(md).toContain('## Round 1');
    expect(md).toContain('## Round 2');
    expect(md).not.toContain('NaN');
    expect(md).not.toContain('undefined');
    expect(md).toContain('_(No reactions in this round.)_');
    expect(md).toContain('Mind');
    expect(md).toContain('_(empty)_');
  });

  it('skips null reactions without losing later content', () => {
    const md = formatDebateExport({
      originalPrompt: 'Q',
      challengedAgentName: 'The Pragmatist',
      rounds: [
        {
          roundNumber: 1,
          reactions: [
            null as unknown as DebateExportRound['reactions'][number],
            { agentName: 'The Analyst', content: 'Measure first.', stance: 'pushback' },
          ],
        },
      ],
    });
    expect(md).toContain('The Analyst');
    expect(md).toContain('Measure first.');
    expect(md).not.toContain('(empty)');
  });

  it('tolerates non-array rounds/reactions and numeric-string round numbers', () => {
    const md = formatDebateExport({
      originalPrompt: 'Q',
      challengedAgentName: 'The Pragmatist',
      rounds: [
        { roundNumber: '2', reactions: { not: 'an array' } } as unknown as DebateExportRound,
        { roundNumber: '3', reactions: [] },
      ],
    });
    expect(md).toContain('## Round 2');
    expect(md).toContain('## Round 3');
    expect(md).not.toContain('NaN');
    expect(md).not.toContain('undefined');
  });
});

describe('formatDebateReactionCopy', () => {
  it('attributes a reaction with stance and optional context', () => {
    const md = formatDebateReactionCopy({
      agentName: 'The Analyst',
      content: 'Measure first.',
      stance: 'pushback',
      originalPrompt: 'Is this fair?',
      roundNumber: 2,
      includeQuestion: true,
    });
    expect(md).toContain('**Question:** Is this fair?');
    expect(md).toContain('**Round 2**');
    expect(md).toContain('**The Analyst** (pushback)');
    expect(md).toContain('Measure first.');
  });

  it('returns empty for blank content', () => {
    expect(formatDebateReactionCopy({ content: '  ' })).toBe('');
  });
});

describe('formatDebateInterjectionCopy', () => {
  it('includes round when provided', () => {
    expect(formatDebateInterjectionCopy({ content: 'But latency?', roundNumber: 1 })).toContain(
      'Round 1 — You',
    );
    expect(formatDebateInterjectionCopy({ content: 'But latency?', roundNumber: 1 })).toContain(
      'But latency?',
    );
  });

  it('returns plain body without round', () => {
    expect(formatDebateInterjectionCopy({ content: '  Hello  ' })).toBe('Hello\n');
  });
});

describe('formatDebateChallengedCopy', () => {
  it('formats challenged take with assumption', () => {
    const md = formatDebateChallengedCopy({
      agentName: 'The Pragmatist',
      content: 'Ship the smallest honest slice.',
      keyAssumption: 'Users want speed over polish.',
      originalPrompt: 'Should we launch?',
      includeQuestion: true,
    });
    expect(md).toContain('Should we launch?');
    expect(md).toContain('The Pragmatist');
    expect(md).toContain('challenged');
    expect(md).toContain('Ship the smallest honest slice.');
    expect(md).toContain('Key assumption');
  });

  it('falls back to one-liner when verdict empty', () => {
    const md = formatDebateChallengedCopy({
      agentName: 'Marcus',
      content: '',
      oneLiner: 'Ship it.',
    });
    expect(md).toContain('Ship it.');
  });
});

describe('formatDiscussJsonExport', () => {
  it('returns a machine-readable thread with trimmed messages', () => {
    const json = formatDiscussJsonExport({
      agentName: 'The Analyst',
      originalPrompt: 'Should I ship today?',
      messages: [
        { role: 'user', content: '  What is the risk?  ' },
        { role: 'agent', content: 'Ship the smallest honest slice.' },
        { role: 'agent', content: '   ' },
      ],
      exportedAt: '2026-08-13T00:00:00.000Z',
    });
    const data = JSON.parse(json) as Record<string, unknown>;
    expect(data.export_type).toBe('discuss_thread');
    expect(data.exported_at).toBe('2026-08-13T00:00:00.000Z');
    expect(data.agent_name).toBe('The Analyst');
    expect(data.original_prompt).toBe('Should I ship today?');
    expect(data.message_count).toBe(2);
    expect((data.messages as Array<{ role: string; content: string }>)[0]).toEqual({
      role: 'user',
      content: 'What is the risk?',
    });
  });

  it('normalizes blank names/prompts and empty histories', () => {
    const data = JSON.parse(
      formatDiscussJsonExport({
        agentName: '  ',
        originalPrompt: '   ',
        messages: [null as unknown as ThreadMessage],
        exportedAt: '2026-08-13T00:00:00.000Z',
      }),
    ) as { agent_name: string; original_prompt: string; message_count: number };
    expect(data.agent_name).toBe('Arena mind');
    expect(data.original_prompt).toBe('(no prompt)');
    expect(data.message_count).toBe(0);
  });

  it('degrades non-array messages and non-string scalars instead of throwing', () => {
    const data = JSON.parse(
      formatDiscussJsonExport({
        agentName: 42 as unknown as string,
        originalPrompt: null as unknown as string,
        messages: [
          { role: 'user', content: 7 } as unknown as ThreadMessage,
          { role: 'agent', content: null as unknown as string },
        ],
        exportedAt: '2026-08-13T00:00:00.000Z',
      }),
    ) as { agent_name: string; original_prompt: string; message_count: number };
    expect(data.agent_name).toBe('Arena mind');
    expect(data.original_prompt).toBe('(no prompt)');
    expect(data.message_count).toBe(0);
  });

  it('treats non-array messages as an empty thread', () => {
    const data = JSON.parse(
      formatDiscussJsonExport({
        agentName: 'The Analyst',
        originalPrompt: 'Q',
        messages: { not: 'an array' } as unknown as ThreadMessage[],
        exportedAt: '2026-08-13T00:00:00.000Z',
      }),
    ) as { message_count: number; messages: unknown[] };
    expect(data.message_count).toBe(0);
    expect(data.messages).toEqual([]);
  });
});

describe('formatDebateJsonExport', () => {
  it('exports challenged take and rounds as structured data', () => {
    const json = formatDebateJsonExport({
      originalPrompt: 'Is this fair?',
      challengedAgentName: 'The Pragmatist',
      challengedOneLiner: 'Ship it.',
      challengedVerdict: 'The smallest honest slice is enough.',
      challengedKeyAssumption: 'Users want speed over polish.',
      rounds: [
        {
          roundNumber: 1,
          userInterjection: 'But latency?',
          reactions: [
            { agentName: 'The Analyst', content: 'Measure first.', stance: 'pushback' },
          ],
        },
      ],
      exportedAt: '2026-08-13T00:00:00.000Z',
    });
    const data = JSON.parse(json) as Record<string, unknown>;
    expect(data.export_type).toBe('debate_transcript');
    expect(data.exported_at).toBe('2026-08-13T00:00:00.000Z');
    expect(data.question).toBe('Is this fair?');
    expect(data.challenged_agent_name).toBe('The Pragmatist');
    expect(data.challenged_verdict).toBe('The smallest honest slice is enough.');
    expect(data.round_count).toBe(1);
    const round = (data.rounds as Array<Record<string, unknown>>)[0];
    expect(round.round_number).toBe(1);
    expect(round.user_interjection).toBe('But latency?');
    expect(round.reaction_count).toBe(1);
    expect((round.reactions as Array<Record<string, unknown>>)[0]).toEqual({
      agent_name: 'The Analyst',
      stance: 'pushback',
      content: 'Measure first.',
    });
  });

  it('normalizes malformed rounds and keeps blank reactions as null', () => {
    const data = JSON.parse(
      formatDebateJsonExport({
        originalPrompt: 'Q',
        challengedAgentName: '',
        rounds: [
          null as unknown as DebateExportRound,
          { roundNumber: Number.NaN, reactions: [] },
          {
            roundNumber: 0,
            reactions: [
              { agentName: '  ', content: '   ', stance: '' },
              { agentName: 'The Analyst', content: 'Measure first.', stance: 'pushback' },
            ],
          },
        ],
        exportedAt: '2026-08-13T00:00:00.000Z',
      }),
    ) as {
      challenged_agent_name: string;
      rounds: Array<{ round_number: number; reaction_count: number; reactions: unknown[] }>;
    };
    expect(data.challenged_agent_name).toBe('Challenged mind');
    expect(data.rounds.map((round) => round.round_number)).toEqual([1, 2]);
    expect(data.rounds[1].reaction_count).toBe(2);
    expect(data.rounds[1].reactions[0]).toEqual({
      agent_name: 'Mind',
      stance: null,
      content: null,
    });
    expect(data.rounds[1].reactions[1]).toEqual({
      agent_name: 'The Analyst',
      stance: 'pushback',
      content: 'Measure first.',
    });
  });

  it('tolerates non-array rounds/reactions and numeric-string round numbers', () => {
    const data = JSON.parse(
      formatDebateJsonExport({
        originalPrompt: 99 as unknown as string,
        challengedAgentName: null as unknown as string,
        challengedOneLiner: 42 as unknown as string,
        rounds: [
          { roundNumber: '2', reactions: { not: 'an array' } } as unknown as DebateExportRound,
          {
            roundNumber: '3',
            reactions: [
              {
                agentName: 7 as unknown as string,
                content: 9 as unknown as string,
                stance: null,
              },
            ],
          } as unknown as DebateExportRound,
        ],
        exportedAt: '2026-08-13T00:00:00.000Z',
      }),
    ) as {
      question: string;
      challenged_agent_name: string;
      challenged_one_liner: string | null;
      rounds: Array<{
        round_number: number;
        reaction_count: number;
        reactions: Array<{ agent_name: string; stance: string | null; content: string | null }>;
      }>;
    };
    expect(data.question).toBe('(no prompt)');
    expect(data.challenged_agent_name).toBe('Challenged mind');
    expect(data.challenged_one_liner).toBeNull();
    expect(data.rounds.map((round) => round.round_number)).toEqual([2, 3]);
    expect(data.rounds[0].reaction_count).toBe(0);
    expect(data.rounds[1].reactions[0]).toEqual({
      agent_name: 'Mind',
      stance: null,
      content: null,
    });
  });
});
