import type { PromptContextItem, PromptResponse } from '../types';

/**
 * Follow-up round budget — mirrors backend/arena/core/followup.py so the
 * client never sends a context payload the API would reject.
 */
export const FOLLOW_UP_MAX_ITEMS = 8;
export const FOLLOW_UP_MAX_ITEM_CHARS = 1800;
export const FOLLOW_UP_MAX_TOTAL_CHARS = 12000;

export type FollowUpNameResolver = (agentId: string) => string | undefined;

/**
 * Build the prior-round context for a follow-up: the original question plus
 * each persona's verdict. Long verdicts are truncated per item and the tail
 * is dropped once the combined budget is exhausted so the oldest context
 * (the user's own question) always survives.
 */
export function buildFollowUpContext(
  response: PromptResponse,
  resolveName: FollowUpNameResolver = () => undefined,
): PromptContextItem[] {
  const items: PromptContextItem[] = [];
  const prompt = (response.prompt || '').trim();
  if (prompt) {
    items.push({
      role: 'user',
      content: prompt.slice(0, FOLLOW_UP_MAX_ITEM_CHARS),
    });
  }

  for (const scored of response.all_responses || []) {
    if (items.length >= FOLLOW_UP_MAX_ITEMS) break;
    const verdict = (scored.response?.verdict || '').trim();
    if (!verdict) continue;
    const agentId = scored.response.agent_id;
    items.push({
      role: 'assistant',
      agent_id: agentId,
      name: resolveName(agentId) || undefined,
      content: verdict.slice(0, FOLLOW_UP_MAX_ITEM_CHARS),
    });
  }

  // Approximate the server-side total budget (content + label overhead) and
  // keep the earliest messages when the combined transcript is too big.
  const kept: PromptContextItem[] = [];
  let total = 0;
  for (const item of items) {
    const labelOverhead = item.name ? item.name.length + 4 : 7;
    const cost = item.content.length + labelOverhead;
    if (total + cost > FOLLOW_UP_MAX_TOTAL_CHARS) break;
    kept.push(item);
    total += cost;
  }
  return kept;
}
