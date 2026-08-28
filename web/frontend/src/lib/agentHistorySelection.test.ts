import { describe, expect, it } from 'vitest';
import { selectAgentHistoryItems } from './agentHistorySelection';
import {
  formatSelectedAgentHistoryCsv,
  formatSelectedAgentHistoryHtml,
  formatSelectedAgentHistoryJson,
  formatSelectedAgentHistoryJsonl,
  formatSelectedAgentHistoryMarkdown,
} from './agentHistorySelectionExport';

describe('selectAgentHistoryItems', () => {
  const history = [
    { task_id: 'newest', task_text: 'First' },
    { task_id: 'middle', task_text: 'Second' },
    { task_id: 'oldest', task_text: 'Third' },
  ];

  it('preserves history order and ignores stale or duplicate ids', () => {
    expect(
      selectAgentHistoryItems(history, ['oldest', 'missing', 'newest', 'oldest']),
    ).toEqual([history[0], history[2]]);
  });

  it('keeps only the first retained row when an API payload repeats an id', () => {
    const repeated = [
      { task_id: 'newest', task_text: 'First copy' },
      { task_id: 'newest', task_text: 'Duplicate copy' },
      { task_id: 'oldest', task_text: 'Last' },
    ];

    expect(selectAgentHistoryItems(repeated, ['newest', 'oldest'])).toEqual([
      repeated[0],
      repeated[2],
    ]);
  });

  it('returns an empty list without mutating the source rows', () => {
    const snapshot = [...history];

    expect(selectAgentHistoryItems(history, [])).toEqual([]);
    expect(history).toEqual(snapshot);
  });

  it('skips malformed rows and selection ids without aborting valid matches', () => {
    const valid = { task_id: 'kept', task_text: 'Keep this row' };
    const malformed = [
      null,
      'not a row',
      { task_id: 42 },
      { title: 'Missing an id' },
      { task_id: '' },
      valid,
    ] as unknown as typeof history;

    expect(
      selectAgentHistoryItems(
        malformed,
        [null, 42, '', 'kept'] as unknown as string[],
      ),
    ).toEqual([valid]);
  });
});

describe('formatSelectedAgentHistoryCsv', () => {
  it('exports only selected retained rows in history order', () => {
    const csv = formatSelectedAgentHistoryCsv(
      [
        { task_id: 'newest', title: 'Newest' },
        { task_id: 'middle', title: 'Middle' },
        { task_id: 'oldest', title: 'Oldest' },
      ],
      ['oldest', 'missing', 'newest', 'oldest'],
      (item) => ({ taskId: item.task_id, title: item.title }),
    );

    expect(csv).not.toBeNull();
    const rows = csv!
      .replace(/^\uFEFF/, '')
      .trim()
      .split(/\r?\n/)
      .slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('newest,Newest');
    expect(rows[1]).toContain('oldest,Oldest');
    expect(rows.join('\n')).not.toContain('Middle');
  });

  it('returns null when no retained task is selected', () => {
    expect(
      formatSelectedAgentHistoryCsv(
        [{ task_id: 'task_1', title: 'One' }],
        ['missing'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).toBeNull();
  });
});

describe('formatSelectedAgentHistoryMarkdown', () => {
  it('exports only selected retained rows in history order', () => {
    const markdown = formatSelectedAgentHistoryMarkdown(
      [
        { task_id: 'newest', title: 'Newest', task_text: 'First question' },
        { task_id: 'middle', title: 'Middle', task_text: 'Second question' },
        { task_id: 'oldest', title: 'Oldest', task_text: 'Third question' },
      ],
      ['oldest', 'missing', 'newest', 'oldest'],
      (item) => ({
        taskId: item.task_id,
        title: item.title,
        question: item.task_text,
      }),
    );

    expect(markdown).not.toBeNull();
    expect(markdown).toContain('**2** tasks');
    expect(markdown).toContain('## 1. Newest');
    expect(markdown).toContain('## 2. Oldest');
    expect(markdown).not.toContain('Middle');
    expect(markdown).not.toContain('Second question');
  });

  it('returns null when no retained task is selected', () => {
    expect(
      formatSelectedAgentHistoryMarkdown(
        [{ task_id: 'task_1', title: 'One' }],
        ['missing'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).toBeNull();
  });
});

describe('formatSelectedAgentHistoryHtml', () => {
  it('exports only selected retained rows in history order as an offline archive', () => {
    const html = formatSelectedAgentHistoryHtml(
      [
        { task_id: 'newest', title: 'Newest', task_text: 'First question' },
        { task_id: 'middle', title: 'Middle', task_text: 'Second question' },
        { task_id: 'oldest', title: 'Oldest', task_text: 'Third question' },
      ],
      ['oldest', 'missing', 'newest', 'oldest'],
      (item) => ({
        taskId: item.task_id,
        title: item.title,
        question: item.task_text,
      }),
    );

    expect(html).not.toBeNull();
    expect(html).toContain('<meta name="generator" content="Arena Agent history">');
    expect(html).toContain('<p class="summary">2 tasks</p>');
    expect(html).toContain('<h2>Newest</h2>');
    expect(html).toContain('<h2>Oldest</h2>');
    expect(html).not.toContain('<h2>Middle</h2>');
    expect(html).not.toContain('Second question');
  });

  it('returns null when no retained task is selected', () => {
    expect(
      formatSelectedAgentHistoryHtml(
        [{ task_id: 'task_1', title: 'One' }],
        ['missing'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).toBeNull();
  });
});

describe('formatSelectedAgentHistoryJson', () => {
  it('exports only selected retained rows in history order with a count envelope', () => {
    const json = formatSelectedAgentHistoryJson(
      [
        { task_id: 'newest', title: 'Newest', task_text: 'First question' },
        { task_id: 'middle', title: 'Middle', task_text: 'Second question' },
        { task_id: 'oldest', title: 'Oldest', task_text: 'Third question' },
      ],
      ['oldest', 'missing', 'newest', 'oldest'],
      (item) => ({
        taskId: item.task_id,
        title: item.title,
        question: item.task_text,
      }),
    );

    expect(json).not.toBeNull();
    const payload = JSON.parse(json!);
    expect(payload.total).toBe(2);
    expect(payload.items).toEqual([
      expect.objectContaining({ task_id: 'newest', title: 'Newest' }),
      expect.objectContaining({ task_id: 'oldest', title: 'Oldest' }),
    ]);
    expect(payload.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ task_id: 'middle' })]),
    );
  });

  it('returns null when no retained task is selected', () => {
    expect(
      formatSelectedAgentHistoryJson(
        [{ task_id: 'task_1', title: 'One' }],
        ['missing'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).toBeNull();
  });
});

describe('formatSelectedAgentHistoryJsonl', () => {
  it('exports one normalized JSON object per selected retained row in history order', () => {
    const jsonl = formatSelectedAgentHistoryJsonl(
      [
        { task_id: 'newest', title: 'Newest' },
        { task_id: 'middle', title: 'Middle' },
        { task_id: 'oldest', title: 'Oldest' },
      ],
      ['oldest', 'missing', 'newest', 'oldest'],
      (item) => ({ taskId: item.task_id, title: item.title }),
    );

    expect(jsonl).not.toBeNull();
    const rows = jsonl!
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line) as { task_id: string; title: string });
    expect(rows).toEqual([
      expect.objectContaining({ task_id: 'newest', title: 'Newest' }),
      expect.objectContaining({ task_id: 'oldest', title: 'Oldest' }),
    ]);
    expect(rows).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ task_id: 'middle' })]),
    );
  });

  it('returns null when no retained task is selected', () => {
    expect(
      formatSelectedAgentHistoryJsonl(
        [{ task_id: 'task_1', title: 'One' }],
        ['missing'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).toBeNull();
  });
});
