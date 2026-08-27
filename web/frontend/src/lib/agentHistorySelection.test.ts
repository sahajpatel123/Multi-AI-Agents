import { describe, expect, it } from 'vitest';
import { selectAgentHistoryItems } from './agentHistorySelection';

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
