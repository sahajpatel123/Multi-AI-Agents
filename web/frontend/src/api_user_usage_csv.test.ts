import { describe, it, expect, vi, beforeEach } from 'vitest';
import { expectBlob } from './test/blob';
import { exportUserUsageCsv } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('exportUserUsageCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the user usage CSV endpoint and returns the server filename', async () => {
    const mockBlob = new Blob(['date,tokens\n2026-08-01,100'], { type: 'text/csv' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-usage-2026-07-29-to-2026-08-11.csv"',
        },
      })
    );

    const res = await exportUserUsageCsv();
    expectBlob(res.blob);
    expect(res.filename).toBe('arena-usage-2026-07-29-to-2026-08-11.csv');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/user/usage/export.csv',
      {}
    );
  });

  it('passes a custom window and validates the client-side bounds', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['date,tokens']), { status: 200 }),
    );

    const res = await exportUserUsageCsv(30);
    expect(res.filename).toBe('arena-usage-30d.csv');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/user/usage/export.csv?window_days=30',
      {},
    );

    await expect(exportUserUsageCsv(0)).rejects.toThrow(
      'windowDays must be an integer between 1 and 365',
    );
    expect(apiFetchModule.apiFetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces request IDs on failure', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'boom' }), {
        status: 429,
        headers: { 'x-request-id': 'req-123' },
      })
    );

    await expect(exportUserUsageCsv()).rejects.toMatchObject({
      status: 429,
      message: 'boom (Request ID: req-123)',
    });
  });
});
