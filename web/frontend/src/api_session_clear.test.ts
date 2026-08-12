import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllSessions } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('clearAllSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('DELETEs all resumable chats and returns the cleared count', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'deleted', deleted: 3 }), {
        status: 200,
      }),
    );

    const result = await clearAllSessions();
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/sessions', {
      method: 'DELETE',
    });
    expect(result).toBe(3);
  });

  it('returns null when the response is not successful', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Nope' }), { status: 429 }),
    );

    expect(await clearAllSessions()).toBeNull();
  });

  it('returns null when the request itself fails', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockRejectedValueOnce(
      new TypeError('Failed to fetch'),
    );

    expect(await clearAllSessions()).toBeNull();
  });

  it('returns zero for a successful clear with no deleted count', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'deleted' }), { status: 200 }),
    );

    expect(await clearAllSessions()).toBe(0);
  });

  it('returns zero when nothing was left to clear', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'deleted', deleted: 0 }), {
        status: 200,
      }),
    );

    expect(await clearAllSessions()).toBe(0);
  });
});
