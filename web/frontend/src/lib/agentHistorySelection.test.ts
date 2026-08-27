import { describe, expect, it } from 'vitest';
import { selectAgentHistoryItems } from './agentHistorySelection';
import {
  formatSelectedAgentHistoryCsv,
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

  it('returns an empty list without mutating the source rows', () => {
    const snapshot = [...history];

    expect(selectAgentHistoryItems(history, [])).toEqual([]);
    expect(history).toEqual(snapshot);
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
