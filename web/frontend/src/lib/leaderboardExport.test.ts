import { describe, expect, it } from 'vitest';
import { formatLeaderboardExport } from './leaderboardExport';

describe('formatLeaderboardExport', () => {
  it('formats ranked rows as a markdown table', () => {
    const md = formatLeaderboardExport({
      totalPrompts: 4,
      rows: [
        { name: 'The Analyst', wins: 2, percentage: 50 },
        { name: 'The Pragmatist', wins: 1, percentage: 25 },
        { name: 'The Philosopher', wins: 1, percentage: 25 },
      ],
    });
    expect(md).toContain('# Arena Agent Leaderboard');
    expect(md).toContain('4');
    expect(md).toContain('The Analyst');
    expect(md).toContain('| Rank | Mind | Wins | Share |');
    expect(md).toContain('Shared from Arena');
  });

  it('includes session prompt transcript when provided', () => {
    const md = formatLeaderboardExport({
      totalPrompts: 1,
      rows: [{ name: 'The Analyst', wins: 1, percentage: 100 }],
      turns: [
        {
          prompt: 'Should we expand?',
          winnerName: 'The Analyst',
          oneLiner: 'Stress-test the runway first.',
        },
      ],
    });
    expect(md).toContain('## Session prompts');
    expect(md).toContain('Should we expand?');
    expect(md).toContain('**Winner:** The Analyst');
    expect(md).toContain('Stress-test the runway first.');
  });

  it('prefers full winner take over one-liner in export', () => {
    const md = formatLeaderboardExport({
      totalPrompts: 1,
      rows: [{ name: 'The Analyst', wins: 1, percentage: 100 }],
      turns: [
        {
          prompt: 'Ship today?',
          winnerName: 'The Analyst',
          oneLiner: 'Not yet.',
          fullTake: 'Not yet.\n\nStage a canary and define a kill switch first.',
        },
      ],
    });
    expect(md).toContain('Stage a canary');
    expect(md).not.toMatch(/^> Not yet\.$/m);
  });

  it('handles empty sessions honestly', () => {
    const md = formatLeaderboardExport({ totalPrompts: 0, rows: [] });
    expect(md).toContain('No prompts scored');
    expect(md).not.toContain('## Session prompts');
  });
});
