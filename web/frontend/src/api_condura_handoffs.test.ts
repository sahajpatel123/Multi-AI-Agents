import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getConduraHandoff, listConduraHandoffs } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

const recordRow = {
  id: 11,
  capability: 'delegate_task',
  execution_env: 'condura',
  status: 'dispatched',
  condura_run_id: 'run-9',
  summary: 'Tidy the downloads folder',
  created_at: '2026-08-23T07:00:00',
  updated_at: '2026-08-23T07:05:00',
};

describe('condura handoff API helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listConduraHandoffs', () => {
    it('GETs the list and normalizes each record', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            handoffs: [recordRow],
            total: 1,
            page: 1,
            per_page: 5,
            total_pages: 1,
            filters: { capability: null, status: null },
          }),
          { status: 200 },
        ),
      );

      const result = await listConduraHandoffs({ perPage: 5 });

      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
        '/api/condura/handoffs?per_page=5',
        {},
      );
      expect(result.total).toBe(1);
      expect(result.handoffs).toEqual([
        {
          id: 11,
          capability: 'delegate_task',
          executionEnv: 'condura',
          status: 'dispatched',
          conduraRunId: 'run-9',
          summary: 'Tidy the downloads folder',
          createdAt: '2026-08-23T07:00:00',
          updatedAt: '2026-08-23T07:05:00',
        },
      ]);
    });

    it('builds capability and status filters into the query string', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ handoffs: [], total: 0, total_pages: 0 }), {
          status: 200,
        }),
      );

      await listConduraHandoffs({ capability: ' delegate_task ', status: 'failed' });

      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
        '/api/condura/handoffs?capability=delegate_task&status=failed',
        {},
      );
    });

    it('surfaces a refusal verbatim with its request ID', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            detail: { message: 'Too many handoff list reads. Please slow down.' },
          }),
          { status: 429, headers: { 'X-Request-ID': 'req-hl-1' } },
        ),
      );

      await expect(listConduraHandoffs()).rejects.toThrow(
        'Too many handoff list reads. Please slow down. (Request ID: req-hl-1)',
      );
    });
  });

  describe('getConduraHandoff', () => {
    it('fetches the detail and normalizes the event timeline', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...recordRow,
            session_id: 'sess-1',
            events: [
              { id: 1, event_kind: 'started', payload: { step: 1 }, created_at: '2026-08-23T07:01:00' },
              { id: 2, event_kind: 'complete', payload: null, created_at: '2026-08-23T07:02:00' },
            ],
          }),
          { status: 200 },
        ),
      );

      const detail = await getConduraHandoff(11);

      expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/condura/handoffs/11', {});
      expect(detail.status).toBe('dispatched');
      expect(detail.events).toEqual([
        {
          id: 1,
          eventKind: 'started',
          payload: { step: 1 },
          createdAt: '2026-08-23T07:01:00',
        },
        { id: 2, eventKind: 'complete', payload: null, createdAt: '2026-08-23T07:02:00' },
      ]);
    });

    it('rejects invalid ids before any request is made', async () => {
      await expect(getConduraHandoff(0)).rejects.toThrow(
        'handoffId must be a positive integer',
      );
      expect(apiFetchModule.apiFetch).not.toHaveBeenCalled();
    });

    it('surfaces a not-found refusal verbatim', async () => {
      vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({ detail: { message: 'Handoff not found' } }),
          { status: 404, headers: { 'X-Request-ID': 'req-hd-4' } },
        ),
      );

      await expect(getConduraHandoff(999)).rejects.toThrow(
        'Handoff not found (Request ID: req-hd-4)',
      );
    });
  });
});
