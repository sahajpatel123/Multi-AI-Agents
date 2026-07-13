import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './tokenStorage';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

export type ApiFetchOptions = RequestInit & { skipAuthRefresh?: boolean };

async function doRefresh(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;

  try {
    const r = await fetch(`${API}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!r.ok) {
      clearTokens();
      return false;
    }
    const data = (await r.json()) as {
      access_token?: string;
      refresh_token?: string;
    };
    if (!data.access_token || !data.refresh_token) {
      clearTokens();
      return false;
    }
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

function mergeHeaders(
  token: string | null,
  options: RequestInit,
): Record<string, string> {
  const hasBody = options.body !== undefined && options.body !== null;
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (hasBody && !isForm) {
    headers['Content-Type'] = 'application/json';
  }
  const oh = options.headers;
  if (oh) {
    if (oh instanceof Headers) {
      oh.forEach((v, k) => {
        headers[k] = v;
      });
    } else {
      Object.assign(headers, oh as Record<string, string>);
    }
  }
  if (isForm) {
    delete headers['Content-Type'];
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Auth endpoints where attempting a token refresh on 401 would cause an
 * infinite loop or is semantically meaningless (login, register, the
 * refresh itself, logout). Other /api/auth/* paths like /api/auth/me
 * and /api/auth/user/usage ARE protected endpoints that should trigger
 * refresh when the access token expires.
 */
const AUTH_PATHS_NO_REFRESH = [
  '/api/auth/refresh',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
];

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { skipAuthRefresh, ...fetchOpts } = options;
  const token = getAccessToken();
  const headers = mergeHeaders(token, fetchOpts);

  const res = await fetch(`${API}${path}`, {
    ...fetchOpts,
    headers,
  });

  if (
    res.status === 401 &&
    !skipAuthRefresh &&
    !AUTH_PATHS_NO_REFRESH.some(skipPath => path.includes(skipPath))
  ) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = doRefresh().finally(() => {
        isRefreshing = false;
        refreshPromise = null;
      });
    }

    const refreshed = await refreshPromise;
    if (refreshed) {
      const newToken = getAccessToken();
      const retryHeaders = mergeHeaders(newToken, fetchOpts);
      return fetch(`${API}${path}`, {
        ...fetchOpts,
        headers: retryHeaders,
      });
    }

    window.dispatchEvent(new Event('auth:session-expired'));
    throw new Error('Session expired');
  }

  return res;
}
