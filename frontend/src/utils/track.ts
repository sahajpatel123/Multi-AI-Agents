const getCurrentSessionId = (): string => {
  return localStorage.getItem('arena_session_id') || 'unknown-session';
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
      credentials: 'include',
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
