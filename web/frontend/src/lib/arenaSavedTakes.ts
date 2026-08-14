import type { PromptResponse, SavedResponseItem, ScoredAgent } from '../types';

/**
 * Pure helpers for bulk-saving a full Arena round into the Saved library.
 * A take counts as saved when a bookmarked response exists for the same
 * session + agent; saving it again would toggle it off, so bulk save only
 * touches takes that are not already in the library.
 */
export function isTakeSaved(
  response: Pick<PromptResponse, 'session_id'>,
  take: Pick<ScoredAgent, 'response'>,
  savedItems: Pick<SavedResponseItem, 'session_id' | 'agent_id'>[],
): boolean {
  return savedItems.some(
    (item) =>
      item.session_id === response.session_id &&
      item.agent_id === take.response.agent_id,
  );
}

export function unsavedTakes(
  response: Pick<PromptResponse, 'session_id' | 'all_responses'>,
  savedItems: Pick<SavedResponseItem, 'session_id' | 'agent_id'>[],
): ScoredAgent[] {
  return response.all_responses.filter((take) => !isTakeSaved(response, take, savedItems));
}

/** Short, honest label for the save-all control. */
export function bulkSaveNotice(totalTakes: number, missingCount: number): string {
  if (missingCount === 0) {
    return totalTakes > 0
      ? `All ${totalTakes} takes are already saved`
      : 'Nothing to save yet';
  }
  return `Saving ${missingCount} take${missingCount === 1 ? '' : 's'}…`;
}
