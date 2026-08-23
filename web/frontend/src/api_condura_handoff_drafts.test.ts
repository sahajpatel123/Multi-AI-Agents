import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  deleteConduraHandoffDraft,
  listConduraHandoffDrafts,
} from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

const draftRow = {
  id: 3,
  capability: 'file.organize',
  payload: { intent: { capability: 'file.organize', summary: 'Tidy the downloads folder' } },
  created_at: '2026-08-23T07:00:00',
};

describe('condura handoff-draft API helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listConduraHandoffDrafts', () => {
    it('GETs the list and normalizes each draft', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            drafts: [draftRow],
            total: 1,
            page: 1,
            per_page: 20,
            total_pages: 1,
          }),
          { status: 200 },
        ),
      );

      const result = await listConduraHandoffDrafts({ perPage: 20 });

      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
        '/api/condura/handoff-drafts?per_page=20',
        {},
      );
      expect(result.total).toBe(1);
      expect(result.drafts).toEqual([
        {
          id: 3,
          capability: 'file.organize',
          payload: draftRow.payload,
          createdAt: '2026-08-23T07:00:00',
        },
      ]);
    });

    it('builds a capability filter into the query string', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ drafts: [], total: 0, total_pages: 0 }), {
          status: 200,
        }),
      );

      await listConduraHandoffDrafts({ page: 2, perPage: 10, capability: ' file.organize ' });

      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
        '/api/condura/handoff-drafts?page=2&per_page=10&capability=file.organize',
        {},
      );
    });

    it('surfaces a refusal verbatim with its request ID', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({ detail: { message: 'Too many handoff-draft list reads. Please slow down.' } }),
          { status: 429, headers: { 'X-Request-ID': 'req-list-1' } },
        ),
      );

      await expect(listConduraHandoffDrafts()).rejects.toThrow(
        'Too many handoff-draft list reads. Please slow down. (Request ID: req-list-1)',
      );
    });
  });

  describe('deleteConduraHandoffDraft', () => {
    it('DELETEs the draft by id', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

      await deleteConduraHandoffDraft(3);

      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/condura/handoff-drafts/3', {
        method: 'DELETE',
      });
    });

    it('rejects invalid ids before any request is made', async () => {
      await expect(deleteConduraHandoffDraft(0)).rejects.toThrow(
        'draftId must be a positive integer',
      );
      expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
    });

    it('surfaces a not-found refusal verbatim', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({ detail: { message: 'Draft not found' } }),
          { status: 404, headers: { 'X-Request-ID': 'req-del-9' } },
        ),
      );

      await expect(deleteConduraHandoffDraft(99)).rejects.toThrow(
        'Draft not found (Request ID: req-del-9)',
      );
    });
  });
});
