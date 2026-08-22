import { describe, it, expect, vi, beforeEach } from 'vitest';
import { expectBlob } from './test/blob';
import { exportUserUsageJson } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('exportUserUsageJson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the endpoint and returns the blob with the server filename', async () => {
    const mockBlob = new Blob(
      [JSON.stringify({ history: [{ date: '2026-08-11', tokens: 100 }] })],
      { type: 'application/json' },
    );
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-usage-2026-07-29-to-2026-08-11.json"',
        },
      })
    );

    const res = await exportUserUsageJson();
    expectBlob(res.blob);
    expect(res.filename).toBe(
      'arena-usage-2026-07-29-to-2026-08-11.json',
    );
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/user/usage/export.json',
      {}
    );
  });

  it('falls back to a fixed filename when Content-Disposition is missing', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['{"history":[]}'], { type: 'application/json' }), {
        status: 200,
      })
    );

    const res = await exportUserUsageJson();
    expectBlob(res.blob);
    expect(res.filename).toBe('arena-usage-14d.json');
  });

  it('passes a custom window and uses it for the fallback filename', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['{"history":[]}'], { type: 'application/json' }), {
        status: 200,
      }),
    );

    const res = await exportUserUsageJson(30);
    expect(res.filename).toBe('arena-usage-30d.json');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/user/usage/export.json?window_days=30',
      {},
    );
  });

  it('decodes RFC 5987 encoded filenames', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['{"history":[]}'], { type: 'application/json' }), {
        status: 200,
        headers: {
          'Content-Disposition':
            "attachment; filename*=UTF-8''arena-usage-2026-07-29-to-2026-08-11.json",
        },
      })
    );

    const res = await exportUserUsageJson();
    expect(res.filename).toBe(
      'arena-usage-2026-07-29-to-2026-08-11.json',
    );
  });

  it('surfaces request IDs on failure', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'boom' }), {
        status: 429,
        headers: { 'x-request-id': 'req-456' },
      })
    );

    await expect(exportUserUsageJson()).rejects.toMatchObject({
      status: 429,
      message: 'boom (Request ID: req-456)',
    });
  });
});
