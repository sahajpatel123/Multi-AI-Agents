/** Pure helpers for Agent idle “recent research” chips. */

export type AgentHistoryLike = {
  task_id: string;
  title?: string | null;
  task_text?: string | null;
};

export function pickRecentAgentChips(
  history: AgentHistoryLike[],
  limit = 4,
): Array<{ task_id: string; label: string; task_text: string }> {
  if (!Array.isArray(history) || limit <= 0) return [];
  const out: Array<{ task_id: string; label: string; task_text: string }> = [];
  for (const item of history) {
    if (!item?.task_id) continue;
    const task_text = (item.task_text || '').trim();
    if (!task_text) continue;
    const label = (item.title?.trim() || task_text).slice(0, 72);
    out.push({ task_id: item.task_id, label, task_text });
    if (out.length >= limit) break;
  }
  return out;
}
