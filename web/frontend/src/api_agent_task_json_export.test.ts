import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportAgentTaskJson } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('Agent task JSON export frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the task JSON export endpoint and returns the blob', async () => {
    const mockBlob = new Blob(['{"task_id":"task-123"}'], {
      type: 'application/json',
    });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 }),
    );

    const blob = await exportAgentTaskJson('task-123');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/tasks/task-123/export.json',
      {},
    );
    expect(Object.prototype.toString.call(blob)).toBe('[object Blob]');
  });

  it('encodes task ids with reserved characters', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['{}']), { status: 200 }),
    );

    await exportAgentTaskJson('a/b?c');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/tasks/a%2Fb%3Fc/export.json',
      {},
    );
  });

  it('surfaces request IDs on failure', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: { message: 'Too many task JSON exports' },
        }),
        {
          status: 429,
          headers: { 'x-request-id': 'req-json-export' },
        },
      ),
    );

    await expect(exportAgentTaskJson('task-123')).rejects.toMatchObject({
      status: 429,
      message: 'Too many task JSON exports (Request ID: req-json-export)',
    });
  });
});
