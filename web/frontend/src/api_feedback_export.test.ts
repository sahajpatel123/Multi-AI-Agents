import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportAgentFeedbackCsv } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('Agent answer feedback export helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the CSV endpoint and preserves the server filename', async () => {
    const blob = new Blob(['id,task_id,verdict\n1,task-1,correct\n'], { type: 'text/csv' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(blob, {
        status: 200,
        headers: {
          'Content-Disposition': 'attachment; filename="arena-feedback-7-20260818.csv"',
        },
      }),
    );

    const result = await exportAgentFeedbackCsv();

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.filename).toBe('arena-feedback-7-20260818.csv');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/agent/feedback/export.csv', {});
  });

  it('uses a safe fallback filename when the response omits Content-Disposition', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['id\n'], { type: 'text/csv' }), { status: 200 }),
    );

    const result = await exportAgentFeedbackCsv();

    expect(result.filename).toBe('arena-feedback.csv');
  });

  it('surfaces request IDs when the export fails', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'export unavailable' }), {
        status: 503,
        headers: { 'x-request-id': 'req-feedback-csv' },
      }),
    );

    await expect(exportAgentFeedbackCsv()).rejects.toMatchObject({
      status: 503,
      message: 'export unavailable (Request ID: req-feedback-csv)',
    });
  });
});
