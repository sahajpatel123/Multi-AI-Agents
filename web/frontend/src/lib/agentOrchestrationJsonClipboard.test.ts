import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyJsonToClipboard } from './clipboard';
import { copyAgentOrchestrationJson } from './agentOrchestrationJsonClipboard';

vi.mock('./clipboard', () => ({
  copyJsonToClipboard: vi.fn(),
}));

describe('copyAgentOrchestrationJson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies a JSON export using the FileReader fallback and structured clipboard helper', async () => {
    const json = JSON.stringify({ id: 'orch-1', status: 'complete', task_ids: ['task-1'] }, null, 2);
    vi.mocked(copyJsonToClipboard).mockResolvedValueOnce(true);

    await expect(
      copyAgentOrchestrationJson(new Blob([json], { type: 'application/json' })),
    ).resolves.toBe(true);

    expect(copyJsonToClipboard).toHaveBeenCalledWith(json);
  });

  it('uses the modern Blob text reader when available', async () => {
    const blob = new Blob(['ignored'], { type: 'application/json' });
    const text = vi.fn().mockResolvedValue('{"id":"orch-1"}');
    Object.defineProperty(blob, 'text', { value: text });
    vi.mocked(copyJsonToClipboard).mockResolvedValueOnce(true);

    await expect(copyAgentOrchestrationJson(blob)).resolves.toBe(true);

    expect(text).toHaveBeenCalledOnce();
    expect(copyJsonToClipboard).toHaveBeenCalledWith('{"id":"orch-1"}');
  });

  it.each([
    ['', 'empty'],
    ['not json', 'invalid'],
    ['[]', 'non-object'],
  ])('refuses %s JSON without touching the clipboard', async (text) => {
    await expect(copyAgentOrchestrationJson(new Blob([text]))).resolves.toBe(false);
    expect(copyJsonToClipboard).not.toHaveBeenCalled();
  });

  it('returns a clipboard refusal to the page', async () => {
    vi.mocked(copyJsonToClipboard).mockResolvedValueOnce(false);

    await expect(copyAgentOrchestrationJson(new Blob(['{"id":"orch-1"}']))).resolves.toBe(false);
  });

  it('converts an unexpected clipboard exception into a refusal', async () => {
    vi.mocked(copyJsonToClipboard).mockRejectedValueOnce(new Error('clipboard unavailable'));

    await expect(copyAgentOrchestrationJson(new Blob(['{"id":"orch-1"}']))).resolves.toBe(false);
  });
});
