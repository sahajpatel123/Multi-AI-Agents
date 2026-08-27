import { describe, expect, it } from 'vitest';
import { reconcileAgentHistoryBulkDeleteIds } from './agentHistoryBulkDelete';

describe('reconcileAgentHistoryBulkDeleteIds', () => {
  it('removes selected tasks the server deleted or found already missing', () => {
    expect(
      reconcileAgentHistoryBulkDeleteIds(
        ['task-a', 'task-b', 'task-c'],
        ['task-a'],
        ['task-b'],
      ),
    ).toEqual(['task-a', 'task-b']);
  });

  it('ignores unrelated response ids and normalizes duplicate whitespace', () => {
    expect(
      reconcileAgentHistoryBulkDeleteIds(
        [' task-a ', 'task-a', 'task-b'],
        [' task-a ', 'not-selected'],
        ['missing'],
      ),
    ).toEqual(['task-a']);
  });
});
