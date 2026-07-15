const STORAGE_KEY = 'arena_recent_prompts_v1';
const MAX_ITEMS = 8;
const MAX_LEN = 500;

export type RecentPrompt = {
  text: string;
  at: number;
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
        const o = item as { text?: unknown; at?: unknown };
        if (typeof o.text !== 'string' || !o.text.trim()) return null;
        const at = typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : Date.now();
        return { text: normalize(o.text), at };
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

  const prev = loadRecentPrompts().filter(
    (p) => p.text.toLowerCase() !== clean.toLowerCase(),
  );
  const next: RecentPrompt[] = [{ text: clean, at: Date.now() }, ...prev].slice(0, MAX_ITEMS);

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
