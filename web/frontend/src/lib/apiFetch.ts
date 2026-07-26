import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './tokenStorage';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

/** Per-request timeout (ms). Hung backends used to hang forever. */
const DEFAULT_TIMEOUT_MS = 30_000;

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

export type ApiFetchOptions = RequestInit & {
  skipAuthRefresh?: boolean;
  /** Per-request timeout in ms. Defaults to 30s. Pass 0 to disable. */
  timeoutMs?: number;
};

/**
 * Race a fetch against an AbortController-driven timeout. Without this,
 * a hung backend (TCP open, no response) leaves the user staring at a
 * spinner until the browser's default ~5min timeout fires.
 *
 * Exported so callers that need a timed fetch WITHOUT going through the
 * apiFetch auth-refresh dance (e.g. the auth endpoints themselves,
 * which deliberately skip refresh on 401) can still get the timeout
 * protection.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  // Three exit paths: negative → disable (callers can opt out), 0 →
  // disable, NaN/Infinity → disable (setTimeout would treat as 0 or
  // max-int, neither is what the caller intended).
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return fetch(input, init);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  // If the caller passed their own signal, abort ours when theirs fires.
  const externalSignal = init.signal;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

async function doRefresh(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;

  try {
    const r = await fetchWithTimeout(
      `${API}/api/auth/refresh`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      },
      DEFAULT_TIMEOUT_MS,
    );
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

/**
 * Exact-match check that ignores trailing slashes and query strings.
 * Substring matching (the previous behaviour) would treat a future
 * endpoint like /api/auth/login-history as a no-refresh path and
 * leave the user locked out.
 */
function isAuthPathNoRefresh(path: string): boolean {
  const cleanPath = path.split('?')[0].replace(/\/+$/, '');
  return AUTH_PATHS_NO_REFRESH.some((skipPath) => cleanPath === skipPath);
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { skipAuthRefresh, timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOpts } = options;
  const token = getAccessToken();
  const headers = mergeHeaders(token, fetchOpts);

  const res = await fetchWithTimeout(
    `${API}${path}`,
    { ...fetchOpts, headers },
    timeoutMs,
  );

  if (
    res.status === 401 &&
    !skipAuthRefresh &&
    !isAuthPathNoRefresh(path)
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
      return fetchWithTimeout(
        `${API}${path}`,
        { ...fetchOpts, headers: retryHeaders },
        timeoutMs,
      );
    }

    window.dispatchEvent(new Event('auth:session-expired'));
    throw new Error('Session expired');
  }

  return res;
}
