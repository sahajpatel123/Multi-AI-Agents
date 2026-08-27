/** Local pins for Agent research history (browser-only, best-effort). */

import { safeLocalStorage } from './safeStorage';

export const AGENT_HISTORY_PINS_STORAGE_KEY = 'arena_agent_history_pins_v1';
export const AGENT_HISTORY_PINS_MAX = 50;
export const AGENT_HISTORY_PIN_FILTER_ALL = 'all' as const;

/**
 * Notify subscribers in this tab after a pin write. Browsers only emit their
 * native `storage` event in other documents, so the synthetic event keeps any
 * other mounted history consumers in this document consistent too.
 */
function notifyAgentHistoryPinsChanged(newValue: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: AGENT_HISTORY_PINS_STORAGE_KEY,
        newValue,
      }),
    );
  } catch {
    /* locked-down iframe / older browser — best effort */
  }
}

export type AgentHistoryPinFilter = typeof AGENT_HISTORY_PIN_FILTER_ALL | 'pinned';

export const AGENT_HISTORY_PIN_FILTER_OPTIONS: readonly {
  value: AgentHistoryPinFilter;
  label: string;
}[] = [
  { value: AGENT_HISTORY_PIN_FILTER_ALL, label: 'All tasks' },
  { value: 'pinned', label: 'Pinned only' },
];

export type AgentHistoryPinItem = {
  id?: string | null;
  taskId?: string | null;
  task_id?: string | null;
};

function itemTaskId(item: AgentHistoryPinItem): string {
  const candidate = item.taskId ?? item.task_id ?? item.id;
  return typeof candidate === 'string' ? candidate.trim() : '';
}

function isKnownPinFilter(value: unknown): value is AgentHistoryPinFilter {
  return AGENT_HISTORY_PIN_FILTER_OPTIONS.some((option) => option.value === value);
}

export function agentHistoryPinFilterLabel(filter: AgentHistoryPinFilter): string {
  return (
    AGENT_HISTORY_PIN_FILTER_OPTIONS.find((option) => option.value === filter)?.label ||
    'All tasks'
  );
}

/** Filter history to browser-local pins without mutating the input list. */
export function filterAgentHistoryByPin<T extends AgentHistoryPinItem>(
  items: T[],
  filter: AgentHistoryPinFilter | null | undefined,
  pinnedTaskIds: readonly string[],
): T[] {
  const list = items || [];
  // Fail open if stale runtime state contains a removed future filter value.
  if (!isKnownPinFilter(filter) || filter === AGENT_HISTORY_PIN_FILTER_ALL) return [...list];
  const pins = new Set(normalizeAgentHistoryPins(pinnedTaskIds));
  return list.filter((item) => pins.has(itemTaskId(item)));
}

/** True when at least one task in the current retained history is pinned. */
export function agentHistoryPinFilterUseful(
  items: AgentHistoryPinItem[],
  pinnedTaskIds: readonly string[],
): boolean {
  const pins = new Set(normalizeAgentHistoryPins(pinnedTaskIds));
  return (items || []).some((item) => pins.has(itemTaskId(item)));
}

/**
 * Normalize untrusted storage into a bounded list of unique task ids.
 * Public for tests; returns a fresh array every time.
 */
export function normalizeAgentHistoryPins(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= AGENT_HISTORY_PINS_MAX) break;
  }
  return out;
}

function parseAgentHistoryPins(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return normalizeAgentHistoryPins(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

/** Load pinned task ids, falling back to an empty list on any failure. */
export function loadAgentHistoryPins(): string[] {
  return parseAgentHistoryPins(safeLocalStorage.getItem(AGENT_HISTORY_PINS_STORAGE_KEY));
}

/** Persist a bounded pin list. Swallows storage failures silently. */
export function persistAgentHistoryPins(ids: string[]): string[] {
  const next = normalizeAgentHistoryPins(ids);
  const serialized = JSON.stringify(next);
  try {
    safeLocalStorage.setItem(AGENT_HISTORY_PINS_STORAGE_KEY, serialized);
  } catch {
    /* private mode / quota — best effort */
  }
  notifyAgentHistoryPinsChanged(serialized);
  return next;
}

/**
 * Subscribe to pin changes from this document and other browser tabs.
 * Returns an unsubscribe callback and treats storage clears/corruption as an
 * empty pin list, matching `loadAgentHistoryPins`.
 */
export function subscribeToAgentHistoryPins(
  onChange: (ids: string[]) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== AGENT_HISTORY_PINS_STORAGE_KEY) return;
    onChange(parseAgentHistoryPins(event.newValue));
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

/** Toggle a task's pin state and persist the result. */
export function toggleAgentHistoryPin(taskId: string): string[] {
  const id = taskId.trim();
  const current = loadAgentHistoryPins();
  if (!id) return current;
  if (current.includes(id)) {
    return persistAgentHistoryPins(current.filter((pinned) => pinned !== id));
  }
  // Evict the oldest pin so a newly pinned task is never silently dropped
  // when the list is already at the cap.
  const next =
    current.length >= AGENT_HISTORY_PINS_MAX
      ? [...current.slice(current.length - (AGENT_HISTORY_PINS_MAX - 1)), id]
      : [...current, id];
  return persistAgentHistoryPins(next);
}

/**
 * Pin several tasks in one browser-local write.
 *
 * Requested tasks take priority over older pins, so a bulk action never
 * silently drops one of the selected rows until the 50-pin cap is reached.
 * The returned list is the same normalized value written to storage.
 */
export function pinAgentHistoryTasks(taskIds: readonly string[]): string[] {
  const requested = normalizeAgentHistoryPins(taskIds);
  const current = loadAgentHistoryPins();
  if (requested.length === 0) return current;

  const requestedSet = new Set(requested);
  const existing = current.filter((id) => !requestedSet.has(id));
  const roomForExisting = Math.max(0, AGENT_HISTORY_PINS_MAX - requested.length);
  return persistAgentHistoryPins([
    ...existing.slice(Math.max(0, existing.length - roomForExisting)),
    ...requested,
  ]);
}

/** Unpin several tasks in one browser-local write. */
export function unpinAgentHistoryTasks(taskIds: readonly string[]): string[] {
  const removing = new Set(normalizeAgentHistoryPins(taskIds));
  if (removing.size === 0) return loadAgentHistoryPins();
  return persistAgentHistoryPins(loadAgentHistoryPins().filter((id) => !removing.has(id)));
}

/** Remove pins for tasks being deleted; other pins survive. */
export function removeAgentHistoryPins(taskIds: readonly string[]): string[] {
  const removing = new Set(taskIds.filter((id) => typeof id === 'string' && id.length > 0));
  if (removing.size === 0) return loadAgentHistoryPins();
  return persistAgentHistoryPins(loadAgentHistoryPins().filter((id) => !removing.has(id)));
}
