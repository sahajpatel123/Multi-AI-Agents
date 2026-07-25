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

const track = async (
  eventType: string,
  personaId?: string,
  agentId?: string,
  metadata?: Record<string, unknown>,
) => {
  try {
    await fetch('/api/analytics/event', {
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
    });
  } catch {
    // Tracking must never break the UI.
  }
};

export default track;
