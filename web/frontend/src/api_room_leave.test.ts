import { describe, it, expect, vi, beforeEach } from 'vitest';
import { leaveRoom } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('leaveRoom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs to the leave endpoint and returns the server slug', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'left', slug: 'quantum-lab' }), {
        status: 200,
      })
    );

    const result = await leaveRoom('quantum-lab');
    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith(
      '/api/rooms/quantum-lab/leave',
      { method: 'POST' },
    );
    expect(result).toEqual({ status: 'left', slug: 'quantum-lab' });
  });

  it('throws an ApiError when the room does not exist', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Room not found' }), {
        status: 404,
      })
    );

    await expect(leaveRoom('nope')).rejects.toMatchObject({
      status: 404,
      message: 'Room not found',
    });
  });
});
