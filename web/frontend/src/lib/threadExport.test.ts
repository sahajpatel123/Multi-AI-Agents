import { describe, expect, it } from 'vitest';
import {
  formatDebateChallengedCopy,
  formatDebateExport,
  formatDebateInterjectionCopy,
  formatDebateReactionCopy,
  formatDiscussExport,
  formatDiscussMessageCopy,
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
