import { describe, expect, it, vi, beforeEach } from 'vitest';
import { deleteMemorySummaries, exportMemorySummaries, listMemorySummaries } from './api';
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

  it('serializes category, trusted-persona, and date filters for exports', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['[]'], { type: 'application/json' }), { status: 200 }),
    );

    await exportMemorySummaries('json', {
      category: 'decision',
      personaId: 'analyst',
      fromDate: '2026-08-01',
      toDate: '2026-08-16',
    });

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/memory/summaries/export.json?category=decision&persona_id=analyst&from_date=2026-08-01&to_date=2026-08-16',
      {},
    );
  });

  it('serializes date filters when loading the Memory browser', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          summaries: [],
          total: 0,
          page: 1,
          per_page: 20,
          total_pages: 0,
          filters: { from_date: '2026-08-01', to_date: '2026-08-16' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await listMemorySummaries({
      fromDate: '2026-08-01',
      toDate: '2026-08-16',
    });

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/memory/summaries?from_date=2026-08-01&to_date=2026-08-16',
      {},
    );
    expect(result.filters).toMatchObject({
      from_date: '2026-08-01',
      to_date: '2026-08-16',
    });
  });

  it('serializes a non-default sort for the Memory browser and exports', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          summaries: [],
          total: 0,
          page: 1,
          per_page: 20,
          total_pages: 0,
          filters: { sort: 'most_exchanges' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await listMemorySummaries({ sort: 'most_exchanges' });

    expect(result.filters.sort).toBe('most_exchanges');
    expect(apiFetchModule.apiFetch).toHaveBeenLastCalledWith(
      '/api/memory/summaries?sort=most_exchanges',
      {},
    );

    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['[]'], { type: 'application/json' }), { status: 200 }),
    );
    await exportMemorySummaries('json', { sort: 'oldest' });

    expect(apiFetchModule.apiFetch).toHaveBeenLastCalledWith(
      '/api/memory/summaries/export.json?sort=oldest',
      {},
    );
  });

  it('supports Markdown exports with the server filename', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(new Blob(['# Arena Memory\n'], { type: 'text/markdown' }), {
        status: 200,
        headers: {
          'Content-Disposition': 'attachment; filename="arena-memory-summaries-1.md"',
        },
      }),
    );

    const result = await exportMemorySummaries('md', { category: 'decision' });

    expect(result.filename).toBe('arena-memory-summaries-1.md');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/memory/summaries/export.md?category=decision',
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

describe('deleteMemorySummaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deduplicates selected ids and returns the server reconciliation', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'deleted', requested: 2, deleted: 1, ids: [4] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(deleteMemorySummaries([4, 4, 9])).resolves.toEqual({
      status: 'deleted',
      requested: 2,
      deleted: 1,
      ids: [4],
    });
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/memory/summaries/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [4, 9] }),
    });
  });
});
