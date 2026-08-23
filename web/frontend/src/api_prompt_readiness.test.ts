import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPromptReadiness } from './api';
import * as apiFetchModule from './lib/apiFetch';

vi.mock('./lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

describe('getPromptReadiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GETs the readiness endpoint and normalizes the checks map', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'ok',
          service: 'arena-prompt',
          checked_at: '2026-08-23T10:00:00Z',
          checks: { db: 'ok', memory: 'ok', prompt_route: 'ok' },
        }),
        { status: 200 },
      ),
    );

    const readiness = await getPromptReadiness();

    expect(apiFetchModule.apiFetch).toHaveBeenCalledWith('/api/prompt/readiness', {});
    expect(readiness).toEqual({
      ok: true,
      checkedAt: '2026-08-23T10:00:00Z',
      checks: [
        { name: 'db', state: 'ok' },
        { name: 'memory', state: 'ok' },
        { name: 'prompt_route', state: 'ok' },
      ],
    });
  });

  it('parses a 503 body as degraded data instead of rejecting', async () => {
    // The backend returns the full degraded report WITH the 503 status —
    // here that is data, not a refusal.
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'degraded',
          service: 'arena-prompt',
          checked_at: '2026-08-23T10:01:00Z',
          checks: { db: 'fail: OperationalError', memory: 'ok', prompt_route: 'ok' },
        }),
        { status: 503 },
      ),
    );

    const readiness = await getPromptReadiness();

    expect(readiness.ok).toBe(false);
    expect(readiness.checkedAt).toBe('2026-08-23T10:01:00Z');
    expect(readiness.checks).toEqual([
      { name: 'db', state: 'fail: OperationalError' },
      { name: 'memory', state: 'ok' },
      { name: 'prompt_route', state: 'ok' },
    ]);
  });

  it('coerces odd check values and tolerates a missing checked_at', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ status: 'degraded', checks: { db: 0, memory: null }, extra: true }),
        { status: 200 },
      ),
    );

    const readiness = await getPromptReadiness();

    expect(readiness.ok).toBe(false);
    expect(readiness.checkedAt).toBe('');
    expect(readiness.checks).toEqual([
      { name: 'db', state: '0' },
      { name: 'memory', state: 'null' },
    ]);
  });

  it('throws only when the body is missing or unparseable', async () => {
    vi.mocked(apiFetchModule.apiFetch).mockResolvedValueOnce(
      new Response(null, { status: 503, headers: { 'X-Request-ID': 'req-ready-1' } }),
    );

    await expect(getPromptReadiness()).rejects.toThrow(
      'Prompt pipeline status unavailable (Request ID: req-ready-1)',
    );
  });
});
