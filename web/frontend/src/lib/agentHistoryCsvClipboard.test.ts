import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyCsvToClipboard } from './clipboard';
import { copyAgentHistoryCsv } from './agentHistoryCsvClipboard';

vi.mock('./clipboard', () => ({
  copyCsvToClipboard: vi.fn(),
}));

describe('copyAgentHistoryCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies the current history rows as spreadsheet-safe CSV', async () => {
    vi.mocked(copyCsvToClipboard).mockResolvedValueOnce(true);

    await expect(
      copyAgentHistoryCsv({
        items: [
          {
            taskId: 'task_123',
            title: 'Rate path, 2026',
            question: 'Will rates cut this quarter?',
            score: 84,
            topics: ['macro', 'fed'],
          },
        ],
      }),
    ).resolves.toBe(true);

    expect(copyCsvToClipboard).toHaveBeenCalledTimes(1);
    const [text] = vi.mocked(copyCsvToClipboard).mock.calls[0];
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text).toContain('task_id,title,question,score');
    expect(text).toContain('task_123,"Rate path, 2026",Will rates cut this quarter?,84');
    expect(text).toContain('macro; fed');
  });

  it('returns a clipboard refusal so the page can show failure feedback', async () => {
    vi.mocked(copyCsvToClipboard).mockResolvedValueOnce(false);

    await expect(copyAgentHistoryCsv({ items: [] })).resolves.toBe(false);
  });

  it('converts an unexpected clipboard exception into a refusal', async () => {
    vi.mocked(copyCsvToClipboard).mockRejectedValueOnce(new Error('clipboard unavailable'));

    await expect(copyAgentHistoryCsv({ items: [] })).resolves.toBe(false);
  });
});
