/** Pure helpers for Agent idle “recent research” chips. */

const DISMISS_KEY = 'arena_agent_chip_dismissed_v1';
const MAX_DISMISSED = 40;

export type AgentHistoryLike = {
  task_id: string;
  title?: string | null;
  task_text?: string | null;
};

export function pickRecentAgentChips(
  history: AgentHistoryLike[],
  limit = 4,
  dismissedIds: ReadonlySet<string> = new Set(),
): Array<{ task_id: string; label: string; task_text: string }> {
  if (!Array.isArray(history) || limit <= 0) return [];
  const out: Array<{ task_id: string; label: string; task_text: string }> = [];
  for (const item of history) {
    if (!item?.task_id) continue;
    if (dismissedIds.has(item.task_id)) continue;
    const task_text = (item.task_text || '').trim();
    if (!task_text) continue;
    const label = (item.title?.trim() || task_text).slice(0, 72);
    out.push({ task_id: item.task_id, label, task_text });
    if (out.length >= limit) break;
  }
  return out;
}

export function loadDismissedAgentChipIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, MAX_DISMISSED),
    );
  } catch {
    return new Set();
  }
}

function persistDismissed(ids: Set<string>): void {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...ids].slice(0, MAX_DISMISSED)));
  } catch {
    /* ignore */
  }
}

/** Hide one chip locally (does not delete server history). */
export function dismissAgentChip(taskId: string): Set<string> {
  const next = loadDismissedAgentChipIds();
  if (taskId) next.add(taskId);
  persistDismissed(next);
  return next;
}

/** Show all chips again (clears local dismiss list). */
export function clearDismissedAgentChips(): Set<string> {
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* ignore */
  }
  return new Set();
}
