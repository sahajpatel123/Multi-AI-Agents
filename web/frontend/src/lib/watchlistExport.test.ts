import { describe, expect, it } from 'vitest';
import {
  formatWatchlistExport,
  formatWatchlistCsvExport,
  formatWatchlistItemCopy,
  formatWatchlistJsonExport,
  formatWatchlistLatestResultCopy,
  formatWatchlistQuestionCopy,
  formatWatchlistResultsDigest,
} from './watchlistExport';

describe('formatWatchlistExport', () => {
  it('formats active and paused items with cadence labels', () => {
    const md = formatWatchlistExport({
      activeCount: 1,
      activeCap: 10,
      items: [
        {
          question: 'Will rates cut this quarter?',
          intervalHours: 24,
          isActive: true,
          runCount: 3,
          lastRunAt: '2026-07-01T12:00:00.000Z',
          nextRunAt: '2026-07-02T12:00:00.000Z',
          latestTitle: 'Macro scan',
          latestScore: 81,
          expertiseLevel: 'expert',
          expertiseDomain: 'macro',
        },
        {
          question: 'Paused topic',
          intervalHours: 168,
          isActive: false,
          runCount: 0,
        },
      ],
    });

    expect(md).toContain('# Agent Watchlist');
    expect(md).toContain('**Active:** 1 / 10');
    expect(md).toContain('## 1. Will rates cut this quarter?');
    expect(md).toContain('**Status:** Active');
    expect(md).toContain('**Cadence:** Daily (24h)');
    expect(md).toContain('**Latest:** Macro scan (81/100)');
    expect(md).toContain('**Expertise:** expert · macro');
    expect(md).toContain('## 2. Paused topic');
    expect(md).toContain('**Status:** Paused');
    expect(md).toContain('Weekly (7d)');
    expect(md).toMatch(/Shared from Arena Agent Watchlist/);
  });

  it('notes empty filtered views and filter labels', () => {
    const md = formatWatchlistExport({
      items: [],
      filterNote: 'status: paused',
    });
    expect(md).toMatch(/No watched tasks/i);
    expect(md).toContain('_Filtered view: status: paused_');
  });

  it('labels 3-day cadence', () => {
    const md = formatWatchlistExport({
      items: [{ question: 'X', intervalHours: 72, isActive: true }],
    });
    expect(md).toContain('Every 3 days');
  });
});

describe('formatWatchlistItemCopy', () => {
  it('snapshots one watch as markdown', () => {
    const md = formatWatchlistItemCopy({
      question: 'Will rates cut this quarter?',
      intervalHours: 24,
      isActive: true,
      runCount: 3,
      lastRunAt: '2026-07-01T12:00:00.000Z',
      nextRunAt: '2026-07-02T12:00:00.000Z',
      latestTitle: 'Macro scan',
      latestScore: 81,
      expertiseLevel: 'expert',
      expertiseDomain: 'macro',
    });
    expect(md).toContain('# Will rates cut this quarter?');
    expect(md).toContain('**Status:** Active');
    expect(md).toContain('**Cadence:** Daily (24h)');
    expect(md).toContain('**Latest:** Macro scan (81/100)');
    expect(md).toContain('Shared from Arena Agent Watchlist');
  });

  it('returns empty for blank question', () => {
    expect(formatWatchlistItemCopy({ question: '  ', intervalHours: 24, isActive: true })).toBe(
      '',
    );
  });
});

describe('formatWatchlistQuestionCopy', () => {
  it('returns trimmed question with trailing newline', () => {
    expect(formatWatchlistQuestionCopy('  Ship today?  ')).toBe('Ship today?\n');
  });

  it('returns empty for blank', () => {
    expect(formatWatchlistQuestionCopy('   ')).toBe('');
  });
});

describe('formatWatchlistLatestResultCopy', () => {
  it('formats a completed result with metadata and answer', () => {
    const md = formatWatchlistLatestResultCopy({
      question: 'How is the Indian IPO market evolving?',
      title: 'IPO market mid-year recap',
      finalAnswer: 'IPO momentum is strong with stable retail participation.',
      finalScore: 82,
      finalConfidence: 0.72,
      createdAt: '2026-07-18T10:00:00Z',
      taskId: 'task-1',
    });
    expect(md).toContain('# How is the Indian IPO market evolving?');
    expect(md).toContain('**Latest run:** IPO market mid-year recap');
    expect(md).toContain('**Score:** 82/100 · **Confidence:** 72%');
    expect(md).toContain('**Task:** `task-1`');
    expect(md).toContain('IPO momentum is strong');
    expect(md).toContain('Shared from Arena Agent Watchlist');
  });

  it('flattens structured Agent answer JSON before copying', () => {
    const md = formatWatchlistLatestResultCopy({
      question: 'Will rates cut this quarter?',
      finalAnswer: JSON.stringify({
        sentences: [
          { text: 'First sentence', confidence: 'high' },
          { text: 'Second sentence', confidence: 'medium' },
        ],
      }),
      finalScore: 75,
    });
    expect(md).toContain('First sentence');
    expect(md).toContain('Second sentence');
    expect(md).not.toContain('"sentences"');
  });

  it('returns empty when question or answer is missing', () => {
    expect(
      formatWatchlistLatestResultCopy({
        question: '  ',
        finalAnswer: 'Answer',
      }),
    ).toBe('');
    expect(
      formatWatchlistLatestResultCopy({
        question: 'Question',
        finalAnswer: '   ',
      }),
    ).toBe('');
  });
});

describe('formatWatchlistResultsDigest', () => {
  const answered = {
    question: 'How is the Indian IPO market evolving?',
    title: 'IPO market mid-year recap',
    finalAnswer: 'IPO momentum is strong with stable retail participation.',
    finalScore: 82,
    createdAt: '2026-07-18T10:00:00Z',
    taskId: 'task-1',
    isComplete: true,
  };

  it('composes every readable completed result into one digest', () => {
    const md = formatWatchlistResultsDigest({
      items: [
        answered,
        {
          question: 'Will rates cut this quarter?',
          finalAnswer: JSON.stringify({
            sentences: [{ text: 'First sentence', confidence: 'high' }],
          }),
          finalScore: 75,
          isComplete: true,
        },
      ],
      activeCount: 2,
      activeCap: 10,
      filterNote: 'sort: next_soon',
    });

    expect(md).toContain('# Agent Watchlist — Results Digest');
    expect(md).toContain('**Active:** 2 / 10');
    expect(md).toContain('_Filtered view: sort: next_soon_');
    expect(md).toContain('## 1. How is the Indian IPO market evolving?');
    expect(md).toContain('**Latest run:** IPO market mid-year recap');
    expect(md).toContain('**Score:** 82/100');
    expect(md).toContain('**Task:** `task-1`');
    expect(md).toContain('IPO momentum is strong');
    expect(md).toContain('## 2. Will rates cut this quarter?');
    expect(md).toContain('First sentence');
    expect(md).not.toContain('"sentences"');
    expect(md).toMatch(/Shared from Arena Agent Watchlist/);
  });

  it('skips watches whose latest result is missing, unreadable, or unconfirmed', () => {
    const md = formatWatchlistResultsDigest({
      items: [
        { question: 'No answer yet', finalAnswer: null },
        { question: '  ', finalAnswer: 'orphaned answer' },
        { question: 'Still running', finalAnswer: 'partial draft', isComplete: false },
        answered,
      ],
    });
    expect(md).toContain('## 1. How is the Indian IPO market evolving?');
    expect(md).not.toContain('No answer yet');
    expect(md).not.toContain('orphaned answer');
    expect(md).not.toContain('Still running');
    expect(md).not.toContain('partial draft');
  });

  it('returns empty when every result is in-flight or unreadable', () => {
    expect(
      formatWatchlistResultsDigest({
        items: [
          { question: 'Pending', finalAnswer: '   ', isComplete: true },
          { question: 'Running', finalAnswer: 'draft', isComplete: false },
          { question: '  ', finalAnswer: 'answer', isComplete: true },
        ],
      }),
    ).toBe('');
  });

  it('keeps user-controlled questions and titles on one heading line', () => {
    const md = formatWatchlistResultsDigest({
      items: [
        {
          question: '# Fake heading\n\n**Injected:** yes',
          title: 'Run\nsummary',
          finalAnswer: 'Real answer.',
          isComplete: true,
        },
      ],
    });

    expect(md).toContain('## 1. \\# Fake heading **Injected:** yes');
    expect(md).toContain('**Latest run:** Run summary');
    expect(md).not.toMatch(/\n## Fake heading/);
    expect(md).not.toMatch(/\n\*\*Injected:\*\*/);
  });
});

describe('formatWatchlistCsvExport', () => {
  const WATCHLIST_CSV_HEADER =
    '"question","status","cadenceHours","runs","lastRunAt","nextRunAt","latestTitle","latestScore","expertiseLevel","expertiseDomain"';
  const csvLines = (csv: string) =>
    csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);

  it('renders one row per watch with a stable header schema', () => {
    const csv = formatWatchlistCsvExport([
      {
        question: 'How is the Indian IPO market evolving?',
        intervalHours: 24,
        isActive: true,
        runCount: 3,
        lastRunAt: '2026-07-18T10:00:00Z',
        nextRunAt: '2026-07-19T10:00:00Z',
        latestTitle: 'IPO market mid-year recap',
        latestScore: 82,
        expertiseLevel: 'expert',
        expertiseDomain: 'finance',
      },
      {
        question: 'Will the monsoon affect Indian agriculture exports?',
        intervalHours: 168,
        isActive: false,
        runCount: 0,
      },
    ]);

    const lines = csvLines(csv);
    expect(lines[0]).toBe(WATCHLIST_CSV_HEADER);
    expect(lines[1]).toBe(
      '"How is the Indian IPO market evolving?","active","24","3","2026-07-18T10:00:00Z","2026-07-19T10:00:00Z","IPO market mid-year recap","82","expert","finance"',
    );
    expect(lines[2]).toBe(
      '"Will the monsoon affect Indian agriculture exports?","paused","168","0","","","","","",""',
    );
    expect(lines).toHaveLength(3);
  });

  it('keeps next run empty for paused watches', () => {
    const csv = formatWatchlistCsvExport([
      {
        question: 'Paused topic',
        intervalHours: 72,
        isActive: false,
        nextRunAt: '2026-07-20T10:00:00Z',
      },
    ]);
    expect(csv).toContain('"Paused topic","paused","72","","","","","","",""');
  });

  it('quotes commas, quotes, and newlines inside cells', () => {
    const csv = formatWatchlistCsvExport([
      {
        question: 'Rates, tariffs, and "supply"',
        intervalHours: 24,
        isActive: true,
        latestTitle: 'Line one\nLine two',
      },
    ]);
    expect(csv).toContain('"Rates, tariffs, and ""supply"""');
    expect(csv).toContain('"Line one\nLine two"');
  });

  it('neutralizes spreadsheet formula injection in every cell', () => {
    const csv = formatWatchlistCsvExport([
      {
        question: '=HYPERLINK("https://evil.example")',
        intervalHours: 24,
        isActive: true,
        latestTitle: '+SUM(1,1)',
        lastRunAt: ' =NOW()',
        nextRunAt: '\t+EVAL("x")',
        latestScore: -5,
        expertiseLevel: '@cmd',
        expertiseDomain: '-hidden',
      },
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""https://evil.example"")"`);
    expect(csv).toContain(`"'+SUM(1,1)"`);
    expect(csv).toContain(`"' =NOW()"`);
    expect(csv).toContain(`"'\t+EVAL(""x"")"`);
    expect(csv).toContain(`"'@cmd"`);
    expect(csv).toContain(`"'-hidden"`);
  });

  it('starts with a UTF-8 BOM and uses CRLF record separators', () => {
    const csv = formatWatchlistCsvExport([
      {
        question: 'How is the monsoon shaping up?',
        intervalHours: 24,
        isActive: true,
      },
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.slice(1)).toMatch(/\r\n/);
    expect(csv.slice(1).endsWith('\r\n')).toBe(true);
    expect(csvLines(csv)).toHaveLength(2);
  });

  it('returns just the header row for an empty view', () => {
    const csv = formatWatchlistCsvExport([]);
    expect(csvLines(csv)).toEqual([WATCHLIST_CSV_HEADER]);
  });

  it('falls back to a placeholder question and blank numeric cells', () => {
    const csv = formatWatchlistCsvExport([
      { question: '   ', intervalHours: NaN, isActive: true },
    ]);
    expect(csv).toContain('"(untitled question)","active","","","","","","","",""');
  });
});

describe('formatWatchlistJsonExport', () => {
  it('renders a self-describing JSON payload with snake_case fields', () => {
    const json = formatWatchlistJsonExport({
      items: [
        {
          question: 'How is the Indian IPO market evolving?',
          intervalHours: 24,
          isActive: true,
          runCount: 3,
          lastRunAt: '2026-07-18T10:00:00Z',
          nextRunAt: '2026-07-19T10:00:00Z',
          latestTitle: 'IPO market mid-year recap',
          latestScore: 82,
          expertiseLevel: 'expert',
          expertiseDomain: 'finance',
        },
        {
          question: 'Will the monsoon affect Indian agriculture exports?',
          intervalHours: 168,
          isActive: false,
          runCount: 0,
          nextRunAt: '2026-07-20T10:00:00Z',
        },
      ],
      activeCount: 1,
      activeCap: 10,
      filterNote: 'status: active',
      exportedAt: '2026-08-14T00:00:00.000Z',
    });

    const parsed = JSON.parse(json) as {
      exported_from: string;
      exported_at: string;
      active_count: number;
      active_cap: number;
      filter_note: string;
      count: number;
      items: Array<Record<string, unknown>>;
    };
    expect(parsed.exported_from).toBe('arena');
    expect(parsed.exported_at).toBe('2026-08-14T00:00:00.000Z');
    expect(parsed.active_count).toBe(1);
    expect(parsed.active_cap).toBe(10);
    expect(parsed.filter_note).toBe('status: active');
    expect(parsed.count).toBe(2);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toEqual({
      question: 'How is the Indian IPO market evolving?',
      status: 'active',
      cadence_hours: 24,
      runs: 3,
      last_run_at: '2026-07-18T10:00:00Z',
      next_run_at: '2026-07-19T10:00:00Z',
      latest_title: 'IPO market mid-year recap',
      latest_score: 82,
      expertise_level: 'expert',
      expertise_domain: 'finance',
    });
    expect(parsed.items[1]).toMatchObject({
      status: 'paused',
      next_run_at: null,
    });
    expect(json.trimEnd()).toMatch(/^\{/);
    expect(json.endsWith('\n')).toBe(true);
  });

  it('normalizes blank questions, non-finite numbers, and empty metadata', () => {
    const parsed = JSON.parse(
      formatWatchlistJsonExport({
        items: [
          {
            question: '   ',
            intervalHours: NaN,
            isActive: true,
            runCount: Infinity,
            latestScore: -5,
          },
        ],
        exportedAt: '2026-08-14T00:00:00.000Z',
      }),
    ) as {
      exported_from: string;
      active_count: number | null;
      active_cap: number | null;
      filter_note: string | null;
      count: number;
      items: Array<Record<string, unknown>>;
    };

    expect(parsed.exported_from).toBe('arena');
    expect(parsed.active_count).toBeNull();
    expect(parsed.active_cap).toBeNull();
    expect(parsed.filter_note).toBeNull();
    expect(parsed.count).toBe(1);
    expect(parsed.items[0]).toEqual({
      question: '(untitled question)',
      status: 'active',
      cadence_hours: null,
      runs: null,
      last_run_at: null,
      next_run_at: null,
      latest_title: null,
      latest_score: -5,
      expertise_level: null,
      expertise_domain: null,
    });
  });
});
