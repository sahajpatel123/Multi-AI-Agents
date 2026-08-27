import { describe, expect, it } from 'vitest';
import {
  formatAgentHistoryCsv,
  formatAgentHistoryExport,
  formatAgentHistoryItemCopy,
  formatAgentHistoryJson,
  formatAgentHistoryJsonl,
} from './agentHistoryExport';

describe('formatAgentHistoryExport', () => {
  it('formats tasks with scores, topics, and filter notes', () => {
    const md = formatAgentHistoryExport({
      totalCount: 5,
      filterNote: 'search: “rates”',
      items: [
        {
          title: 'Rate path scan',
          question: 'Will rates cut this quarter?',
          score: 84,
          confidence: 0.72,
          createdAt: '2026-07-01T12:00:00.000Z',
          topics: ['macro', 'fed'],
          taskId: 'task_abc',
          isLive: true,
        },
      ],
    });

    expect(md).toContain('# Agent research history');
    expect(md).toContain('**1** of **5** tasks in this view');
    expect(md).toContain('_Filtered view: search: “rates”_');
    expect(md).toContain('## 1. Rate path scan');
    expect(md).toContain('**Question:** Will rates cut this quarter?');
    expect(md).toContain('Score 84/100');
    expect(md).toContain('Confidence 72%');
    expect(md).toContain('Live');
    expect(md).toContain('**Topics:** macro, fed');
    expect(md).toContain('task_abc');
    expect(md).toMatch(/Shared from Arena Agent history/);
  });

  it('handles empty views and falls back to question as title', () => {
    expect(formatAgentHistoryExport({ items: [] })).toMatch(/No research tasks/i);
    const md = formatAgentHistoryExport({
      items: [{ question: 'What is enough?' }],
      totalCount: 1,
    });
    expect(md).toContain('## 1. What is enough?');
    expect(md).toContain('**1** task');
  });

  it('escapes hostile Markdown controls in history fields', () => {
    const md = formatAgentHistoryExport({
      totalCount: 1,
      filterNote: 'search "*star*"\n# hidden heading',
      items: [
        {
          title: '# Launch [plan](https://evil.example)',
          question: 'Line one\n# Heading\n- item\n= summary\n<script>alert(1)</script>',
          topics: ['*bold*', 'a|b'],
          taskId: 'task`\nnext',
        },
      ],
    });

    expect(md).toContain(
      '## 1. \\# Launch \\[plan\\]\\(https://evil.example\\)',
    );
    expect(md).toContain(
      '**Question:** Line one\n\\# Heading\n\\- item\n\\= summary\n\\<script\\>alert\\(1\\)\\</script\\>',
    );
    expect(md).toContain('- **Topics:** \\*bold\\*, a\\|b');
    expect(md).toContain('_Filtered view: search "\\*star\\*"\n\\# hidden heading_');
    expect(md).toContain('Task `task next`');
    expect(md).not.toContain('[plan](https://evil.example)');
  });
});

describe('formatAgentHistoryItemCopy', () => {
  it('snapshots one research task', () => {
    const md = formatAgentHistoryItemCopy({
      title: 'Rate path scan',
      question: 'Will rates cut this quarter?',
      score: 84,
      confidence: 0.72,
      createdAt: '2026-07-01T12:00:00.000Z',
      topics: ['macro', 'fed'],
      taskId: 'task_abc',
      isLive: true,
    });
    expect(md).toContain('# Rate path scan');
    expect(md).toContain('**Question:** Will rates cut this quarter?');
    expect(md).toContain('Score 84/100');
    expect(md).toContain('Confidence 72%');
    expect(md).toContain('Live');
    expect(md).toContain('**Topics:** macro, fed');
    expect(md).toContain('task_abc');
    expect(md).toContain('Shared from Arena Agent history');
  });

  it('returns empty when question and title blank', () => {
    expect(formatAgentHistoryItemCopy({ question: '  ', title: '' })).toBe('');
  });

  it('keeps copied questions and metadata as literal Markdown text', () => {
    const md = formatAgentHistoryItemCopy({
      title: 'A *careful* review',
      question: 'Check [this](https://evil.example)\n# not a heading',
      topics: ['<script>', 'a|b'],
      taskId: 'task`id',
    });

    expect(md).toContain('# A \\*careful\\* review');
    expect(md).toContain('**Question:** Check \\[this\\]\\(https://evil.example\\)\n\\# not a heading');
    expect(md).toContain('- **Topics:** \\<script\\>, a\\|b');
    expect(md).toContain('Task `taskid`');
  });
});

describe('formatAgentHistoryCsv', () => {
  const csvLines = (csv: string) =>
    csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);

  it('exports rows with escaped commas, quotes, and topic joins', () => {
    const csv = formatAgentHistoryCsv({
      items: [
        {
          title: 'Rates, 2026',
          question: 'Will rates cut? "maybe"',
          score: 84,
          confidence: 0.72,
          createdAt: '2026-07-01T12:00:00.000Z',
          topics: ['macro', 'fed'],
          taskId: 'task_abc',
          isLive: true,
          userFeedback: 'positive',
          orchestrationId: 'orch_1',
          watchlistItemId: 'watch_1',
        },
      ],
    });

    expect(csv).toContain(
      'task_id,title,question,score,confidence,user_feedback,created_at,is_live,topics,orchestration_id,watchlist_item_id',
    );
    expect(csv).toContain('"Rates, 2026"');
    expect(csv).toContain('"Will rates cut? ""maybe"""');
    expect(csv).toContain('task_abc,');
    expect(csv).toContain(',84,0.72,positive,');
    expect(csv).toContain(',true,macro; fed,orch_1,watch_1');
  });

  it('trims topic labels and ignores malformed runtime topic values', () => {
    const csv = formatAgentHistoryCsv({
      items: [
        {
          taskId: 'task_topics',
          question: 'How should topics be normalized?',
          topics: [' macro ', ' ', '\tfed', null as unknown as string, 42 as unknown as string],
        },
      ],
    });
    const row = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/)[1];
    expect(row.split(',')[8]).toBe('macro; fed');
  });

  it('starts with a UTF-8 BOM and uses CRLF record separators', () => {
    const csv = formatAgentHistoryCsv({
      items: [{ question: 'How is the Indian IPO market evolving?' }],
    });
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toMatch(/[^\r]\r\n$/);
  });

  it('neutralizes spreadsheet formula injection, including hidden leading whitespace', () => {
    const csv = formatAgentHistoryCsv({
      items: [
        {
          title: '=HYPERLINK("http://evil")',
          question: '+SUM(A1:A2)',
          taskId: '-task',
        },
        {
          title: '  =HYPERLINK("http://evil")',
          question: '\t+SUM(A1:A2)',
          taskId: '\r@task',
        },
      ],
    });

    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+SUM");
    expect(csv).toContain("'-task");
    expect(csv).toContain("'  =HYPERLINK");
    expect(csv).toContain("'\t+SUM");
    expect(csv).toContain("'\r@task");

    const empty = formatAgentHistoryCsv({ items: [] });
    expect(empty).toContain('task_id,title,question');
    expect(empty.endsWith('\r\n')).toBe(true);
  });

  it('keeps header and row layout stable', () => {
    const csv = formatAgentHistoryCsv({
      items: [{ taskId: 'task_1', question: 'Will rates cut this quarter?' }],
    });
    const lines = csvLines(csv);
    expect(lines[0]).toBe(
      'task_id,title,question,score,confidence,user_feedback,created_at,is_live,topics,orchestration_id,watchlist_item_id',
    );
    expect(lines).toHaveLength(2);
    expect(lines[1].split(',')).toHaveLength(11);
    expect(lines[1].split(',')[0]).toBe('task_1');
    expect(lines[1].split(',')[2]).toBe('Will rates cut this quarter?');
  });
});

describe('formatAgentHistoryJson', () => {
  it('exports a stable machine-readable payload', () => {
    const json = formatAgentHistoryJson({
      items: [
        {
          title: 'Rate path scan',
          question: 'Will rates cut this quarter?',
          score: 84,
          confidence: 0.72,
          createdAt: '2026-07-01T12:00:00.000Z',
          topics: ['macro'],
          taskId: 'task_abc',
          isLive: true,
          userFeedback: 'positive',
          orchestrationId: 'orch_1',
          watchlistItemId: 'watch_1',
        },
      ],
      totalCount: 3,
      filterNote: 'search: “rates”',
      exportedAt: '2026-07-01T12:00:00.000Z',
    });

    const parsed = JSON.parse(json) as {
      exported_at: string;
      total: number;
      filter_note: string;
      items: Array<Record<string, unknown>>;
    };
    expect(parsed.exported_at).toBe('2026-07-01T12:00:00.000Z');
    expect(parsed.total).toBe(3);
    expect(parsed.filter_note).toBe('search: “rates”');
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      task_id: 'task_abc',
      title: 'Rate path scan',
      question: 'Will rates cut this quarter?',
      score: 84,
      confidence: 0.72,
      user_feedback: 'positive',
      is_live: true,
      topics: ['macro'],
      orchestration_id: 'orch_1',
      watchlist_item_id: 'watch_1',
    });
    expect(json.trimEnd().endsWith('}')).toBe(true);
  });

  it('normalizes missing fields to empty/null and exports empty views', () => {
    const json = formatAgentHistoryJson({
      items: [{ question: '  ', taskId: 'task_empty' }],
      exportedAt: '2026-07-01T12:00:00.000Z',
    });
    const parsed = JSON.parse(json) as { items: Array<Record<string, unknown>> };
    expect(parsed.items[0]).toMatchObject({
      task_id: 'task_empty',
      title: '',
      score: null,
      confidence: null,
      user_feedback: null,
      is_live: false,
      topics: [],
      orchestration_id: null,
      watchlist_item_id: null,
    });
    expect(parsed.items[0].question).toBe('');
  });
});

describe('formatAgentHistoryJsonl', () => {
  it('writes one stable JSON object per filtered task', () => {
    const jsonl = formatAgentHistoryJsonl({
      items: [
        {
          title: 'Rate path scan',
          question: 'Will rates cut this quarter?',
          score: 84,
          confidence: 0.72,
          createdAt: '2026-07-01T12:00:00.000Z',
          topics: [' macro ', 'fed'],
          taskId: 'task_abc',
          isLive: true,
          userFeedback: 'positive',
          orchestrationId: 'orch_1',
          watchlistItemId: 'watch_1',
        },
        { taskId: 'task_empty', question: 'A second task' },
      ],
    });

    const lines = jsonl.trimEnd().split('\n').map((line) => JSON.parse(line));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      task_id: 'task_abc',
      title: 'Rate path scan',
      question: 'Will rates cut this quarter?',
      score: 84,
      confidence: 0.72,
      user_feedback: 'positive',
      is_live: true,
      topics: ['macro', 'fed'],
      orchestration_id: 'orch_1',
      watchlist_item_id: 'watch_1',
    });
    expect(lines[1]).toMatchObject({
      task_id: 'task_empty',
      score: null,
      confidence: null,
      topics: [],
      is_live: false,
    });
    expect(jsonl.endsWith('\n')).toBe(true);
  });

  it('returns an empty stream for an empty view and ignores malformed topics', () => {
    const jsonl = formatAgentHistoryJsonl({
      items: [
        {
          taskId: 'task_topics',
          topics: [' macro ', null as unknown as string, 42 as unknown as string],
        },
      ],
    });
    const parsed = JSON.parse(jsonl.trim()) as { topics: string[] };
    expect(parsed.topics).toEqual(['macro']);
    expect(formatAgentHistoryJsonl({ items: [] })).toBe('');
  });

  it('keeps malformed scalar fields from breaking the stream or its stable schema', () => {
    const jsonl = formatAgentHistoryJsonl({
      items: [
        {
          taskId: 42 as unknown as string,
          title: { unexpected: true } as unknown as string,
          question: ' first line\nsecond line ',
          createdAt: 2026 as unknown as string,
          userFeedback: { label: 'positive' } as unknown as string,
          orchestrationId: ' orch_1 ',
          watchlistItemId: 0 as unknown as string,
        },
      ],
    });

    const lines = jsonl.trimEnd().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      task_id: '',
      title: '',
      question: 'first line\nsecond line',
      score: null,
      confidence: null,
      user_feedback: null,
      created_at: '',
      is_live: false,
      topics: [],
      orchestration_id: 'orch_1',
      watchlist_item_id: null,
    });
  });
});
