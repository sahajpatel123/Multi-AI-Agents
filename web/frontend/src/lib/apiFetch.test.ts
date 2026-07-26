import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { apiFetch } from './apiFetch';

const API = 'http://localhost:8000';

const buildResponse = (status: number, body: unknown = {}): Response =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    headers: new Headers({ 'content-type': 'application/json' }),
  } as unknown as Response);

describe('apiFetch', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends Authorization header when access token is present', async () => {
    localStorage.setItem('arena_access_token', 'tok-1');
    localStorage.setItem('arena_refresh_token', 'ref-1');
    const fetchMock = vi.fn().mockResolvedValue(buildResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiFetch('/api/auth/me');
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/api/auth/me`);
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-1');
  });

  it('omits Authorization header when no token is stored', async () => {
    const fetchMock = vi.fn().mockResolvedValue(buildResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/health');
    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('sets Content-Type: application/json for object bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(buildResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'x', password: 'y' }),
    });
    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('does not set Content-Type for FormData bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(buildResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    const form = new FormData();
    form.append('file', new Blob(['x']), 'test.txt');
    await apiFetch('/api/agent/upload', { method: 'POST', body: form });
    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('refreshes token on 401 then retries the request', async () => {
    localStorage.setItem('arena_access_token', 'old-tok');
    localStorage.setItem('arena_refresh_token', 'old-ref');

    const refreshResponse = buildResponse(200, {
      access_token: 'new-tok',
      refresh_token: 'new-ref',
    });
    const meOk = buildResponse(200, { email: 'x' });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(buildResponse(401))   // first call: 401
      .mockResolvedValueOnce(refreshResponse)       // second call: refresh
      .mockResolvedValueOnce(meOk);                  // third call: retried me
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiFetch('/api/auth/me');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(localStorage.getItem('arena_access_token')).toBe('new-tok');
    // The retried call should use the new token.
    const lastCallInit = fetchMock.mock.calls[2][1] as RequestInit;
    const lastHeaders = lastCallInit.headers as Record<string, string>;
    expect(lastHeaders.Authorization).toBe('Bearer new-tok');
  });

  it('dispatches auth:session-expired when refresh fails', async () => {
    localStorage.setItem('arena_access_token', 'old-tok');
    localStorage.setItem('arena_refresh_token', 'old-ref');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(buildResponse(401))           // first call: 401
      .mockResolvedValueOnce(buildResponse(401, {}));      // refresh: 401
    vi.stubGlobal('fetch', fetchMock);

    const listener = vi.fn();
    window.addEventListener('auth:session-expired', listener);

    await expect(apiFetch('/api/auth/me')).rejects.toThrow('Session expired');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('arena_access_token')).toBeNull();
    expect(localStorage.getItem('arena_refresh_token')).toBeNull();
  });

  it('skips refresh when skipAuthRefresh is true', async () => {
    localStorage.setItem('arena_access_token', 'tok');
    localStorage.setItem('arena_refresh_token', 'ref');

    const fetchMock = vi.fn().mockResolvedValue(buildResponse(401));
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiFetch('/api/auth/me', { skipAuthRefresh: true });
    expect(res.status).toBe(401);
    // Only the original call — no refresh attempt.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips refresh for auth login/register/refresh/logout endpoints on 401', async () => {
    localStorage.setItem('arena_access_token', 'tok');
    localStorage.setItem('arena_refresh_token', 'ref');

    const fetchMock = vi.fn().mockResolvedValue(buildResponse(401));
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiFetch('/api/auth/login', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses exact-path match so /api/auth/login-history still triggers refresh (cycle 381)', async () => {
    // Substring matching (the previous behaviour) would treat any path
    // containing '/api/auth/login' as a no-refresh endpoint and leave
    // the user locked out. Switched to exact-path match — this test
    // pins the negative case so the bug can't regress.
    localStorage.setItem('arena_access_token', 'tok');
    localStorage.setItem('arena_refresh_token', 'ref');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(buildResponse(401))          // /api/auth/login-history → 401
      .mockResolvedValueOnce(buildResponse(200, {         // refresh succeeds
        access_token: 'new-tok',
        refresh_token: 'new-ref',
      }))
      .mockResolvedValueOnce(buildResponse(200));         // retry succeeds
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiFetch('/api/auth/login-history', { method: 'GET' });
    expect(res.status).toBe(200);
    // Original + refresh + retry = 3 calls.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('aborts the request when the timeout fires (cycle 390)', async () => {
    // Without a per-request timeout, a hung backend would leave the
    // user staring at a spinner until the browser's ~5min default.
    // Abort the request on a 50ms timer, assert the fetch receives
    // the abort signal AND the calling promise rejects.
    const abortSpy = vi.fn();
    // jsdom doesn't fire the AbortController abort handler unless the
    // signal is observed, so attach a real listener.
    const originalFetch = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          if (signal) {
            signal.addEventListener('abort', () => {
              abortSpy();
              reject(new DOMException('aborted', 'AbortError'));
            });
          }
        }),
    );
    vi.stubGlobal('fetch', originalFetch);

    await expect(
      apiFetch('/api/protected', { method: 'GET', timeoutMs: 50 }),
    ).rejects.toBeInstanceOf(DOMException);
    expect(abortSpy).toHaveBeenCalledTimes(1);
  });

  it('treats non-finite timeoutMs as disabled (cycle 406)', async () => {
    // NaN / Infinity / negative would otherwise be passed to
    // setTimeout which silently coerces to 0 or max-int — neither
    // is what the caller intended. Treat any non-finite or
    // non-positive value as "no timeout" so the fetch falls
    // through to the raw fetch().
    const fetchMock = vi.fn().mockResolvedValue(buildResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/protected', { timeoutMs: NaN })).resolves.toBeDefined();
    await expect(apiFetch('/api/protected', { timeoutMs: Infinity })).resolves.toBeDefined();
    await expect(apiFetch('/api/protected', { timeoutMs: -1 })).resolves.toBeDefined();
    // And the existing positive path still works.
    await expect(apiFetch('/api/protected', { timeoutMs: 5000 })).resolves.toBeDefined();
  });

  it('dedupes concurrent refresh attempts (cycle 409)', async () => {
    // Two simultaneous 401s must share a single refresh round-trip —
    // otherwise the backend gets two refresh POSTs, the second of which
    // might race with the token rotation. Pin the dedupe.
    localStorage.setItem('arena_access_token', 'old-tok');
    localStorage.setItem('arena_refresh_token', 'ref');

    let refreshCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/api/auth/refresh')) {
        refreshCalls++;
        return new Promise((resolve) => {
          // Hold the refresh open so both 401s race in.
          setTimeout(
            () =>
              resolve(
                buildResponse(200, {
                  access_token: 'new-tok',
                  refresh_token: 'new-ref',
                }),
              ),
            10,
          );
        });
      }
      // Initial: both protected endpoints 401. After refresh resolves
      // and tokens rotate, retries succeed.
      const isFirst = refreshCalls === 0;
      return Promise.resolve(
        buildResponse(isFirst || refreshCalls === 0 ? 401 : 200),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    // Kick off two 401-protected endpoints in parallel.
    const [r1, r2] = await Promise.all([
      apiFetch('/api/protected/a'),
      apiFetch('/api/protected/b'),
    ]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    // Critical: only ONE refresh round-trip happened.
    expect(refreshCalls).toBe(1);
  });
});