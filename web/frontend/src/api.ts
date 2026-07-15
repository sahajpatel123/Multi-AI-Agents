/// <reference types="vite/client" />

import { apiFetch as bearerApiFetch, type ApiFetchOptions } from './lib/apiFetch';
import { clearTokens, getRefreshToken, setTokens } from './lib/tokenStorage';
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

export const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(
  /\/$/,
  '',
);
export const API_BASE = `${API_ORIGIN}/api`;

/** Re-export for modules that imported apiFetch from here. */
export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  return bearerApiFetch(path, options);
}

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

export class LocalExecutionRequiredError extends Error {
  status = 409;
  detail: {
    error: string;
    execution_environment: string;
    message: string;
    title?: string;
    install_url: string;
    handoff_spec: string;
  };

  constructor(detail: LocalExecutionRequiredError['detail']) {
    super(detail.message || 'This task needs your machine. Powered by Condura.');
    this.name = 'LocalExecutionRequiredError';
    this.detail = detail;
  }
}

function asLocalExecutionDetail(data: unknown): LocalExecutionRequiredError['detail'] | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { detail?: unknown; error?: string };
  const detail = (d.detail && typeof d.detail === 'object' ? d.detail : d) as Record<string, unknown>;
  if (detail.error !== 'requires_local_execution') return null;
  return {
    error: 'requires_local_execution',
    execution_environment: String(detail.execution_environment || 'condura'),
    message: String(detail.message || 'This task needs your machine. Powered by Condura.'),
    title: detail.title ? String(detail.title) : undefined,
    install_url: String(detail.install_url || 'https://condura.app'),
    handoff_spec: String(detail.handoff_spec || 'arena.handoff.v1'),
  };
}

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

// ──────────────────────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────────────────────

type TokenAuthResponse = {
  success: boolean;
  access_token: string;
  refresh_token: string;
  user: User;
};

export async function register(name: string, email: string, password: string): Promise<User> {
  const res = await fetch(`${API_ORIGIN}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  if (!res.ok) {
    const err = await parseJsonSafely<{ detail?: string | { message?: string } }>(res);
    throw new ApiError(getErrorMessage(err, 'Registration failed'), res.status, err);
  }
  const data = await parseJsonSafely<TokenAuthResponse>(res);
  if (!data?.user || !data.access_token || !data.refresh_token) throw new Error('Empty response');
  setTokens(data.access_token, data.refresh_token);
  return data.user;
}

export async function login(email: string, password: string): Promise<User> {
  const res = await fetch(`${API_ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await parseJsonSafely<{ detail?: string | { message?: string } }>(res);
    throw new ApiError(getErrorMessage(err, 'Login failed'), res.status, err);
  }
  const data = await parseJsonSafely<TokenAuthResponse>(res);
  if (!data?.user || !data.access_token || !data.refresh_token) throw new Error('Empty response');
  setTokens(data.access_token, data.refresh_token);
  return data.user;
}

export async function logout(): Promise<void> {
  await bearerApiFetch('/api/auth/logout', {
    method: 'POST',
    skipAuthRefresh: true,
  }).catch(() => {});
  clearTokens();
}

export async function getMe(): Promise<User | null> {
  const res = await bearerApiFetch('/api/auth/me', { skipAuthRefresh: true });
  if (res.status === 401) return null;
  if (!res.ok) {
    const err = await parseJsonSafely<{ detail?: string }>(res);
    throw new ApiError(err?.detail || 'Failed to fetch user', res.status, err);
  }
  return parseJsonSafely<User>(res);
}

export type UserUsageResponse = {
  credits_used_today: number;
  credits_remaining_today: number;
  daily_limit: number;
  credits_used_week: number;
  credits_remaining_week: number;
  weekly_limit: number;
  total_tasks_month: number;
  usage_history: number[];
};

export async function getUserUsage(): Promise<UserUsageResponse> {
  const res = await apiFetch(`/api/user/usage`);
  if (!res.ok) {
    const err = await parseJsonSafely<{ detail?: string }>(res);
    throw new ApiError(err?.detail || 'Failed to load usage', res.status, err);
  }
  const data = await parseJsonSafely<UserUsageResponse>(res);
  if (!data) throw new Error('Empty usage response');
  return data;
}

export async function patchUserProfile(body: {
  name?: string;
  expertise_level?: string;
  expertise_domain?: string;
}): Promise<User> {
  const res = await apiFetch(`/api/user/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await parseJsonSafely<{ detail?: string }>(res);
    throw new ApiError(err?.detail || 'Failed to save profile', res.status, err);
  }
  const data = await parseJsonSafely<User>(res);
  if (!data) throw new Error('Empty response');
  return data;
}

export async function getUserTier(): Promise<TierStatus | null> {
  const res = await apiFetch(`/api/user/tier`);
  if (res.status === 401) return null;
  if (!res.ok) {
    const err = await parseJsonSafely<{ detail?: string }>(res);
    throw new ApiError(err?.detail || 'Failed to fetch tier', res.status, err);
  }
  return parseJsonSafely<TierStatus>(res);
}

export async function refreshToken(): Promise<User | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  const res = await fetch(`${API_ORIGIN}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) return null;
  const data = await parseJsonSafely<TokenAuthResponse>(res);
  if (!data?.access_token || !data.refresh_token) return null;
  setTokens(data.access_token, data.refresh_token);
  return data.user ?? null;
}

export async function saveMemory(sessionId: string, trigger: 'session_end' | 'new_chat' | 'manual'): Promise<void> {
  const res = await apiFetch(`/api/memory/save`, {
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
  const res = await apiFetch(`/api/personas`);
  if (!res.ok) {
    throw new Error('Failed to load personas');
  }
  return (await parseJsonSafely<ApiPersona[]>(res)) || [];
}

export async function getPanel(): Promise<SavedPanel> {
  const res = await apiFetch(`/api/panel`);
  if (!res.ok) {
    const err = await parseJsonSafely<{ detail?: { message?: string } | string }>(res);
    throw new Error(getErrorMessage(err, 'Failed to load panel'));
  }
  return (await parseJsonSafely<SavedPanel>(res)) || { slot_1: '', slot_2: '', slot_3: '', slot_4: '' };
}

export async function savePanel(panel: SavedPanel): Promise<SavedPanel> {
  const res = await apiFetch(`/api/panel/save`, {
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
  const res = await apiFetch(`/api/saved`);
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
  const res = await apiFetch(`/api/saved`, {
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
  const res = await apiFetch(`/api/saved/${id}`, {
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
  const response = await apiFetch(`/api/prompt`, {
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

/**
 * Live stream preview for Arena cards: full JSON when possible, otherwise a
 * partial `one_liner` field as tokens arrive. After agent_done the buffer is
 * often the plain one_liner string. Returns empty when nothing user-facing yet.
 */
export function extractStreamingPreview(rawText: string): string {
  if (!rawText) return '';
  const complete = parseStreamedAgentPreview(rawText);
  if (complete) return complete;

  const trimmed = rawText.trim();
  if (trimmed.startsWith('[Error')) return trimmed;

  // Partial JSON: `"one_liner": "…` may still be open while tokens stream.
  const match = rawText.match(/"one_liner"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (match) {
    try {
      return JSON.parse(`"${match[1]}"`) as string;
    } catch {
      return match[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
  }

  // Completed agent buffer is the plain one_liner (not JSON).
  if (!trimmed.startsWith('{') && !trimmed.startsWith('```')) {
    return trimmed;
  }

  return '';
}

export async function streamPrompt(
  prompt: string,
  callbacks: StreamCallbacks,
  sessionId?: string,
  personaIds?: string[],
  signal?: AbortSignal,
): Promise<void> {
  const response = await apiFetch(`/api/prompt/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, session_id: sessionId, persona_ids: personaIds }),
    signal,
  });

  if (!response.ok) {
    const error = await parseJsonSafely<{ detail?: string | { message?: string } }>(response);
    if (response.status === 429) {
      throw new Error(
        getErrorMessage(
          error,
          'Daily message limit reached. Resets at midnight UTC — or upgrade for more headroom.',
        ),
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(getErrorMessage(error, 'Sign in to run this prompt in Arena.'));
    }
    throw new Error(getErrorMessage(error, 'Failed to start stream'));
  }

  if (!response.body) throw new Error('No response body');

  await consumeSseStream(response.body, signal, (event, data) => {
    switch (event) {
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
  });
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
  signal?: AbortSignal,
): Promise<void> {
  const response = await apiFetch(`/api/debate/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });

  if (!response.ok) {
    const error = await parseJsonSafely<{ detail?: string }>(response);
    throw new Error(getErrorMessage(error, 'Failed to start debate stream'));
  }

  if (!response.body) throw new Error('No response body');

  await consumeSseStream(response.body, signal, (event, data) => {
    switch (event) {
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
  });
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
  signal?: AbortSignal,
): Promise<void> {
  const response = await apiFetch(`/api/discuss/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });

  if (!response.ok) {
    const error = await parseJsonSafely<{ detail?: string }>(response);
    throw new Error(getErrorMessage(error, 'Failed to start discuss stream'));
  }

  if (!response.body) throw new Error('No response body');

  await consumeSseStream(response.body, signal, (event, data) => {
    switch (event) {
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
  });
}

// Shared SSE consumer — handles AbortSignal-driven cancellation so
// navigating away mid-stream cleans up the open connection instead
// of leaving it hanging until the server closes.
async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal | undefined,
  dispatch: (event: string, data: any) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Bridge AbortSignal → reader.cancel(). If the caller cancels
  // (route change, retry, unmount), we both stop reading and tear
  // down the underlying stream — otherwise the body sits open until
  // the server-side generator finishes.
  const onAbort = () => {
    void reader.cancel().catch(() => {});
  };
  if (signal) {
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      buffer = parseSseBuffer(buffer, dispatch);
    }
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

function parseSseBuffer(buffer: string, dispatch: (event: string, data: any) => void): string {
  const lines = buffer.split('\n');
  const remainder = lines.pop() || '';
  let currentEvent = '';
  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith('data: ') && currentEvent) {
      try {
        dispatch(currentEvent, JSON.parse(line.slice(6)));
      } catch {
        // Skip malformed JSON — server may have flushed a partial
        // event during shutdown; next event will be a fresh frame.
      }
      currentEvent = '';
    }
  }
  return remainder;
}

// ──────────────────────────────────────────────────────────────
// Session Management
// ──────────────────────────────────────────────────────────────

export async function getSession(sessionId: string): Promise<SessionData | null> {
  try {
    const response = await apiFetch(`/api/session/${sessionId}`);
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
    const response = await apiFetch(`/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────
// Agent Mode (7-stage pipeline)
// ──────────────────────────────────────────────────────────────

export type AgentTaskTemplate = {
  id: string;
  category: string;
  title: string;
  icon: string;
  description: string;
  prompt_template: string;
  slots: string[];
  default_expertise: string;
  example: string;
  capability_id?: string;
  execution?: string;
  disabled?: boolean;
  disabled_reason?: string;
};

export type AgentTemplatesResponse = {
  categories: Record<string, AgentTaskTemplate[]>;
};

export async function getAgentTemplates(): Promise<AgentTemplatesResponse> {
  const response = await apiFetch(`/api/agent/templates`);
  const data = await parseJsonSafely<AgentTemplatesResponse & { detail?: string }>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Failed to load templates'), response.status, data);
  }
  if (!data?.categories) throw new Error('Invalid templates response');
  return data;
}

export type TaskAnswerFeedback = {
  verdict: string;
  note: string | null;
  created_at?: string | null;
};

export async function getAgentTaskAnswerFeedback(taskId: string): Promise<TaskAnswerFeedback | null> {
  const response = await apiFetch(`/api/agent/tasks/${encodeURIComponent(taskId)}/feedback`);
  const data = await parseJsonSafely<TaskAnswerFeedback | null | { detail?: string }>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data as object, 'Failed to load feedback'), response.status, data);
  }
  return (data as TaskAnswerFeedback | null) ?? null;
}

export type AnswerFeedbackStats = {
  total: number;
  correct_pct: number;
  partial_pct: number;
  wrong_pct: number;
};

export async function postAgentTaskAnswerFeedback(
  taskId: string,
  body: { verdict: string; note?: string | null },
): Promise<{ success: boolean; feedback_stats: AnswerFeedbackStats }> {
  const response = await apiFetch(`/api/agent/tasks/${encodeURIComponent(taskId)}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verdict: body.verdict, note: body.note ?? null }),
  });
  const data = await parseJsonSafely<
    { success?: boolean; feedback_stats?: AnswerFeedbackStats; detail?: string } | null
  >(response);
  if (!data || !response.ok) {
    throw new ApiError(getErrorMessage(data, 'Failed to submit feedback'), response.status, data);
  }
  return { success: !!data.success, feedback_stats: data.feedback_stats! };
}

export async function getUserAnswerFeedbackStats(): Promise<AnswerFeedbackStats> {
  const response = await apiFetch(`/api/user/answer-feedback-stats`);
  const data = await parseJsonSafely<AnswerFeedbackStats & { detail?: string }>(response);
  if (!response.ok || !data) {
    throw new ApiError(getErrorMessage(data, 'Failed to load feedback stats'), response.status, data);
  }
  return data;
}

export type AgentStartResponse = {
  task_id: string;
  status: string;
  message?: string;
};

export type AgentStatusPayload = {
  task_id: string;
  status: string;
  current_stage?: string;
  stages?: Record<string, { status?: string }>;
};

export async function runAgentTask(
  task: string,
  options?: {
    expertise_level?: string;
    expertise_domain?: string;
    attachment_ids?: string[];
    mcp_integration_ids?: number[];
  },
): Promise<AgentStartResponse> {
  const response = await apiFetch(`/api/agent/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task,
      expertise_level: options?.expertise_level ?? 'curious',
      expertise_domain: options?.expertise_domain ?? '',
      attachment_ids: options?.attachment_ids ?? [],
      mcp_integration_ids: options?.mcp_integration_ids ?? [],
    }),
  });
  const data = await parseJsonSafely<
    AgentStartResponse & { detail?: string | { message?: string; error?: string } }
  >(response);
  if (!data) throw new Error('Empty response');
  if (!response.ok) {
    if (response.status === 409) {
      const local = asLocalExecutionDetail(data);
      if (local) throw new LocalExecutionRequiredError(local);
    }
    throw new ApiError(getErrorMessage(data, 'Agent task failed'), response.status, data);
  }
  return data;
}

export async function recordConduraHandoff(body: {
  capability: string;
  execution_env: string;
  session_id?: string;
  condura_run_id?: string;
  summary?: string;
  retention_class?: string;
  status?: string;
}): Promise<{ id: number; status: string; condura_run_id?: string | null }> {
  const response = await apiFetch(`/api/condura/handoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJsonSafely<{ id?: number; status?: string; condura_run_id?: string }>(response);
  if (!response.ok || !data?.id) {
    throw new ApiError('Failed to record handoff', response.status, data);
  }
  return { id: data.id, status: data.status || 'dispatched', condura_run_id: data.condura_run_id };
}

export async function postConduraHandoffEvent(
  handoffId: number,
  body: { event_id?: string; event_kind: string; payload?: Record<string, unknown> },
): Promise<void> {
  const response = await apiFetch(`/api/condura/handoff/${handoffId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ApiError('Failed to record handoff event', response.status);
  }
}

export async function saveConduraHandoffDraft(body: {
  capability: string;
  payload: Record<string, unknown>;
}): Promise<{ id: number }> {
  const response = await apiFetch(`/api/condura/handoff-drafts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJsonSafely<{ id?: number }>(response);
  if (!response.ok || !data?.id) {
    throw new ApiError('Failed to save handoff draft', response.status, data);
  }
  return { id: data.id };
}

export async function getConduraMigrationFlags(): Promise<{
  flags: Array<{
    id: number;
    kind: string;
    ref_id: string;
    affected_capability: string;
    surfaced_at?: string | null;
  }>;
}> {
  const response = await apiFetch(`/api/condura/migration-flags`);
  const data = await parseJsonSafely<{ flags?: Array<Record<string, unknown>> }>(response);
  if (!response.ok) return { flags: [] };
  return {
    flags: (data?.flags || []).map((f) => ({
      id: Number(f.id),
      kind: String(f.kind || ''),
      ref_id: String(f.ref_id || ''),
      affected_capability: String(f.affected_capability || ''),
      surfaced_at: f.surfaced_at ? String(f.surfaced_at) : null,
    })),
  };
}

export async function uploadAgentFile(file: File): Promise<{
  file_id: string;
  filename: string;
  type: string;
  content_preview: string;
  size_kb: number;
}> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiFetch(`/api/agent/upload`, {
    method: 'POST',
    body: formData,
  });
  const data = await parseJsonSafely<{
    file_id: string;
    filename: string;
    type: string;
    content_preview: string;
    size_kb: number;
    detail?: string;
  }>(response);
  if (!response.ok || !data?.file_id) {
    throw new ApiError(
      getErrorMessage(
        data as { detail?: string | { message?: string } },
        response.status === 413 ? 'File too large (max 10MB)' : 'Upload failed',
      ),
      response.status,
      data,
    );
  }
  return data;
}

export async function getMcpIntegrations(): Promise<any[]> {
  const response = await apiFetch(`/api/mcp/integrations`);
  const data = await parseJsonSafely<{ integrations?: any[]; detail?: string }>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Failed to load integrations'), response.status, data);
  }
  return data?.integrations ?? [];
}

export async function postMcpManualConnect(body: {
  service: string;
  access_token: string;
  display_name: string;
}): Promise<any> {
  const response = await apiFetch(`/api/mcp/connect/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJsonSafely<any>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Connect failed'), response.status, data);
  }
  return data;
}

export async function deleteMcpIntegration(integrationId: number): Promise<void> {
  const response = await apiFetch(`/api/mcp/integrations/${integrationId}`, {
    method: 'DELETE',
  });
  const data = await parseJsonSafely<{ detail?: string }>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Disconnect failed'), response.status, data);
  }
}

export async function getAgentStatus(taskId: string): Promise<AgentStatusPayload> {
  const response = await apiFetch(`/api/agent/status/${taskId}`);
  const data = await parseJsonSafely<AgentStatusPayload & { detail?: string | { message?: string } }>(
    response,
  );
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Status request failed'), response.status, data);
  }
  if (!data) throw new Error('Empty status response');
  return data;
}

export async function getAgentResult(taskId: string): Promise<unknown> {
  const response = await apiFetch(`/api/agent/result/${taskId}`);
  const data = await parseJsonSafely<{ detail?: string | { message?: string } }>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Result request failed'), response.status, data);
  }
  if (!data) throw new Error('Empty result response');
  return data;
}

export async function exportAgentTaskPdf(taskId: string): Promise<Blob> {
  const response = await apiFetch(`/api/agent/tasks/${encodeURIComponent(taskId)}/export/pdf`);
  if (!response.ok) {
    const err = await parseJsonSafely<{ detail?: string }>(response);
    throw new ApiError(getErrorMessage(err, 'Export failed'), response.status, err);
  }
  return response.blob();
}

export async function postAgentOrchestrate(body: {
  questions: string[];
  expertise_level?: string;
  expertise_domain?: string;
}): Promise<{ orchestration_id: string; task_ids: string[] }> {
  const response = await apiFetch(`/api/agent/orchestrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJsonSafely<{
    orchestration_id?: string;
    task_ids?: string[];
    detail?: string | { message?: string };
  }>(response);
  if (!data || !response.ok) {
    throw new ApiError(getErrorMessage(data, 'Orchestration failed'), response.status, data);
  }
  if (!data.orchestration_id || !data.task_ids) throw new Error('Invalid orchestration response');
  return { orchestration_id: data.orchestration_id, task_ids: data.task_ids };
}

export async function getAgentOrchestration(orchId: string): Promise<any> {
  const response = await apiFetch(`/api/agent/orchestrate/${encodeURIComponent(orchId)}`);
  const data = await parseJsonSafely<any>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Failed to load orchestration'), response.status, data);
  }
  return data;
}

export async function exportOrchestrationPdf(orchId: string): Promise<Blob> {
  const response = await apiFetch(
    `/api/agent/orchestrate/${encodeURIComponent(orchId)}/export/pdf`,
  );
  if (!response.ok) {
    const err = await parseJsonSafely<{ detail?: string }>(response);
    throw new ApiError(getErrorMessage(err, 'Export failed'), response.status, err);
  }
  return response.blob();
}

export type AgentChallengeItem = {
  challenger: string;
  challenge: string;
  model: string;
  status: string;
};

export type AgentChallengeResponse = {
  task_id: string;
  challenges: AgentChallengeItem[];
  challenger_count: number;
};

export async function challengeAgentAnswer(
  taskId: string,
  answer: string,
  taskContext: string,
): Promise<AgentChallengeResponse> {
  const response = await apiFetch(`/api/agent/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task_id: taskId,
      answer,
      task: taskContext,
    }),
  });
  const data = await parseJsonSafely<
    AgentChallengeResponse & { detail?: string | { message?: string } }
  >(response);
  if (!data) throw new Error('Empty response');
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Challenge failed'), response.status, data);
  }
  return data;
}

export type AgentRebuttalResponse = {
  rebuttal: string;
  status: string;
};

export async function getAgentRebuttal(
  task: string,
  answer: string,
  challenge: string,
): Promise<AgentRebuttalResponse> {
  const response = await apiFetch(`/api/agent/rebuttal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, answer, challenge }),
  });
  const data = await parseJsonSafely<AgentRebuttalResponse & { detail?: string | { message?: string } }>(
    response,
  );
  if (!data) throw new Error('Empty response');
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Rebuttal failed'), response.status, data);
  }
  return data;
}

export async function getAgentHistory(page: number = 1, perPage: number = 200): Promise<unknown> {
  const response = await apiFetch(
    `/api/agent/history?page=${page}&per_page=${perPage}`,
  );
  const data = await parseJsonSafely<{ detail?: string | { message?: string } }>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'History request failed'), response.status, data);
  }
  if (!data) throw new Error('Empty history response');
  return data;
}

export type AgentWatchlistItem = {
  id: string;
  question: string;
  interval_hours: number;
  expertise_level: string;
  expertise_domain: string;
  last_run_at: string | null;
  next_run_at: string;
  latest_task_id: string | null;
  run_count: number;
  is_active: boolean;
  created_at: string;
  latest_task: {
    task_id: string;
    title: string;
    created_at: string;
    final_score: number | null;
  } | null;
};

export async function getAgentWatchlist(): Promise<{
  items: AgentWatchlistItem[];
  active_count: number;
  active_cap: number;
}> {
  const response = await apiFetch(`/api/agent/watchlist`);
  const data = await parseJsonSafely<{
    items?: AgentWatchlistItem[];
    active_count?: number;
    active_cap?: number;
    detail?: string | { message?: string };
  }>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Watchlist request failed'), response.status, data);
  }
  if (!data) throw new Error('Empty watchlist response');
  return {
    items: data.items || [],
    active_count: data.active_count ?? 0,
    active_cap: data.active_cap ?? 10,
  };
}

export async function postAgentWatchlist(body: {
  question: string;
  interval_hours: number;
  expertise_level?: string;
  expertise_domain?: string;
}): Promise<AgentWatchlistItem> {
  const response = await apiFetch(`/api/agent/watchlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJsonSafely<AgentWatchlistItem & { detail?: string | { message?: string } }>(response);
  if (!data || !response.ok) {
    throw new ApiError(getErrorMessage(data, 'Could not add to watchlist'), response.status, data);
  }
  return data as AgentWatchlistItem;
}

export async function patchAgentWatchlist(
  itemId: string,
  body: { interval_hours?: number; is_active?: boolean },
): Promise<AgentWatchlistItem> {
  const response = await apiFetch(`/api/agent/watchlist/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJsonSafely<AgentWatchlistItem & { detail?: string | { message?: string } }>(response);
  if (!data || !response.ok) {
    throw new ApiError(getErrorMessage(data, 'Watchlist update failed'), response.status, data);
  }
  return data as AgentWatchlistItem;
}

export async function deleteAgentWatchlist(itemId: string): Promise<void> {
  const response = await apiFetch(`/api/agent/watchlist/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
  });
  const data = await parseJsonSafely<{ detail?: string | { message?: string } }>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Could not remove watchlist item'), response.status, data);
  }
}

export async function postCalibrationRate(
  taskId: string,
  rating: number,
): Promise<unknown> {
  const response = await apiFetch(`/api/calibration/rate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId, rating }),
  });
  const data = await parseJsonSafely<{ detail?: string | { message?: string } }>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Calibration rating failed'), response.status, data);
  }
  if (!data) throw new Error('Empty calibration response');
  return data;
}

export async function getCalibrationStats(): Promise<unknown> {
  const response = await apiFetch(`/api/calibration/stats`);
  const data = await parseJsonSafely<{ detail?: string | { message?: string } }>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Calibration stats failed'), response.status, data);
  }
  if (!data) throw new Error('Empty calibration stats');
  return data;
}

export async function getCalibrationRatingForTask(taskId: string): Promise<unknown> {
  const response = await apiFetch(
    `/api/calibration/rating/${encodeURIComponent(taskId)}`,
  );
  const data = await parseJsonSafely<{ detail?: string | { message?: string } }>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Calibration lookup failed'), response.status, data);
  }
  if (!data) throw new Error('Empty calibration lookup');
  return data;
}

export async function toggleAgentTaskLive(
  taskId: string,
  isLive?: boolean,
): Promise<unknown> {
  const response = await apiFetch(
    `/api/agent/tasks/${encodeURIComponent(taskId)}/live`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isLive === undefined ? {} : { is_live: isLive }),
    },
  );
  const data = await parseJsonSafely<{ detail?: string | { message?: string } }>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Live toggle failed'), response.status, data);
  }
  if (!data) throw new Error('Empty live toggle response');
  return data;
}

export async function markAgentLiveUpdatesRead(
  taskId: string,
  updateId?: string,
): Promise<unknown> {
  const response = await apiFetch(
    `/api/agent/tasks/${encodeURIComponent(taskId)}/live-updates/mark-read`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateId ? { update_id: updateId } : {}),
    },
  );
  const data = await parseJsonSafely<{ detail?: string | { message?: string } }>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Mark read failed'), response.status, data);
  }
  if (!data) throw new Error('Empty mark-read response');
  return data;
}

export async function renameAgentTask(
  taskId: string,
  title: string,
): Promise<{ success: boolean; title: string }> {
  const response = await apiFetch(
    `/api/agent/tasks/${encodeURIComponent(taskId)}/rename`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    },
  );
  const data = await parseJsonSafely<
    { success?: boolean; title?: string; detail?: string | { message?: string } }
  >(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Rename failed'), response.status, data);
  }
  if (!data || data.success !== true || typeof data.title !== 'string') {
    throw new Error('Invalid rename response');
  }
  return { success: true, title: data.title };
}

export async function deleteAgentTask(taskId: string): Promise<{ success: boolean }> {
  const response = await apiFetch(
    `/api/agent/tasks/${encodeURIComponent(taskId)}`,
    { method: 'DELETE' },
  );
  const data = await parseJsonSafely<{ success?: boolean; detail?: string | { message?: string } }>(
    response,
  );
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Delete failed'), response.status, data);
  }
  if (!data || data.success !== true) {
    throw new Error('Invalid delete response');
  }
  return { success: true };
}

export async function getMemoryContext(task: string = ''): Promise<unknown> {
  const q = encodeURIComponent(task);
  const response = await apiFetch(`/api/agent/memory/context?task=${q}`);
  const data = await parseJsonSafely<{ detail?: string | { message?: string } }>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Memory context failed'), response.status, data);
  }
  if (!data) throw new Error('Empty memory context');
  return data;
}

export async function submitTaskFeedback(
  taskId: string,
  feedback: string,
  note?: string,
): Promise<unknown> {
  const response = await apiFetch(`/api/agent/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId, feedback, note }),
  });
  const data = await parseJsonSafely<{ detail?: string | { message?: string } }>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Feedback failed'), response.status, data);
  }
  if (!data) throw new Error('Empty feedback response');
  return data;
}

export async function getAgentSavedTask(taskId: string): Promise<unknown> {
  const response = await apiFetch(
    `/api/agent/saved/${encodeURIComponent(taskId)}`,
  );
  const data = await parseJsonSafely<{ detail?: string | { message?: string } }>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Saved task not found'), response.status, data);
  }
  if (!data) throw new Error('Empty saved task response');
  return data;
}

function agentDetailMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const d = (data as { detail?: unknown }).detail;
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object' && 'message' in d && typeof (d as { message: string }).message === 'string') {
    return (d as { message: string }).message;
  }
  return getErrorMessage(data as { detail?: string | { message?: string } }, fallback);
}

export type RefineAgentResponse = {
  task_id: string;
  status: string;
  refinement_count?: number;
  message?: string;
};

export async function refineAgentAnswer(taskId: string, message: string): Promise<RefineAgentResponse> {
  const response = await apiFetch(`/api/agent/refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId, message }),
  });
  const data = await parseJsonSafely<RefineAgentResponse & { detail?: unknown }>(response);
  if (!response.ok) {
    throw new ApiError(agentDetailMessage(data, 'Refinement failed'), response.status, data);
  }
  if (!data) throw new Error('Empty refinement response');
  return data;
}

export type BridgeAgentResponse = {
  task_id: string;
  status: string;
  message?: string;
};

export async function verifyArenaAnswerInAgent(
  arenaAnswer: string,
  originalQuestion: string,
  winningPersona: string = '',
  arenaScore: number = 0,
): Promise<BridgeAgentResponse> {
  const response = await apiFetch(`/api/agent/verify-from-arena`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      arena_answer: arenaAnswer,
      original_question: originalQuestion,
      winning_persona: winningPersona,
      arena_score: arenaScore,
    }),
  });
  const data = await parseJsonSafely<BridgeAgentResponse & { detail?: unknown }>(response);
  if (!response.ok) {
    throw new ApiError(agentDetailMessage(data, 'Verification failed'), response.status, data);
  }
  if (!data?.task_id) throw new Error('Empty bridge response');
  return data;
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
  const response = await apiFetch(`/api/payments/subscribe`, {
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

/** Plus-only Agent Mode add-on (₹599/mo). Same checkout shape as `createSubscription`. */
export async function createAgentAddonSubscription(): Promise<CreateSubscriptionResponse & { razorpay_key?: string }> {
  const response = await apiFetch(`/api/payments/addon/agent/subscribe`, { method: 'POST' });
  const data = await parseJsonSafely<
    { detail?: string | { message?: string } } & CreateSubscriptionResponse & { razorpay_key?: string }
  >(response);
  if (!data) throw new Error('Empty response');
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Add-on checkout failed'), response.status, data);
  }
  return data as CreateSubscriptionResponse & { razorpay_key?: string };
}

export async function cancelAgentAddon(): Promise<{ success: boolean; message: string }> {
  const response = await apiFetch(`/api/payments/addon/agent/cancel`, { method: 'POST' });
  const data = await parseJsonSafely<{ detail?: string; success?: boolean; message?: string }>(response);
  if (!data) throw new Error('Empty response');
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Could not cancel add-on'), response.status, data);
  }
  return { success: !!data.success, message: data.message || '' };
}

export async function reactivateAgentAddon(): Promise<{ success: boolean; message: string }> {
  const response = await apiFetch(`/api/payments/addon/agent/reactivate`, { method: 'POST' });
  const data = await parseJsonSafely<{ detail?: string; success?: boolean; message?: string }>(response);
  if (!data) throw new Error('Empty response');
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Could not reactivate add-on'), response.status, data);
  }
  return { success: !!data.success, message: data.message || '' };
}

export async function verifyPayment(
  paymentId: string,
  subscriptionId: string,
  signature: string,
): Promise<{ status: string; tier: string; message?: string }> {
  const response = await apiFetch(`/api/payments/verify`, {
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
  const response = await apiFetch(`/api/payments/subscription`);
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
  const response = await apiFetch(`/api/payments/cancel`, { method: 'POST' });
  const data = await parseJsonSafely<{ detail?: string; status?: string; message?: string; access_until?: string }>(
    response,
  );
  if (!data) throw new Error('Empty response');
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Cancel failed'), response.status, data);
  }
  return data as { status: string; message: string; access_until: string };
}

// ──────────────────────────────────────────────────────────────
// Shared research rooms
// ──────────────────────────────────────────────────────────────

export async function createRoom(body: { name: string; task_id?: string }): Promise<any> {
  const response = await apiFetch(`/api/rooms/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJsonSafely<{ detail?: string } & Record<string, unknown>>(response);
  if (!data) throw new Error('Empty response');
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Could not create room'), response.status, data);
  }
  return data;
}

export async function getRoom(slug: string): Promise<any> {
  const response = await apiFetch(`/api/rooms/${encodeURIComponent(slug)}`);
  const data = await parseJsonSafely<{ detail?: string } & Record<string, unknown>>(response);
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data || {}, 'Room not found'), response.status, data);
  }
  return data;
}

export async function joinRoom(slug: string): Promise<any> {
  const response = await apiFetch(`/api/rooms/${encodeURIComponent(slug)}/join`, {
    method: 'POST',
  });
  const data = await parseJsonSafely<{ detail?: string } & Record<string, unknown>>(response);
  if (!data) throw new Error('Empty response');
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Could not join room'), response.status, data);
  }
  return data;
}

export async function addRoomTask(slug: string, taskId: string): Promise<any> {
  const response = await apiFetch(`/api/rooms/${encodeURIComponent(slug)}/add-task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId }),
  });
  const data = await parseJsonSafely<{ detail?: string } & Record<string, unknown>>(response);
  if (!data) throw new Error('Empty response');
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Could not add task'), response.status, data);
  }
  return data;
}

export async function removeRoomTask(slug: string, taskId: string): Promise<any> {
  const response = await apiFetch(
    `/api/rooms/${encodeURIComponent(slug)}/remove-task/${encodeURIComponent(taskId)}`,
    { method: 'POST' },
  );
  const data = await parseJsonSafely<{ detail?: string } & Record<string, unknown>>(response);
  if (!data) throw new Error('Empty response');
  if (!response.ok) {
    throw new ApiError(getErrorMessage(data, 'Could not remove task'), response.status, data);
  }
  return data;
}

export async function getRoomSynthesis(slug: string, force?: boolean): Promise<{
  synthesis: any;
  synthesis_updated_at: string | null;
}> {
  const qs = force ? '?force=true' : '';
  const response = await apiFetch(`/api/rooms/${encodeURIComponent(slug)}/synthesis${qs}`);
  const data = await parseJsonSafely<{ synthesis?: any; synthesis_updated_at?: string | null }>(response);
  if (!response.ok) {
    throw new ApiError('Could not load synthesis', response.status, data);
  }
  return {
    synthesis: data?.synthesis ?? null,
    synthesis_updated_at: data?.synthesis_updated_at ?? null,
  };
}

export async function getMyRooms(): Promise<{ rooms: any[] }> {
  const response = await apiFetch(`/api/rooms/my-rooms`);
  const data = await parseJsonSafely<{ rooms?: any[] }>(response);
  if (!response.ok) {
    return { rooms: [] };
  }
  return { rooms: data?.rooms ?? [] };
}

export async function deleteRoom(slug: string): Promise<void> {
  const response = await apiFetch(`/api/rooms/${encodeURIComponent(slug)}`, { method: 'DELETE' });
  if (!response.ok) {
    const data = await parseJsonSafely<{ detail?: string }>(response);
    throw new ApiError(getErrorMessage(data || {}, 'Could not delete room'), response.status, data);
  }
}
