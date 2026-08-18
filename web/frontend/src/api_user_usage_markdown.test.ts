import { describe, expect, it, vi, beforeEach } from 'vitest';
import { exportUserUsageMarkdown } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('exportUserUsageMarkdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the endpoint and returns the blob with the server filename', async () => {
    const mockBlob = new Blob(['# Arena — usage report'], { type: 'text/markdown' });
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(mockBlob, {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="arena-usage-2026-07-29-to-2026-08-11.md"',
        },
      }),
    );

    const result = await exportUserUsageMarkdown();
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.filename).toBe('arena-usage-2026-07-29-to-2026-08-11.md');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/user/usage/export.md',
      {},
    );
  });

  it('falls back to a fixed filename when Content-Disposition is missing', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['# Arena — usage report'], { type: 'text/markdown' }), {
        status: 200,
      }),
    );

    const result = await exportUserUsageMarkdown();
    expect(result.filename).toBe('arena-usage-14d.md');
  });

  it('surfaces request IDs on failure', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'boom' }), {
        status: 429,
        headers: { 'x-request-id': 'req-md-456' },
      }),
    );

    await expect(exportUserUsageMarkdown()).rejects.toMatchObject({
      status: 429,
      message: 'boom (Request ID: req-md-456)',
    });
  });
});
