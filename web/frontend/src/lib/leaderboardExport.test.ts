import { describe, expect, it } from 'vitest';
import { formatLeaderboardCsv, formatLeaderboardExport } from './leaderboardExport';

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

describe('formatLeaderboardCsv', () => {
  it('exports ranked minds and prompt rows in one spreadsheet-friendly schema', () => {
    const csv = formatLeaderboardCsv({
      rows: [
        { name: 'The Pragmatist', wins: 1, percentage: 25 },
        { name: 'The Analyst', wins: 2, percentage: 50 },
      ],
      turns: [
        {
          prompt: 'Should we expand, now?',
          winnerName: 'The Analyst',
          oneLiner: 'Stress-test the runway first.',
        },
      ],
    });

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"record_type","rank","mind","wins","share_percent"');
    expect(csv).toContain('"ranking","1","The Analyst","2","50"');
    expect(csv).toContain('"ranking","2","The Pragmatist","1","25"');
    expect(csv).toContain('"prompt","","","","","Should we expand, now?","The Analyst","Stress-test the runway first."');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('quotes multiline cells and neutralizes spreadsheet formula triggers', () => {
    const csv = formatLeaderboardCsv({
      rows: [{ name: ' =HYPERLINK("https://evil.test")', wins: 1, percentage: 100 }],
      turns: [
        {
          prompt: ' =1+1',
          winnerName: 'The "Analyst"',
          fullTake: 'First line\nSecond line',
        },
      ],
    });

    expect(csv).toContain('"ranking","1","\'=HYPERLINK(""https://evil.test"")","1","100"');
    expect(csv).toContain('"prompt","","","","","\'=1+1","The ""Analyst""","First line\nSecond line"');
  });
});
