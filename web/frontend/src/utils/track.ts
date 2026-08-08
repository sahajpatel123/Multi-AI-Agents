import { fetchWithTimeout } from '../lib/apiFetch';

const getCurrentSessionId = (): string => {
  // localStorage can throw in private mode, with quota exceeded, or
  // under enterprise storage-disable policies. Tracking must never
  // break the UI, so fall back to the sentinel rather than bubble.
  try {
    return localStorage.getItem('arena_session_id') || 'unknown-session';
  } catch {
    return 'unknown-session';
  }
};

// Analytics is fire-and-forget. A short timeout caps the worst case
// of a hung backend holding a zombie Promise in the event loop.
const TRACK_TIMEOUT_MS = 5_000;

const track = async (
  eventType: string,
  personaId?: string,
  agentId?: string,
  metadata?: Record<string, unknown>,
) => {
  try {
    await fetchWithTimeout(
      '/api/analytics/event',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: getCurrentSessionId(),
          event_type: eventType,
          persona_id: personaId || null,
          agent_id: agentId || null,
          metadata: metadata || null,
        }),
      },
      TRACK_TIMEOUT_MS,
    );
  } catch {
    // Tracking must never break the UI.
  }
};

export default track;