import type { PromptResponse, SessionTurn } from '../types';

/**
 * Rehydrate a stored session turn as a PromptResponse.
 *
 * The session id is passed explicitly: resuming a chat must not inherit the
 * currently-loaded session's id from React state, or saved takes and
 * discussion threads from the resumed chat get attributed to the old one.
 */
export function buildSessionTurnResponse(
  turn: SessionTurn,
  sessionId: string,
): PromptResponse {
  const scoredResponses = Object.entries(turn.agent_responses).map(
    ([agentId, response]) => ({
      response,
      score: agentId === turn.winner_id ? 100 : 75,
      is_winner: agentId === turn.winner_id,
    }),
  );

  return {
    session_id: sessionId,
    prompt: turn.prompt,
    prompt_category: turn.prompt_category || '',
    winner: turn.agent_responses[turn.winner_id],
    winner_agent_id: turn.winner_id,
    all_responses: scoredResponses,
    integrity: null,
    timestamp: turn.timestamp,
    tools_used: [],
  };
}
