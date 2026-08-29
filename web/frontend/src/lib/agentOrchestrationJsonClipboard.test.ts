import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyJsonToClipboard } from './clipboard';
import { copyAgentOrchestrationJson } from './agentOrchestrationJsonClipboard';

vi.mock('./clipboard', () => ({
  copyJsonToClipboard: vi.fn(),
}));

describe('copyAgentOrchestrationJson', () => {
  const validPayload = {
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

  it('copies a validated JSON export using the FileReader fallback and structured clipboard helper', async () => {
    const json = JSON.stringify(validPayload, null, 2);
    vi.mocked(copyJsonToClipboard).mockResolvedValueOnce(true);

    await expect(
      copyAgentOrchestrationJson(new Blob([json], { type: 'application/json' }), 'orch-1'),
    ).resolves.toBe(true);

    expect(copyJsonToClipboard).toHaveBeenCalledWith(json);
  });

  it('uses the modern Blob text reader when available', async () => {
    const blob = new Blob(['ignored'], { type: 'application/json' });
    const json = JSON.stringify(validPayload);
    const text = vi.fn().mockResolvedValue(json);
    Object.defineProperty(blob, 'text', { value: text });
    vi.mocked(copyJsonToClipboard).mockResolvedValueOnce(true);

    await expect(copyAgentOrchestrationJson(blob, 'orch-1')).resolves.toBe(true);

    expect(text).toHaveBeenCalledOnce();
    expect(copyJsonToClipboard).toHaveBeenCalledWith(json);
  });

  it.each([
    ['empty content', ''],
    ['malformed JSON', 'not json'],
    ['a non-object root', '[]'],
    ['a mismatched orchestration', JSON.stringify({ ...validPayload, id: 'orch-2' })],
    ['an incomplete orchestration', JSON.stringify({ ...validPayload, status: 'running' })],
    ['an inconsistent task count', JSON.stringify({ ...validPayload, task_count: 2 })],
    ['a malformed creation time', JSON.stringify({ ...validPayload, created_at: 123 })],
    ['a missing expected ID', JSON.stringify(validPayload)],
  ])('refuses %s without touching the clipboard', async (label, text) => {
    const expectedId = label === 'a missing expected ID' ? '  ' : 'orch-1';
    await expect(copyAgentOrchestrationJson(new Blob([text]), expectedId)).resolves.toBe(false);
    expect(copyJsonToClipboard).not.toHaveBeenCalled();
  });

  it('returns a clipboard refusal to the page', async () => {
    vi.mocked(copyJsonToClipboard).mockResolvedValueOnce(false);

    await expect(
      copyAgentOrchestrationJson(new Blob([JSON.stringify(validPayload)]), 'orch-1'),
    ).resolves.toBe(false);
  });

  it('converts an unexpected clipboard exception into a refusal', async () => {
    vi.mocked(copyJsonToClipboard).mockRejectedValueOnce(new Error('clipboard unavailable'));

    await expect(
      copyAgentOrchestrationJson(new Blob([JSON.stringify(validPayload)]), 'orch-1'),
    ).resolves.toBe(false);
  });
});
