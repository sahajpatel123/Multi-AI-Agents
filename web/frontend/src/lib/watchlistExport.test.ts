import { describe, expect, it } from 'vitest';
import {
  formatWatchlistExport,
  formatWatchlistCsvExport,
  formatWatchlistItemCopy,
  formatWatchlistQuestionCopy,
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
