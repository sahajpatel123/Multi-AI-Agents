import { describe, expect, it } from 'vitest';
import { formatDebateExport, formatDiscussExport } from './threadExport';

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
});
