/**
 * Tests for the analytics track helper.
 *
 * `track` is the single frontend chokepoint for telemetry — App, AgentCard,
 * Sidebar, and PersonasPage all funnel their UI events through it. The
 * contract is intentionally fire-and-forget:
 *   - POST /api/analytics/event with JSON body
 *   - Never throw — a network or schema failure must not break the UI
 *   - persona_id / agent_id / metadata default to null when omitted
 *   - session_id is read from localStorage('arena_session_id'), falling
 *     back to 'unknown-session' if absent
 *
 * Drift here means either telemetry silently stops reaching the server
 * (analytics gaps) or a regression that crashes UI on a 5xx. We pin the
 * contract by mocking fetch + localStorage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import track from './track';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function lastCallBody(): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls.at(-1)!;
  const body = (init as RequestInit).body;
  return JSON.parse(String(body));
}

describe('track', () => {
  it('POSTs to /api/analytics/event with JSON content type', async () => {
    await track('arena_prompt_submitted');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/analytics/event');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('serializes event_type and null defaults for omitted params', async () => {
    await track('arena_prompt_submitted');
    expect(lastCallBody()).toEqual({
      session_id: 'unknown-session',
      event_type: 'arena_prompt_submitted',
      persona_id: null,
      agent_id: null,
      metadata: null,
    });
  });

  it('forwards persona_id and agent_id when provided', async () => {
    await track('arena_card_clicked', 'analyst', 'agent_1');
    expect(lastCallBody()).toMatchObject({
      event_type: 'arena_card_clicked',
      persona_id: 'analyst',
      agent_id: 'agent_1',
    });
  });

  it('forwards metadata when provided', async () => {
    await track('agent_refine_started', 'analyst', 'agent_1', { foo: 'bar', n: 42 });
    expect(lastCallBody()).toMatchObject({
      event_type: 'agent_refine_started',
      metadata: { foo: 'bar', n: 42 },
    });
  });

  it('reads session_id from localStorage("arena_session_id")', async () => {
    localStorage.setItem('arena_session_id', 'sess-abc-123');
    await track('page_view');
    expect(lastCallBody().session_id).toBe('sess-abc-123');
  });

  it('falls back to "unknown-session" when localStorage has no value', async () => {
    // localStorage.clear() in beforeEach already empties the store
    await track('page_view');
    expect(lastCallBody().session_id).toBe('unknown-session');
  });

  it('swallows fetch errors (never throws into the UI)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    // The contract is "tracking must never break the UI" — a throw here
    // would crash the calling component's render path.
    await expect(track('arena_prompt_submitted')).resolves.toBeUndefined();
  });

  it('swallows non-2xx responses without throwing', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' });
    await expect(track('agent_run_started')).resolves.toBeUndefined();
  });

  it('handles a JSON.stringify throw (circular metadata) without breaking the UI', async () => {
    // Build a self-referential object — JSON.stringify will throw.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(track('event', undefined, undefined, circular)).resolves.toBeUndefined();
    // Track must NOT call fetch when serialization fails — the error must
    // be caught at the outermost try, before any network egress.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('coerces empty-string ids to null (|| fallback is applied)', async () => {
    // The contract uses `personaId || null`, so empty string is treated as
    // "absent" and forwarded as null. Pin this — if a future edit ever
    // switches to a strict-preserving check (e.g. `??`), the telemetry
    // schema gets an empty string in the payload and downstream parsing
    // breaks. This test fails loudly so the contract change is deliberate.
    await track('e', '', '');
    expect(lastCallBody()).toMatchObject({ persona_id: null, agent_id: null });
  });
});
