import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyJsonToClipboard } from './clipboard';
import { copyAgentOrchestrationHistoryJson } from './agentOrchestrationHistoryJsonClipboard';

vi.mock('./clipboard', () => ({
  copyJsonToClipboard: vi.fn(),
}));

describe('copyAgentOrchestrationHistoryJson', () => {
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

  it('copies complete and in-progress history through the structured clipboard helper', async () => {
    const json = JSON.stringify([
      validItem,
      { ...validItem, id: 'orch-2', status: 'running', synthesis: '' },
    ], null, 2);
    vi.mocked(copyJsonToClipboard).mockResolvedValueOnce(true);

    await expect(
      copyAgentOrchestrationHistoryJson(new Blob([json], { type: 'application/json' })),
    ).resolves.toBe(true);

    expect(copyJsonToClipboard).toHaveBeenCalledWith(json);
  });

  it('allows an empty retained history export', async () => {
    vi.mocked(copyJsonToClipboard).mockResolvedValueOnce(true);

    await expect(copyAgentOrchestrationHistoryJson(new Blob(['[]']))).resolves.toBe(true);

    expect(copyJsonToClipboard).toHaveBeenCalledWith('[]');
  });

  it.each([
    ['empty content', ''],
    ['malformed JSON', 'not json'],
    ['a non-array root', JSON.stringify({ items: [] })],
    ['an unsupported status', JSON.stringify([{ ...validItem, status: 'queued' }])],
    ['an inconsistent task count', JSON.stringify([{ ...validItem, task_count: 2 }])],
    ['a malformed conflict', JSON.stringify([{ ...validItem, conflicts: ['bad'] }])],
  ])('refuses %s without touching the clipboard', async (_label, text) => {
    await expect(copyAgentOrchestrationHistoryJson(new Blob([text]))).resolves.toBe(false);
    expect(copyJsonToClipboard).not.toHaveBeenCalled();
  });

  it('turns clipboard refusal and rejection into ordinary failure feedback', async () => {
    const blob = new Blob([JSON.stringify([validItem])]);
    vi.mocked(copyJsonToClipboard).mockResolvedValueOnce(false);
    await expect(copyAgentOrchestrationHistoryJson(blob)).resolves.toBe(false);

    vi.mocked(copyJsonToClipboard).mockRejectedValueOnce(new Error('clipboard unavailable'));
    await expect(copyAgentOrchestrationHistoryJson(blob)).resolves.toBe(false);
  });
});
