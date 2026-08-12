import { describe, expect, it } from 'vitest';
import {
  formatArenaRecentItemCopy,
  formatArenaRecentPromptCopy,
  formatArenaRecentsCsvExport,
  formatArenaRecentsExport,
  formatArenaRecentsJsonExport,
} from './arenaRecentsExport';

describe('formatArenaRecentsExport', () => {
  it('formats filtered recents with titles and winners', () => {
    const md = formatArenaRecentsExport({
      totalCount: 3,
      filterNote: 'category Question',
      items: [
        {
          title: 'Ship plan',
          prompt: 'Should we ship today?',
          category: 'question',
          winnerName: 'The Analyst',
          timestamp: '2026-07-01T12:00:00Z',
          turnId: 'turn-1',
        },
        {
          prompt: 'List risks of launching without QA',
          category: 'task',
          winnerName: 'The Skeptic',
        },
      ],
    });

    expect(md).toContain('# Arena · Recents');
    expect(md).toContain('**2** of **3** turns in this view');
    expect(md).toContain('_Filtered view: category Question_');
    expect(md).toContain('## 1. Ship plan');
    expect(md).toContain('**Prompt:** Should we ship today?');
    expect(md).toContain('Question · Winner: The Analyst');
    expect(md).toContain('Turn `turn-1`');
    expect(md).toContain('## 2. List risks of launching without QA');
    expect(md).toMatch(/Shared from Arena recents/);
  });

  it('handles empty filtered views honestly', () => {
    const md = formatArenaRecentsExport({
      totalCount: 4,
      filterNote: 'search “quantum”',
      items: [],
    });
    expect(md).toMatch(/No recent turns match this filter/i);
    expect(md).toContain('_Filtered view: search “quantum”_');
  });

  it('handles empty recents', () => {
    const md = formatArenaRecentsExport({ items: [] });
    expect(md).toMatch(/No recent Arena turns yet/i);
  });
});

describe('formatArenaRecentItemCopy', () => {
  it('snapshots one recent turn', () => {
    const md = formatArenaRecentItemCopy({
      title: 'Ship plan',
      prompt: 'Should we ship today?',
      category: 'question',
      winnerName: 'The Analyst',
      timestamp: '2026-07-01T12:00:00Z',
      turnId: 'turn-1',
    });
    expect(md).toContain('# Ship plan');
    expect(md).toContain('**Prompt:** Should we ship today?');
    expect(md).toContain('Winner: The Analyst');
    expect(md).toContain('Turn `turn-1`');
    expect(md).toContain('Shared from Arena recents');
  });

  it('returns empty when both title and prompt blank', () => {
    expect(formatArenaRecentItemCopy({ title: '  ', prompt: '' })).toBe('');
  });
});

describe('formatArenaRecentsJsonExport', () => {
  it('exports filtered recents with structured metadata', () => {
    const json = formatArenaRecentsJsonExport({
      totalCount: 3,
      filterNote: 'category Question',
      items: [
        {
          title: 'Ship plan',
          prompt: 'Should we ship today?',
          category: 'question',
          winnerName: 'The Analyst',
          timestamp: '2026-07-01T12:00:00Z',
          turnId: 'turn-1',
        },
        {
          prompt: 'List risks of launching without QA',
          category: 'task',
          winnerName: 'The Skeptic',
        },
      ],
    });

    const parsed = JSON.parse(json) as {
      exported_from: string;
      total_recents: number;
      filter_note: string;
      count: number;
      items: Array<Record<string, unknown>>;
    };
    expect(parsed.exported_from).toBe('arena');
    expect(parsed.total_recents).toBe(3);
    expect(parsed.filter_note).toBe('category Question');
    expect(parsed.count).toBe(2);
    expect(parsed.items[0]).toEqual({
      title: 'Ship plan',
      prompt: 'Should we ship today?',
      category: 'Question',
      winnerName: 'The Analyst',
      timestamp: '2026-07-01T12:00:00Z',
      turnId: 'turn-1',
    });
    expect(parsed.items[1]).toMatchObject({
      title: 'List risks of launching without QA',
      category: 'Task',
    });
  });

  it('handles an empty filtered view honestly', () => {
    const parsed = JSON.parse(
      formatArenaRecentsJsonExport({
        totalCount: 4,
        filterNote: 'search “quantum”',
        items: [],
      }),
    ) as { total_recents: number; filter_note: string; count: number };
    expect(parsed.total_recents).toBe(4);
    expect(parsed.filter_note).toBe('search “quantum”');
    expect(parsed.count).toBe(0);
  });
});

describe('formatArenaRecentsCsvExport', () => {
  it('quotes headers and values so prompts cannot break columns', () => {
    const csv = formatArenaRecentsCsvExport({
      items: [
        {
          title: 'Ship, plan',
          prompt: 'Should we "ship"?\nToday',
          category: 'question',
          winnerName: 'The Analyst',
          timestamp: '2026-07-01T12:00:00Z',
          turnId: 'turn-1',
        },
      ],
    });

    expect(csv.split('\n')[0]).toBe(
      '"title","prompt","category","winnerName","timestamp","turnId"',
    );
    expect(csv).toContain('"Ship, plan"');
    expect(csv).toContain('"Should we ""ship""?\nToday"');
    expect(csv.trimEnd().endsWith('"turn-1"')).toBe(true);
  });

  it('neutralizes spreadsheet formula injection, including hidden leading whitespace', () => {
    const csv = formatArenaRecentsCsvExport({
      items: [
        {
          title: '=HYPERLINK("https://evil.example")',
          prompt: '=SUM(A1:A9)',
          category: '+1+1',
          winnerName: '@cmd|/c calc',
          timestamp: ' =NOW()',
          turnId: '+EVAL("x")',
        },
      ],
    });

    expect(csv).toContain(`"'=HYPERLINK(""https://evil.example"")"`);
    expect(csv).toContain(`"'=SUM(A1:A9)"`);
    expect(csv).toContain(`"'+1+1"`);
    expect(csv).toContain(`"'@cmd|/c calc"`);
    expect(csv).toContain(`"' =NOW()"`);
    expect(csv).toContain(`"'+EVAL(""x"")"`);
  });

  it('leaves ordinary text unchanged', () => {
    const csv = formatArenaRecentsCsvExport({
      items: [
        {
          title: 'Ship plan',
          prompt: 'Should we ship today?',
          category: 'question',
          winnerName: 'The Analyst',
          timestamp: '2026-07-01T12:00:00Z',
          turnId: 'turn-1',
        },
      ],
    });
    expect(csv).toContain('"Ship plan"');
    expect(csv).toContain('"Should we ship today?"');
    expect(csv).toContain('"Question"');
    expect(csv).toContain('"The Analyst"');
  });

  it('emits only the header row for an empty export', () => {
    expect(formatArenaRecentsCsvExport({ items: [] })).toBe(
      '"title","prompt","category","winnerName","timestamp","turnId"\n',
    );
  });
});

describe('formatArenaRecentPromptCopy', () => {
  it('returns trimmed prompt with trailing newline', () => {
    expect(formatArenaRecentPromptCopy('  Ship today?  ')).toBe('Ship today?\n');
  });

  it('returns empty for blank', () => {
    expect(formatArenaRecentPromptCopy('   ')).toBe('');
  });
});
