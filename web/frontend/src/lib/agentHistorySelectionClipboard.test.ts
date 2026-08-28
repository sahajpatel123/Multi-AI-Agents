import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyAgentHistoryJson } from './agentHistoryJsonClipboard';
import { copySelectedAgentHistoryJson } from './agentHistorySelectionClipboard';

vi.mock('./agentHistoryJsonClipboard', () => ({
  copyAgentHistoryJson: vi.fn(),
}));

describe('copySelectedAgentHistoryJson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies only selected retained rows in source order with an explicit count', async () => {
    vi.mocked(copyAgentHistoryJson).mockResolvedValueOnce(true);

    await expect(
      copySelectedAgentHistoryJson(
        [
          { task_id: 'newest', title: 'Newest' },
          { task_id: 'middle', title: 'Middle' },
          { task_id: 'oldest', title: 'Oldest' },
        ],
        ['oldest', 'missing', 'newest', 'oldest'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).resolves.toBe(true);

    expect(copyAgentHistoryJson).toHaveBeenCalledWith({
      items: [
        { taskId: 'newest', title: 'Newest' },
        { taskId: 'oldest', title: 'Oldest' },
      ],
      totalCount: 2,
    });
  });

  it('does not write an empty or stale selection', async () => {
    await expect(
      copySelectedAgentHistoryJson(
        [{ task_id: 'task-1', title: 'One' }],
        ['missing'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).resolves.toBe(false);

    expect(copyAgentHistoryJson).not.toHaveBeenCalled();
  });

  it('converts an unexpected clipboard exception into a refusal', async () => {
    vi.mocked(copyAgentHistoryJson).mockRejectedValueOnce(new Error('clipboard unavailable'));

    await expect(
      copySelectedAgentHistoryJson(
        [{ task_id: 'task-1', title: 'One' }],
        ['task-1'],
        (item) => ({ taskId: item.task_id, title: item.title }),
      ),
    ).resolves.toBe(false);
  });

  it('refuses malformed retained rows without escaping the clipboard boundary', async () => {
    await expect(
      copySelectedAgentHistoryJson(
        [null] as unknown as Array<{ task_id: string }>,
        ['task-1'],
        (item) => ({ taskId: item.task_id }),
      ),
    ).resolves.toBe(false);

    expect(copyAgentHistoryJson).not.toHaveBeenCalled();
  });
});
