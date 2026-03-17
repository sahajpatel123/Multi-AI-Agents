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
} from './types';

const API_BASE =
  `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api`;

// ──────────────────────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────────────────────

export async function register(email: string, password: string): Promise<User> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    const err = text ? JSON.parse(text) : {};
    throw new Error(err.detail || 'Registration failed');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!data) throw new Error('Empty response');
  return data as User;
}

export async function login(email: string, password: string): Promise<User> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  console.log('Login status:', res.status);
  if (!res.ok) {
    const text = await res.text();
    console.log('Login error response text:', text);
    const err = text ? JSON.parse(text) : {};
    console.log('Login error parsed:', JSON.stringify(err));
    throw new Error(err.detail || 'Login failed');
  }
  const text = await res.text();
  console.log('Login response text:', text);
  const data = text ? JSON.parse(text) : {};
  console.log('Login parsed data:', JSON.stringify(data));
  return data;
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

export async function getMe(): Promise<User | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function refreshToken(): Promise<User | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function saveMemory(sessionId: string, trigger: 'session_end' | 'new_chat' | 'manual'): Promise<void> {
  const res = await fetch(`${API_BASE}/memory/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
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
  const res = await fetch(`${API_BASE}/personas`);
  if (!res.ok) {
    throw new Error('Failed to load personas');
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

export async function getPanel(): Promise<SavedPanel> {
  const res = await fetch(`${API_BASE}/panel`, { credentials: 'include' });
  if (!res.ok) {
    const text = await res.text();
    const err = text ? JSON.parse(text) : {};
    throw new Error(err?.detail?.message || err?.detail || 'Failed to load panel');
  }
  const text = await res.text();
  return text ? JSON.parse(text) : { slot_1: '', slot_2: '', slot_3: '', slot_4: '' };
}

export async function savePanel(panel: SavedPanel): Promise<SavedPanel> {
  const res = await fetch(`${API_BASE}/panel/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(panel),
  });
  if (!res.ok) {
    const text = await res.text();
    const err = text ? JSON.parse(text) : {};
    throw new Error(err?.detail?.message || err?.detail || 'Failed to save panel');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  return data.panel || { slot_1: '', slot_2: '', slot_3: '', slot_4: '' };
}

export async function getSavedResponses(): Promise<SavedResponseItem[]> {
  const res = await fetch(`${API_BASE}/saved`, { credentials: 'include' });
  if (!res.ok) {
    const text = await res.text();
    const err = text ? JSON.parse(text) : {};
    throw new Error(err?.detail?.message || err?.detail || 'Failed to load saved responses');
  }
  const text = await res.text();
  const data = (text ? JSON.parse(text) : []) as Array<Record<string, unknown>>;
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
  const res = await fetch(`${API_BASE}/saved`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    const err = text ? JSON.parse(text) : {};
    throw new Error(err?.detail?.message || err?.detail || 'Failed to save response');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  return Number(data.id);
}

export async function deleteSavedResponse(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/saved/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    const err = text ? JSON.parse(text) : {};
    throw new Error(err?.detail?.message || err?.detail || 'Failed to delete saved response');
  }
}

export async function submitPrompt(
  prompt: string,
  sessionId?: string,
  personaIds?: string[],
): Promise<PromptResponse> {
  const response = await fetch(`${API_BASE}/prompt`, {
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
    const text = await response.text();
    const error = text ? JSON.parse(text) : {};
    throw new Error(error.detail || 'Failed to submit prompt');
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!data) throw new Error('Empty response');
  return data as PromptResponse;
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
  const response = await fetch(`${API_BASE}/prompt/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, session_id: sessionId, persona_ids: personaIds }),
  });

  if (!response.ok) {
    const text = await response.text();
    const error = text ? JSON.parse(text) : {};
    throw new Error(error.detail || 'Failed to start stream');
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
  const response = await fetch(`${API_BASE}/debate/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const text = await response.text();
    const error = text ? JSON.parse(text) : {};
    throw new Error(error.detail || 'Failed to start debate stream');
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
  const response = await fetch(`${API_BASE}/discuss/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const text = await response.text();
    const error = text ? JSON.parse(text) : {};
    throw new Error(error.detail || 'Failed to start discuss stream');
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
    const response = await fetch(`${API_BASE}/session/${sessionId}`);
    if (!response.ok) {
      return null;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
