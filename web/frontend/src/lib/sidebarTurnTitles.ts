/** Persist user-renamed Arena sidebar turn titles (local only). */

const STORAGE_KEY = 'arena_sidebar_turn_titles_v1';
const MAX_ENTRIES = 200;

/**
 * Notify same-tab listeners that the sidebar-turn-titles map
 * changed. The browser `StorageEvent` only fires in OTHER tabs, so
 * without this signal any widget subscribed to this key in the
 * same tab would not refresh until the next page load. Swallows
 * any dispatch failure (jsdom quirks, locked-down iframes).
 */
function notifySameTab(): void {
  if (typeof window === 'undefined') return;
  try {
    const event = new StorageEvent('storage', {
      key: STORAGE_KEY,
      newValue: window.localStorage.getItem(STORAGE_KEY),
    });
    window.dispatchEvent(event);
  } catch {
    /* silent */
  }
}

/** Keep titles scannable in the sidebar. */
export const SIDEBAR_TURN_TITLE_MAX = 120;

export type SidebarTurnTitleIssue = 'title_required' | 'title_too_long' | null;

/** Collapse whitespace and cap length the same way titles are persisted. */
export function cleanSidebarTurnTitle(title: string): string {
  return (title || '').replace(/\s+/g, ' ').trim().slice(0, SIDEBAR_TURN_TITLE_MAX);
}

export function validateSidebarTurnTitle(title: string): SidebarTurnTitleIssue {
  const t = (title || '').trim();
  if (!t) return 'title_required';
  if (t.length > SIDEBAR_TURN_TITLE_MAX) return 'title_too_long';
  return null;
}

export function sidebarTurnTitleIssueMessage(
  issue: Exclude<SidebarTurnTitleIssue, null>,
): string {
  switch (issue) {
    case 'title_required':
      return 'Add a title, or press Esc to keep the current name.';
    case 'title_too_long':
      return `Title must be ${SIDEBAR_TURN_TITLE_MAX} characters or fewer.`;
  }
}

function sanitizeMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== 'string' || !k.trim()) continue;
    if (typeof v !== 'string') continue;
    const title = cleanSidebarTurnTitle(v);
    if (!title) continue;
    out[k] = title;
    if (Object.keys(out).length >= MAX_ENTRIES) break;
  }
  return out;
}

export function loadSidebarTurnTitles(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return sanitizeMap(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

/**
 * Upsert one title. Empty title removes the custom name.
 * Caps map size by dropping oldest-inserted keys when over MAX_ENTRIES
 * (Object key order is insertion order for string keys).
 */
export function saveSidebarTurnTitle(
  turnId: string,
  title: string,
  current: Record<string, string> = loadSidebarTurnTitles(),
): Record<string, string> {
  const id = (turnId || '').trim();
  if (!id) return { ...current };

  const next = { ...current };
  const clean = cleanSidebarTurnTitle(title);
  if (!clean) {
    delete next[id];
  } else {
    // Re-insert so this key is treated as most recently used.
    delete next[id];
    next[id] = clean;
    const keys = Object.keys(next);
    if (keys.length > MAX_ENTRIES) {
      const drop = keys.length - MAX_ENTRIES;
      for (let i = 0; i < drop; i++) {
        delete next[keys[i]];
      }
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
    return next;
  }
  notifySameTab();
  return next;
}

export function clearSidebarTurnTitles(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
    return;
  }
  notifySameTab();
}
