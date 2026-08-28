import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportAgentOrchestrationsCsv } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('Agent orchestration history CSV export frontend API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches all orchestration history and returns a non-empty blob', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('id,status,created_at\norch-1,complete,2026-08-28\n', {
        status: 200,
        headers: { 'content-type': 'text/csv; charset=utf-8' },
      }),
    );

    const blob = await exportAgentOrchestrationsCsv();

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/orchestrations/export.csv',
      {},
    );
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('text/csv;charset=utf-8');
  });

  it('encodes an optional orchestration status filter', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('id,status\n', { status: 200 }),
    );

    await exportAgentOrchestrationsCsv('complete');

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/agent/orchestrations/export.csv?status=complete',
      {},
    );
  });

  it('rejects an empty successful response', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response('', { status: 200 }),
    );

    await expect(exportAgentOrchestrationsCsv()).rejects.toThrow(
      'Empty orchestration history export returned by the server',
    );
  });

  it('surfaces request IDs when the export is rate limited', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { message: 'Too many CSV exports' } }),
        {
          status: 429,
          headers: { 'x-request-id': 'req-orchestration-csv' },
        },
      ),
    );

    await expect(exportAgentOrchestrationsCsv()).rejects.toMatchObject({
      status: 429,
      message: 'Too many CSV exports (Request ID: req-orchestration-csv)',
    });
  });
});
