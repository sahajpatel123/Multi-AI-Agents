import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportAgentTasksJsonl } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('Agent history JSONL export frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the streaming history endpoint and returns its blob', async () => {
    const jsonl = '{"task_id":"task-123"}\n{"task_id":"task-456"}\n';
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(jsonl, {
        status: 200,
        headers: { 'content-type': 'application/x-ndjson' },
      }),
    );

    const blob = await exportAgentTasksJsonl();

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/tasks/export.jsonl',
      {},
    );
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/x-ndjson');
  });

  it('keeps an empty JSONL body valid for an empty history', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('', { status: 200 }),
    );

    const blob = await exportAgentTasksJsonl();

    expect(blob.size).toBe(0);
  });

  it('surfaces request IDs when the export is rate limited', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { message: 'Too many task exports' } }),
        {
          status: 429,
          headers: { 'x-request-id': 'req-jsonl-export' },
        },
      ),
    );

    await expect(exportAgentTasksJsonl()).rejects.toMatchObject({
      status: 429,
      message: 'Too many task exports (Request ID: req-jsonl-export)',
    });
  });
});
