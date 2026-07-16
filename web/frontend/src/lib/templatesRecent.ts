/**
 * Recently used Agent task templates (localStorage).
 *
 * Pure helpers so the modal can pin a "Recent" strip and a "Recently used"
 * sort without embedding storage details in the UI tree.
 */

const STORAGE_KEY = 'arena_agent_templates_recent_v1';
const MAX_RECENT = 12;

export type TemplatesRecentStore = {
  /** Newest-first template ids. */
  ids: string[];
};

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/** Load recent ids (newest first). Invalid storage → empty. */
export function loadRecentTemplateIds(): string[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim())
        .slice(0, MAX_RECENT);
    }
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as TemplatesRecentStore).ids)) {
      return ((parsed as TemplatesRecentStore).ids || [])
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim())
        .slice(0, MAX_RECENT);
    }
    return [];
  } catch {
    return [];
  }
}

function persist(ids: string[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)));
  } catch {
    /* private mode / quota */
  }
}

/**
 * Record a template selection. Moves id to front; drops duplicates; caps length.
 * Returns the new newest-first list.
 */
export function recordRecentTemplateId(templateId: string): string[] {
  const id = (templateId || '').trim();
  if (!id) return loadRecentTemplateIds();
  const prev = loadRecentTemplateIds().filter((x) => x !== id);
  const next = [id, ...prev].slice(0, MAX_RECENT);
  persist(next);
  return next;
}

/** Clear local recent history. */
export function clearRecentTemplateIds(): string[] {
  if (isBrowser()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  return [];
}

/**
 * Order templates by recency index. Unknown / untracked ids sort after
 * recents, preserving relative catalog order among themselves.
 */
export function orderTemplatesByRecentIds<T extends { id?: string | null }>(
  templates: T[],
  recentIds: readonly string[],
): T[] {
  const list = templates || [];
  if (!recentIds.length) return [...list];
  const rank = new Map<string, number>();
  recentIds.forEach((id, i) => {
    if (id && !rank.has(id)) rank.set(id, i);
  });
  return [...list].sort((a, b) => {
    const ia = rank.has(String(a.id || '')) ? (rank.get(String(a.id || '')) as number) : 1e9;
    const ib = rank.has(String(b.id || '')) ? (rank.get(String(b.id || '')) as number) : 1e9;
    if (ia !== ib) return ia - ib;
    return 0;
  });
}

/** Pick up to `limit` recent templates that still exist in the catalog. */
export function pickRecentTemplates<T extends { id?: string | null }>(
  templates: T[],
  recentIds: readonly string[],
  limit = 6,
): T[] {
  if (!Array.isArray(templates) || limit <= 0) return [];
  const byId = new Map<string, T>();
  for (const t of templates) {
    const id = (t.id || '').trim();
    if (id && !byId.has(id)) byId.set(id, t);
  }
  const out: T[] = [];
  for (const id of recentIds) {
    const hit = byId.get(id);
    if (hit) out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

export function templatesRecentUseful(recentIds: readonly string[]): boolean {
  return (recentIds || []).length > 0;
}
