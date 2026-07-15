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

  it('handles empty sessions honestly', () => {
    const md = formatLeaderboardExport({ totalPrompts: 0, rows: [] });
    expect(md).toContain('No prompts scored');
  });
});
