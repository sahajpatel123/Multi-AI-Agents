/// <reference types="vite/client" />

import {
  PromptResponse,
  DebateRoundResponse,
  DebateMessage,
  DiscussChatMessage,
  DiscussResponse,
  SessionData,
  User,
  SavedResponseItem,
  TierStatus,
} from './types';

export const API_BASE =
  `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api`;

type RefreshResult = 'success' | 'unauthorized' | 'network_error' | 'failed';

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

let isRefreshing = false;
let refreshPromise: Promise<RefreshResult> | null = null;

async function parseJsonSafely<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function getErrorMessage(
  error: { detail?: { message?: string } | string } | { detail?: string } | null,
  fallback: string,
): string {
  const detail = error?.detail;
  if (typeof detail === 'string') {
    return detail || fallback;
  }
  if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') {
    return detail.message || fallback;
  }
  return fallback;
}

export async function attemptTokenRefresh(): Promise<RefreshResult> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then((response) => {
      isRefreshing = false;
      refreshPromise = null;

      if (response.ok) return 'success';
      if (response.status === 401) return 'unauthorized';
      return 'failed';
    })
    .catch(() => {
      isRefreshing = false;
      refreshPromise = null;
      return 'network_error';
    });

  return refreshPromise;
}

export async function refreshSession(): Promise<RefreshResult> {
  return attemptTokenRefresh();
}

export async function apiFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
  });

  if (response.status === 401) {
    const refreshed = await attemptTokenRefresh();

    if (refreshed === 'success') {
      return fetch(url, {
        ...options,
        credentials: 'include',
      });
    }
  }

  return response;
}

// ──────────────────────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────────────────────

export async function register(email: string, password: string): Promise<User> {
  const res = await apiFetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await parseJsonSafely<{ detail?: string }>(res);
    throw new ApiError(err?.detail || 'Registration failed', res.status, err);
  }
  const data = await parseJsonSafely<User>(res);
  if (!data) throw new Error('Empty response');
  return data;
}

export async function login(email: string, password: string): Promise<User> {
  const res = await apiFetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await parseJsonSafely<{ detail?: string }>(res);
    throw new ApiError(err?.detail || 'Login failed', res.status, err);
  }
  const data = await parseJsonSafely<User>(res);
  if (!data) throw new Error('Empty response');
  return data;
}

export async function logout(): Promise<void> {
  await apiFetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
  });
}

export async function getMe(): Promise<User | null> {
  const res = await apiFetch(`${API_BASE}/auth/me`);
  if (res.status === 401) return null;
  if (!res.ok) {
    const err = await parseJsonSafely<{ detail?: string }>(res);
    throw new ApiError(err?.detail || 'Failed to fetch user', res.status, err);
  }
  return parseJsonSafely<User>(res);
}

export async function getUserTier(): Promise<TierStatus | null> {
  const res = await apiFetch(`${API_BASE}/user/tier`);
  if (res.status === 401) return null;
  if (!res.ok) {
    const err = await parseJsonSafely<{ detail?: string }>(res);
    throw new ApiError(err?.detail || 'Failed to fetch tier', res.status, err);
  }
  return parseJsonSafely<TierStatus>(res);
}

export async function refreshToken(): Promise<User | null> {
  const refreshResult = await refreshSession();
  if (refreshResult !== 'success') {
    return null;
  }
  return getMe();
}

export async function saveMemory(sessionId: string, trigger: 'session_end' | 'new_chat' | 'manual'): Promise<void> {
  const res = await apiFetch(`${API_BASE}/memory/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      trigger,
    }),
  });

  if (!res.ok) {
    throw new Error('Failed to save memory');
  }
}

export interface ApiPersona {
  persona_id: string;
  name: string;
  color: string;
  bg_tint: string;
  quote: string;
  description: string;
  temperature: number;
  provider: string;
  is_locked: boolean;
  display_order: number;
}

export interface SavedPanel {
  slot_1: string;
  slot_2: string;
  slot_3: string;
  slot_4: string;
}

export async function getPersonas(): Promise<ApiPersona[]> {
  const res = await apiFetch(`${API_BASE}/personas`);
  if (!res.ok) {
    throw new Error('Failed to load personas');
  }
  return (await parseJsonSafely<ApiPersona[]>(res)) || [];
}

export async function getPanel(): Promise<SavedPanel> {
  const res = await apiFetch(`${API_BASE}/panel`);
  if (!res.ok) {
    const err = await parseJsonSafely<{ detail?: { message?: string } | string }>(res);
    throw new Error(getErrorMessage(err, 'Failed to load panel'));
  }
  return (await parseJsonSafely<SavedPanel>(res)) || { slot_1: '', slot_2: '', slot_3: '', slot_4: '' };
}

export async function savePanel(panel: SavedPanel): Promise<SavedPanel> {
  const res = await apiFetch(`${API_BASE}/panel/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(panel),
  });
  if (!res.ok) {
    const err = await parseJsonSafely<{ detail?: { message?: string } | string }>(res);
    throw new Error(getErrorMessage(err, 'Failed to save panel'));
  }
  const data = (await parseJsonSafely<{ panel?: SavedPanel }>(res)) || {};
  return data.panel || { slot_1: '', slot_2: '', slot_3: '', slot_4: '' };
}

export async function getSavedResponses(): Promise<SavedResponseItem[]> {
  const res = await apiFetch(`${API_BASE}/saved`);
  if (!res.ok) {
    const err = await parseJsonSafely<{ detail?: { message?: string } | string }>(res);
    throw new Error(getErrorMessage(err, 'Failed to load saved responses'));
  }
  const data = ((await parseJsonSafely<Array<Record<string, unknown>>>(res)) || []);
  return data.map((item) => ({
    id: Number(item.id),
    session_id: String(item.session_id || ''),
    turn_id: `${item.session_id || ''}:${item.agent_id || ''}`,
    prompt: String(item.prompt || ''),
    agent_id: String(item.agent_id || ''),
    persona_id: item.persona_id ? String(item.persona_id) : undefined,
    persona_name: item.persona_name ? String(item.persona_name) : undefined,
    persona_color: item.persona_color ? String(item.persona_color) : undefined,
    score: typeof item.score === 'number' ? item.score : null,
    confidence: typeof item.confidence === 'number' ? item.confidence : null,
    one_liner: String(item.one_liner || ''),
    verdict: String(item.verdict || ''),
    timestamp: String(item.saved_at || ''),
  }));
}

export async function saveResponse(payload: {
  session_id: string;
  agent_id: string;
  persona_id: string;
  persona_name: string;
  persona_color: string;
  prompt: string;
  one_liner: string;
  verdict: string;
  score?: number;
  confidence?: number;
}): Promise<number> {
  const res = await apiFetch(`${API_BASE}/saved`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await parseJsonSafely<{ detail?: { message?: string } | string }>(res);
    throw new Error(getErrorMessage(err, 'Failed to save response'));
  }
  const data = (await parseJsonSafely<{ id?: number }>(res)) || {};
  return Number(data.id);
}

export async function deleteSavedResponse(id: number): Promise<void> {
  const res = await apiFetch(`${API_BASE}/saved/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await parseJsonSafely<{ detail?: { message?: string } | string }>(res);
    throw new Error(getErrorMessage(err, 'Failed to delete saved response'));
  }
}

export async function submitPrompt(
  prompt: string,
  sessionId?: string,
  personaIds?: string[],
): Promise<PromptResponse> {
  const response = await apiFetch(`${API_BASE}/prompt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      session_id: sessionId,
      persona_ids: personaIds,
    }),
  });

  if (!response.ok) {
    const error = await parseJsonSafely<{ detail?: string }>(response);
    throw new Error(getErrorMessage(error, 'Failed to submit prompt'));
  }

  const data = await parseJsonSafely<PromptResponse>(response);
  if (!data) throw new Error('Empty response');
  return data;
}

export interface StreamCallbacks {
  onPipeline?: (data: { passed: boolean; category: string; rejection_reason: string | null }) => void;
  onToken?: (data: { agent_id: string; token: string }) => void;
  onAgentDone?: (data: { agent_id: string }) => void;
  onAgentError?: (data: { agent_id: string; error: string }) => void;
  onResult?: (data: PromptResponse) => void;
  onError?: (data: { detail: string }) => void;
}

export function parseStreamedAgentPreview(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  let normalized = trimmed;
  if (normalized.startsWith('```')) {
    const lines = normalized.split('\n');
    normalized = lines.slice(1).join('\n');
    if (normalized.endsWith('```')) {
      normalized = normalized.slice(0, -3);
    }
    normalized = normalized.trim();
  }

  try {
    const parsed = JSON.parse(normalized) as { one_liner?: unknown };
    return typeof parsed.one_liner === 'string' ? parsed.one_liner : null;
  } catch {
    return null;
  }
}

export async function streamPrompt(
  prompt: string,
  callbacks: StreamCallbacks,
  sessionId?: string,
  personaIds?: string[],
): Promise<void> {
  const response = await apiFetch(`${API_BASE}/prompt/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, session_id: sessionId, persona_ids: personaIds }),
  });

  if (!response.ok) {
    const error = await parseJsonSafely<{ detail?: string }>(response);
    throw new Error(getErrorMessage(error, 'Failed to start stream'));
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from buffer
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ') && currentEvent) {
        try {
          const data = JSON.parse(line.slice(6));
          switch (currentEvent) {
            case 'pipeline':
              callbacks.onPipeline?.(data);
              break;
            case 'token':
              callbacks.onToken?.(data);
              break;
            case 'agent_done':
              callbacks.onAgentDone?.(data);
              break;
            case 'agent_error':
              callbacks.onAgentError?.(data);
              break;
            case 'result':
              callbacks.onResult?.(data);
              break;
            case 'error':
              callbacks.onError?.(data);
              break;
          }
        } catch {
          // Skip malformed JSON
        }
        currentEvent = '';
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Debate Mode
// ──────────────────────────────────────────────────────────────

export interface DebateStreamCallbacks {
  onReactionToken?: (data: { agent_id: string; token: string }) => void;
  onReactionDone?: (data: { agent_id: string }) => void;
  onResult?: (data: DebateRoundResponse) => void;
  onError?: (data: { detail: string }) => void;
}

export async function streamDebateRound(
  params: {
    original_prompt: string;
    challenged_agent_id: string;
    challenged_verdict: string;
    round_number: number;
    debate_history: DebateMessage[];
    user_interjection?: string | null;
    session_id?: string;
    persona_ids?: string[];
  },
  callbacks: DebateStreamCallbacks,
): Promise<void> {
  const response = await apiFetch(`${API_BASE}/debate/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await parseJsonSafely<{ detail?: string }>(response);
    throw new Error(getErrorMessage(error, 'Failed to start debate stream'));
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ') && currentEvent) {
        try {
          const data = JSON.parse(line.slice(6));
          switch (currentEvent) {
            case 'reaction_token':
              callbacks.onReactionToken?.(data);
              break;
            case 'reaction_done':
              callbacks.onReactionDone?.(data);
              break;
            case 'result':
              callbacks.onResult?.(data);
              break;
            case 'error':
              callbacks.onError?.(data);
              break;
          }
        } catch {
          // Skip malformed JSON
        }
        currentEvent = '';
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Discuss Mode (1-on-1)
// ──────────────────────────────────────────────────────────────

export interface DiscussStreamCallbacks {
  onToken?: (data: { agent_id: string; token: string }) => void;
  onResult?: (data: DiscussResponse) => void;
  onError?: (data: { detail: string }) => void;
}

export async function streamDiscuss(
  params: {
    agent_id: string;
    message: string;
    conversation_history: DiscussChatMessage[];
    original_verdict: string;
    original_prompt: string;
    session_id?: string;
    persona_ids?: string[];
  },
  callbacks: DiscussStreamCallbacks,
): Promise<void> {
  const response = await apiFetch(`${API_BASE}/discuss/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await parseJsonSafely<{ detail?: string }>(response);
    throw new Error(getErrorMessage(error, 'Failed to start discuss stream'));
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ') && currentEvent) {
        try {
          const data = JSON.parse(line.slice(6));
          switch (currentEvent) {
            case 'token':
              callbacks.onToken?.(data);
              break;
            case 'result':
              callbacks.onResult?.(data);
              break;
            case 'error':
              callbacks.onError?.(data);
              break;
          }
        } catch {
          // Skip malformed JSON
        }
        currentEvent = '';
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Session Management
// ──────────────────────────────────────────────────────────────

export async function getSession(sessionId: string): Promise<SessionData | null> {
  try {
    const response = await apiFetch(`${API_BASE}/session/${sessionId}`);
    if (!response.ok) {
      return null;
    }
    return parseJsonSafely<SessionData>(response);
  } catch {
    return null;
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const response = await apiFetch(`${API_BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────
// Payments (Razorpay subscriptions)
// ──────────────────────────────────────────────────────────────

export type CreateSubscriptionResponse = {
  subscription_id: string;
  key_id: string;
  plan_name: string;
  amount: number;
  currency: string;
};

export async function createSubscription(planKey: string): Promise<CreateSubscriptionResponse> {
  const response = await apiFetch(`${API_BASE}/payments/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_key: planKey }),
  });
  const data = await parseJsonSafely<{ detail?: string | { message?: string } } & CreateSubscriptionResponse>(response);
  if (!data) throw new Error('Empty response');
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Subscription failed'), response.status, data);
  }
  return data as CreateSubscriptionResponse;
}

export async function verifyPayment(
  paymentId: string,
  subscriptionId: string,
  signature: string,
): Promise<{ status: string; tier: string; message?: string }> {
  const response = await apiFetch(`${API_BASE}/payments/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_payment_id: paymentId,
      razorpay_subscription_id: subscriptionId,
      razorpay_signature: signature,
    }),
  });
  const data = await parseJsonSafely<{ detail?: string; status?: string; tier?: string }>(response);
  if (!data) throw new Error('Empty response');
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Verification failed'), response.status, data);
  }
  return data as { status: string; tier: string; message?: string };
}

export type SubscriptionStatusResponse = {
  has_subscription: boolean;
  tier: string;
  plan_name?: string;
  status?: string;
  billing_period?: string;
  amount?: number;
  currency?: string;
  current_end?: string;
  payment_count?: number;
  razorpay_subscription_id?: string;
};

export async function getSubscriptionStatus(): Promise<SubscriptionStatusResponse> {
  const response = await apiFetch(`${API_BASE}/payments/subscription`);
  const data = await parseJsonSafely<SubscriptionStatusResponse>(response);
  if (!data) {
    return { has_subscription: false, tier: 'FREE' };
  }
  return data;
}

export async function cancelSubscription(): Promise<{
  status: string;
  message: string;
  access_until: string;
}> {
  const response = await apiFetch(`${API_BASE}/payments/cancel`, { method: 'POST' });
  const data = await parseJsonSafely<{ detail?: string; status?: string; message?: string; access_until?: string }>(
    response,
  );
  if (!data) throw new Error('Empty response');
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Cancel failed'), response.status, data);
  }
  return data as { status: string; message: string; access_until: string };
}
