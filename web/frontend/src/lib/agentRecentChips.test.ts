import { describe, expect, it } from 'vitest';
import { pickRecentAgentChips } from './agentRecentChips';

describe('pickRecentAgentChips', () => {
  it('takes up to limit items with title preferred for label', () => {
    const chips = pickRecentAgentChips(
      [
        { task_id: '1', title: 'SaaS market', task_text: 'Research the SaaS market deeply' },
        { task_id: '2', title: null, task_text: 'AI regulation outlook' },
        { task_id: '3', task_text: 'Third' },
        { task_id: '4', task_text: 'Fourth' },
        { task_id: '5', task_text: 'Fifth' },
      ],
      4,
    );
    expect(chips).toHaveLength(4);
    expect(chips[0]).toEqual({
      task_id: '1',
      label: 'SaaS market',
      task_text: 'Research the SaaS market deeply',
    });
    expect(chips[1].label).toBe('AI regulation outlook');
    expect(chips.map((c) => c.task_id)).not.toContain('5');
  });

  it('skips empty task text', () => {
    expect(
      pickRecentAgentChips([
        { task_id: 'x', task_text: '   ' },
        { task_id: 'y', task_text: 'Real question' },
      ]),
    ).toEqual([{ task_id: 'y', label: 'Real question', task_text: 'Real question' }]);
  });
});
