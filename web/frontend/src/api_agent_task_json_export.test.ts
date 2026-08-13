import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportAgentTaskJson, fetchAgentTaskJsonText } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('Agent task JSON export frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the task JSON export endpoint and returns the report text', async () => {
    const report = '{\n  "task_id": "task-123"\n}\n';
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(report, {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    );

    const text = await fetchAgentTaskJsonText('task-123');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/tasks/task-123/export.json',
      {},
    );
    expect(text).toBe(report);
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

  it('rejects an empty report body so the UI never reports a successful copy', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('', { status: 200 }),
    );

    await expect(fetchAgentTaskJsonText('task-123')).rejects.toThrow(
      'Empty report returned by the server',
    );
  });

  it('rejects a whitespace-only report body with the request id', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(' \n\t ', {
        status: 200,
        headers: { 'x-request-id': 'req-empty-json' },
      }),
    );

    await expect(fetchAgentTaskJsonText('task-123')).rejects.toThrow(
      'Empty report returned by the server (Request ID: req-empty-json)',
    );
  });

  it('rejects a non-JSON report body so the clipboard never gets invalid JSON', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('<html>proxy error</html>', {
        status: 200,
        headers: { 'x-request-id': 'req-invalid-json' },
      }),
    );

    await expect(fetchAgentTaskJsonText('task-123')).rejects.toThrow(
      'Invalid JSON report returned by the server (Request ID: req-invalid-json)',
    );
  });

  it('keeps the blob download path working through the shared response helper', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('{"task_id":"task-123"}', { status: 200 }),
    );

    const blob = await exportAgentTaskJson('task-123');
    expect(blob.size).toBe('{"task_id":"task-123"}'.length);
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
