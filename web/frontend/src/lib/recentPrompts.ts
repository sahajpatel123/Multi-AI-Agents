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

/**
 * Cap the stored list while honoring pins: pinned prompts are always kept
 * ahead of ordinary recents, unpinned prompts are trimmed first, and at
 * least one ordinary recent slot is reserved so the latest prompt is never
 * silently dropped when a user has pinned every slot. Unpinned prompts are
 * kept most-recent-first, so trimming favors the newest questions. This
 * keeps pinned questions from disappearing when new prompts are submitted.
 */
function capRecentPrompts(items: readonly RecentPrompt[]): RecentPrompt[] {
  const pinned = items.filter((item) => item.pinned);
  const unpinned = items
    .filter((item) => !item.pinned)
    .sort((a, b) => b.at - a.at);
  const unpinnedRoom = Math.max(1, MAX_ITEMS - pinned.length);
  return [...pinned, ...unpinned.slice(0, unpinnedRoom)];
}

/**
 * Normalize untrusted storage contents into a clean, bounded list.
 * Malformed entries are dropped, duplicates collapse case-insensitively
 * (keeping the first position and any pinned flag), and pinned prompts
 * survive the item cap.
 */
function sanitizeRecentPrompts(parsed: unknown): RecentPrompt[] {
  if (!Array.isArray(parsed)) return [];
  const seen = new Map<string, number>();
  const out: RecentPrompt[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const o = item as { text?: unknown; at?: unknown; pinned?: unknown };
    if (typeof o.text !== 'string' || !o.text.trim()) continue;
    const text = normalize(o.text);
    if (!text) continue;
    const key = text.toLowerCase();
    const existingIndex = seen.get(key);
    if (existingIndex !== undefined) {
      out[existingIndex] = {
        ...out[existingIndex],
        pinned: out[existingIndex].pinned || o.pinned === true,
      };
      continue;
    }
    seen.set(key, out.length);
    out.push({
      text,
      at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0,
      pinned: o.pinned === true,
    });
  }
  return capRecentPrompts(out);
}

export function loadRecentPrompts(): RecentPrompt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeRecentPrompts(parsed);
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
  ];
  const capped = capRecentPrompts(next);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    /* quota / private mode — ignore */
  }
  return capped;
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
  const next = capRecentPrompts(loadRecentPrompts().map((p) => {
    if (p.text.toLowerCase() !== clean.toLowerCase()) return p;
    if (p.pinned === pinned) return p;
    changed = true;
    return { ...p, pinned };
  }));
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
  const next = capRecentPrompts(loadRecentPrompts().filter(
    (p) => p.text.toLowerCase() !== clean.toLowerCase(),
  ));
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
