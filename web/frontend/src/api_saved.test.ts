import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSavedResponses,
  setSavedResponsePinned,
  setSavedResponsesPinned,
  deleteSavedResponses,
} from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('saved take API helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the full saved library via the envelope response', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              id: 7,
              session_id: 'sess-1',
              agent_id: 'analyst',
              persona_id: 'analyst',
              persona_name: 'Analyst',
              persona_color: '#c9a227',
              prompt: 'What is a good thesis?',
              one_liner: 'Anchor your thesis in a falsifiable claim.',
              verdict: 'Start from the question, not the answer.',
              score: 92,
              confidence: 88,
              pinned: true,
              pinned_at: '2026-08-07T04:00:00Z',
              saved_at: '2026-08-06T20:00:00Z',
            },
          ],
          total: 1,
          page: 1,
          per_page: 200,
        }),
        { status: 200 },
      ),
    );

    const items = await getSavedResponses();
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/saved?per_page=200', {});
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 7,
      session_id: 'sess-1',
      agent_id: 'analyst',
      persona_name: 'Analyst',
      score: 92,
      confidence: 88,
      pinned: true,
      pinned_at: '2026-08-07T04:00:00Z',
      timestamp: '2026-08-06T20:00:00Z',
    });
  });

  it('keeps accepting a legacy bare-array response', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 1,
            session_id: 'sess-old',
            agent_id: 'empath',
            prompt: 'Old question',
            one_liner: 'Old take',
            verdict: '...',
            score: 60,
            confidence: 70,
            pinned_at: null,
            saved_at: '2026-01-01T00:00:00Z',
          },
        ]),
        { status: 200 },
      ),
    );

    const items = await getSavedResponses();
    expect(items).toHaveLength(1);
    expect(items[0].pinned).toBe(false);
    expect(items[0].pinned_at).toBeNull();
  });

  it('returns an empty list for an unexpected empty payload', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    expect(await getSavedResponses()).toEqual([]);
  });

  it('patches a saved take pin state and returns the normalized body', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 7,
          pinned: true,
          pinned_at: '2026-08-07T04:00:00Z',
        }),
        { status: 200 },
      ),
    );

    const result = await setSavedResponsePinned(7, true);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/saved/7',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ pinned: true }),
      }),
    );
    expect(result).toEqual({
      id: 7,
      pinned: true,
      pinned_at: '2026-08-07T04:00:00Z',
    });
  });

  it('bulk-pins saved takes and normalizes the response', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'ok',
          requested: 2,
          applied: 2,
          ids: [7, 8],
          pinned: true,
          pin_limit_reached: false,
        }),
        { status: 200 },
      ),
    );

    const result = await setSavedResponsesPinned([7, 8], true);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/saved/bulk-pin',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ ids: [7, 8], pinned: true }),
      }),
    );
    expect(result).toEqual({
      status: 'ok',
      requested: 2,
      applied: 2,
      ids: [7, 8],
      pinned: true,
      pin_limit_reached: false,
    });
  });

  it('surfaces a partial pin-limit failure', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'ok',
          requested: 3,
          applied: 1,
          ids: [9],
          pinned: true,
          pin_limit_reached: true,
        }),
        { status: 200 },
      ),
    );

    const result = await setSavedResponsesPinned([9, 10, 11], true);
    expect(result.applied).toBe(1);
    expect(result.pin_limit_reached).toBe(true);
    expect(result.ids).toEqual([9]);
  });

  it('bulk-deletes saved takes and normalizes the response', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'deleted',
          requested: 2,
          deleted: 2,
        }),
        { status: 200 },
      ),
    );

    const result = await deleteSavedResponses([7, 8]);
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/saved/bulk',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ ids: [7, 8] }),
      }),
    );
    expect(result).toEqual({ status: 'deleted', requested: 2, deleted: 2 });
  });

  it('reports a request failure for bulk delete', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'nope' }), { status: 400 }),
    );

    await expect(deleteSavedResponses([7])).rejects.toThrow('nope');
  });
});
