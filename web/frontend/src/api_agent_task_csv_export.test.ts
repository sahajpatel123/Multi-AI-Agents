import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportAgentTaskCsv } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('Agent task CSV export frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the task CSV export endpoint and returns a blob', async () => {
    const csv = '\uFEFFtask_id,section,key,value\r\ntask-123,metadata,question,Q\r\n';
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(csv, {
        status: 200,
        headers: { 'content-type': 'text/csv; charset=utf-8' },
      }),
    );

    const blob = await exportAgentTaskCsv('task-123');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/tasks/task-123/export.csv',
      {},
    );
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('text/csv;charset=utf-8');
  });

  it('encodes task ids with reserved characters', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('\uFEFFtask_id,section,key,value\r\n', { status: 200 }),
    );

    await exportAgentTaskCsv('a/b?c');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/tasks/a%2Fb%3Fc/export.csv',
      {},
    );
  });

  it('rejects an empty report body so no empty .csv file is saved', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('', { status: 200 }),
    );

    await expect(exportAgentTaskCsv('task-123')).rejects.toThrow(
      'Empty report returned by the server',
    );
  });

  it('rejects a whitespace-only report body with the request id', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(' \n\t ', {
        status: 200,
        headers: { 'x-request-id': 'req-empty-csv' },
      }),
    );

    await expect(exportAgentTaskCsv('task-123')).rejects.toThrow(
      'Empty report returned by the server (Request ID: req-empty-csv)',
    );
  });

  it('surfaces request IDs on failure', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: { message: 'Too many task CSV exports' },
        }),
        {
          status: 429,
          headers: { 'x-request-id': 'req-csv-export' },
        },
      ),
    );

    await expect(exportAgentTaskCsv('task-123')).rejects.toMatchObject({
      status: 429,
      message: 'Too many task CSV exports (Request ID: req-csv-export)',
    });
  });
});
