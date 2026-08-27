import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyJsonlToClipboard } from './clipboard';
import { copyAgentHistoryJsonl } from './agentHistoryJsonlClipboard';

vi.mock('./clipboard', () => ({
  copyJsonlToClipboard: vi.fn(),
}));

describe('copyAgentHistoryJsonl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies one stable JSON object per filtered task', async () => {
    vi.mocked(copyJsonlToClipboard).mockResolvedValueOnce(true);

    await expect(
      copyAgentHistoryJsonl({
        items: [
          {
            taskId: 'task_123',
            title: 'Rate path scan',
            question: 'Will rates cut this quarter?',
            score: 84,
          },
        ],
      }),
    ).resolves.toBe(true);

    expect(copyJsonlToClipboard).toHaveBeenCalledTimes(1);
    const [text] = vi.mocked(copyJsonlToClipboard).mock.calls[0];
    expect(text.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(text)).toMatchObject({
      task_id: 'task_123',
      title: 'Rate path scan',
      question: 'Will rates cut this quarter?',
      score: 84,
    });
  });

  it('returns a clipboard refusal so the page can show failure feedback', async () => {
    vi.mocked(copyJsonlToClipboard).mockResolvedValueOnce(false);

    await expect(copyAgentHistoryJsonl({ items: [] })).resolves.toBe(false);
  });

  it('converts an unexpected clipboard exception into a refusal', async () => {
    vi.mocked(copyJsonlToClipboard).mockRejectedValueOnce(new Error('clipboard unavailable'));

    await expect(copyAgentHistoryJsonl({ items: [] })).resolves.toBe(false);
  });
});
