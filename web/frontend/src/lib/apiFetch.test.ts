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
});