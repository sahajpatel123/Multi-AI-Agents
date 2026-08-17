import { describe, expect, it, vi, beforeEach } from 'vitest';
import { exportMemorySummaries } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('exportMemorySummaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports the active search as CSV and preserves the server filename', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['id,session_summary\n1,hello\n'], { type: 'text/csv' }), {
        status: 200,
        headers: {
          'Content-Disposition': 'attachment; filename="arena-memory-summaries-1.csv"',
        },
      }),
    );

    const result = await exportMemorySummaries('csv', { search: 'IPO notes' });

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.filename).toBe('arena-memory-summaries-1.csv');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/memory/summaries/export.csv?search=IPO+notes',
      {},
    );
  });

  it('serializes category and trusted-persona filters for exports', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['[]'], { type: 'application/json' }), { status: 200 }),
    );

    await exportMemorySummaries('json', {
      category: 'decision',
      personaId: 'analyst',
    });

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/memory/summaries/export.json?category=decision&persona_id=analyst',
      {},
    );
  });

  it('falls back to a format-specific filename when the header is missing', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['[]'], { type: 'application/json' }), { status: 200 }),
    );

    const result = await exportMemorySummaries('json');

    expect(result.filename).toBe('arena-memory-summaries.json');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/memory/summaries/export.json',
      {},
    );
  });

  it('surfaces request IDs on export failure', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: { message: 'Too many exports' } }), {
        status: 429,
        headers: { 'x-request-id': 'req-memory-export' },
      }),
    );

    await expect(exportMemorySummaries('csv')).rejects.toMatchObject({
      status: 429,
      message: 'Too many exports (Request ID: req-memory-export)',
    });
  });
});
