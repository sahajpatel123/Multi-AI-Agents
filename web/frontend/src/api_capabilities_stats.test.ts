import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCapabilityStats } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('getCapabilityStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GETs the stats endpoint and keeps the server order with optional fields', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          stats: [
            { id: 'arena.respond', description: 'Panel response.', execution: 'local' },
            {
              id: 'file.organize',
              description: 'Organize files.',
              execution: 'hybrid',
              condura_method: 'POST',
              stream_heartbeat_seconds: 600,
            },
          ],
          total: 2,
        }),
        { status: 200 },
      ),
    );

    const stats = await getCapabilityStats();

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/agent/capabilities/stats', {});
    expect(stats).toEqual([
      { id: 'arena.respond', description: 'Panel response.', execution: 'local' },
      {
        id: 'file.organize',
        description: 'Organize files.',
        execution: 'hybrid',
        conduraMethod: 'POST',
        streamHeartbeatSeconds: 600,
      },
    ]);
  });

  it('drops malformed entries and non-finite heartbeats instead of crashing', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          stats: [
            null,
            { id: '', description: 'no id', execution: 'server' },
            { id: 'ok.cap', description: 42, execution: null, stream_heartbeat_seconds: '600' },
          ],
        }),
        { status: 200 },
      ),
    );

    const stats = await getCapabilityStats();

    expect(stats).toEqual([
      { id: 'ok.cap', description: '42', execution: '', streamHeartbeatSeconds: undefined },
    ]);
  });

  it('surfaces the rate-limit refusal verbatim with its request ID', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: { message: 'Too many capability-stat lookups. Please slow down.' },
        }),
        { status: 429, headers: { 'X-Request-ID': 'req-capstats-1' } },
      ),
    );

    await expect(getCapabilityStats()).rejects.toThrow(
      'Too many capability-stat lookups. Please slow down. (Request ID: req-capstats-1)',
    );
  });
});
