import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportUserUsageJson } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('exportUserUsageJson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the user usage JSON endpoint and returns a blob', async () => {
    const mockBlob = new Blob(
      [JSON.stringify({ history: [{ date: '2026-08-11', tokens: 100 }] })],
      { type: 'application/json' },
    );
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, { status: 200 })
    );

    const res = await exportUserUsageJson();
    expect(Object.prototype.toString.call(res)).toBe('[object Blob]');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/user/usage/export.json',
      {}
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
