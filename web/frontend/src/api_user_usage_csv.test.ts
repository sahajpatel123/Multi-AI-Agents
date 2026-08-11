import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportUserUsageCsv } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('exportUserUsageCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the user usage CSV endpoint and returns a blob', async () => {
    const mockBlob = new Blob(['date,tokens\n2026-08-01,100'], { type: 'text/csv' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 })
    );

    const res = await exportUserUsageCsv();
    expect(Object.prototype.toString.call(res)).toBe('[object Blob]');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/user/usage/export.csv',
      {}
    );
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
