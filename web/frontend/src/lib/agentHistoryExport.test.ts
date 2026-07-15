import { describe, expect, it } from 'vitest';
import { formatAgentHistoryExport } from './agentHistoryExport';

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
});
