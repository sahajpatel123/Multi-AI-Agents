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

  it('returns zero when the response is not successful', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Nope' }), { status: 429 }),
    );

    expect(await clearAllSessions()).toBe(0);
  });

  it('returns zero when the payload is missing a deleted count', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'deleted' }), { status: 200 }),
    );

    expect(await clearAllSessions()).toBe(0);
  });
});
