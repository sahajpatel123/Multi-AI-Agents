const STORAGE_KEY = 'arena-recent-prompts-storage-v1';
const MAX_ITEMS = 8;
const MAX_LEN = 500;

export type RecentPrompt = {
  text: string;
  at: number;
  /** User-pinned prompts are shown first in the recent-prompt chips. */
  pinned: boolean;
};

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
}

export function loadRecentPrompts(): RecentPrompt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const o = item as { text?: unknown; at?: unknown; pinned?: unknown };
        if (typeof o.text !== 'string' || !o.text.trim()) return null;
        const at = typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : Date.now();
        return { text: normalize(o.text), at, pinned: o.pinned === true };
      })
      .filter((x): x is RecentPrompt => Boolean(x))
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function pushRecentPrompt(text: string): RecentPrompt[] {
  const clean = normalize(text);
  if (!clean) return loadRecentPrompts();

  const prev = loadRecentPrompts();
  const existing = prev.find(
    (p) => p.text.toLowerCase() === clean.toLowerCase(),
  );
  const rest = prev.filter((p) => p.text.toLowerCase() !== clean.toLowerCase());
  const next: RecentPrompt[] = [
    { text: clean, at: Date.now(), pinned: existing?.pinned ?? false },
    ...rest,
  ].slice(0, MAX_ITEMS);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — ignore */
  }
  return next;
}

export function clearRecentPrompts(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Pin or unpin one recent prompt. Returns the new list. */
export function setRecentPromptPinned(text: string, pinned: boolean): RecentPrompt[] {
  const clean = normalize(text);
  if (!clean) return loadRecentPrompts();

  let changed = false;
  const next = loadRecentPrompts().map((p) => {
    if (p.text.toLowerCase() !== clean.toLowerCase()) return p;
    if (p.pinned === pinned) return p;
    changed = true;
    return { ...p, pinned };
  });
  if (!changed) return next;

  try {
    if (next.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    /* ignore */
  }
  return next;
}

/** Remove one recent prompt (case-insensitive match). Returns the new list. */
export function removeRecentPrompt(text: string): RecentPrompt[] {
  const clean = normalize(text);
  if (!clean) return loadRecentPrompts();
  const next = loadRecentPrompts().filter(
    (p) => p.text.toLowerCase() !== clean.toLowerCase(),
  );
  try {
    if (next.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    /* ignore */
  }
  return next;
}
