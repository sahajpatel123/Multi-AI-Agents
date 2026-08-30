import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyJsonlToClipboard } from './clipboard';
import { copyAgentOrchestrationHistoryJsonl } from './agentOrchestrationHistoryJsonlClipboard';

vi.mock('./clipboard', () => ({
  copyJsonlToClipboard: vi.fn(),
}));

describe('copyAgentOrchestrationHistoryJsonl', () => {
  const validItem = {
    id: 'orch-1',
    status: 'complete',
    created_at: '2026-08-29T09:30:00+00:00',
    task_count: 1,
    task_ids: ['task-1'],
    synthesis: 'Combined result',
    synthesis_bullets: ['Supported point'],
    conflicts: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies each validated orchestration record without rewriting the JSONL', async () => {
    const jsonl = [
      JSON.stringify(validItem),
      JSON.stringify({ ...validItem, id: 'orch-2', status: 'running', synthesis: '' }),
    ].join('\n') + '\n';
    vi.mocked(copyJsonlToClipboard).mockResolvedValueOnce(true);

    await expect(
      copyAgentOrchestrationHistoryJsonl(
        new Blob([jsonl], { type: 'application/x-ndjson' }),
      ),
    ).resolves.toBe(true);

    expect(copyJsonlToClipboard).toHaveBeenCalledWith(jsonl);
  });

  it.each([
    ['empty content', ''],
    ['malformed JSON', '{bad}\n'],
    ['an array line', `${JSON.stringify([validItem])}\n`],
    ['an unsupported status', `${JSON.stringify({ ...validItem, status: 'queued' })}\n`],
    ['an inconsistent task count', `${JSON.stringify({ ...validItem, task_count: 2 })}\n`],
    ['an interior blank line', `${JSON.stringify(validItem)}\n\n${JSON.stringify(validItem)}\n`],
    ['more than one trailing line break', `${JSON.stringify(validItem)}\n\n`],
  ])('refuses %s without touching the clipboard', async (_label, text) => {
    await expect(copyAgentOrchestrationHistoryJsonl(new Blob([text]))).resolves.toBe(false);
    expect(copyJsonlToClipboard).not.toHaveBeenCalled();
  });

  it('turns clipboard refusal and rejection into ordinary failure feedback', async () => {
    const blob = new Blob([`${JSON.stringify(validItem)}\n`]);
    vi.mocked(copyJsonlToClipboard).mockResolvedValueOnce(false);
    await expect(copyAgentOrchestrationHistoryJsonl(blob)).resolves.toBe(false);

    vi.mocked(copyJsonlToClipboard).mockRejectedValueOnce(new Error('clipboard unavailable'));
    await expect(copyAgentOrchestrationHistoryJsonl(blob)).resolves.toBe(false);
  });
});
