import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyJsonToClipboard } from './clipboard';
import { copyAgentHistoryJson } from './agentHistoryJsonClipboard';

vi.mock('./clipboard', () => ({
  copyJsonToClipboard: vi.fn(),
}));

describe('copyAgentHistoryJson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies the filtered history envelope with its metadata', async () => {
    vi.mocked(copyJsonToClipboard).mockResolvedValueOnce(true);

    await expect(
      copyAgentHistoryJson({
        items: [
          {
            taskId: 'task_123',
            title: 'Rate path scan',
            question: 'Will rates cut this quarter?',
            score: 84,
          },
        ],
        totalCount: 4,
        filterNote: 'score: 75+',
        exportedAt: '2026-08-26T12:00:00.000Z',
      }),
    ).resolves.toBe(true);

    expect(copyJsonToClipboard).toHaveBeenCalledTimes(1);
    const [text] = vi.mocked(copyJsonToClipboard).mock.calls[0];
    expect(JSON.parse(text)).toMatchObject({
      exported_at: '2026-08-26T12:00:00.000Z',
      total: 4,
      filter_note: 'score: 75+',
      items: [
        {
          task_id: 'task_123',
          title: 'Rate path scan',
          question: 'Will rates cut this quarter?',
          score: 84,
        },
      ],
    });
  });

  it('returns a clipboard refusal so the page can show failure feedback', async () => {
    vi.mocked(copyJsonToClipboard).mockResolvedValueOnce(false);

    await expect(copyAgentHistoryJson({ items: [] })).resolves.toBe(false);
  });

  it('converts an unexpected clipboard exception into a refusal', async () => {
    vi.mocked(copyJsonToClipboard).mockRejectedValueOnce(new Error('clipboard unavailable'));

    await expect(copyAgentHistoryJson({ items: [] })).resolves.toBe(false);
  });
});
