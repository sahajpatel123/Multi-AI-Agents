/**
 * Favorited Agent task templates (localStorage).
 *
 * Mirrors the recently-used store so the Templates modal can offer a
 * starred "Favorites" tab without embedding storage details in the UI
 * tree. Same versioned-key, safe-parse, silent-failure conventions as
 * templatesRecent and the persona-tool favorites helper.
 */

const STORAGE_KEY = 'arena_agent_templates_favorites_v1';
const MAX_FAVORITES = 24;

export type TemplatesFavoritesStore = {
  /** Most-recently-starred first. */
  ids: string[];
};

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_FAVORITES) break;
  }
  return out;
}

/** Load favorite ids (most recently starred first). Invalid storage → empty. */
export function loadFavoriteTemplateIds(): string[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return normalizeIds(parsed);
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as TemplatesFavoritesStore).ids)) {
      return normalizeIds((parsed as TemplatesFavoritesStore).ids);
    }
    return [];
  } catch {
    return [];
  }
}

function persist(ids: string[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_FAVORITES)));
  } catch {
    /* private mode / quota */
  }
}

/**
 * Toggle a template's favorite state. Starring moves the id to the front
 * (most recently starred first); unstarring removes it. Returns the new
 * list and whether the template is now favorited.
 */
export function toggleFavoriteTemplateId(templateId: string): [string[], boolean] {
  const id = (templateId || '').trim();
  if (!id) return [loadFavoriteTemplateIds(), false];
  const prev = loadFavoriteTemplateIds();
  if (prev.includes(id)) {
    const next = prev.filter((x) => x !== id);
    persist(next);
    return [next, false];
  }
  const next = [id, ...prev].slice(0, MAX_FAVORITES);
  persist(next);
  return [next, true];
}

/** True when a template id is currently favorited. */
export function isFavoriteTemplateId(templateId: string): boolean {
  const id = (templateId || '').trim();
  return id ? loadFavoriteTemplateIds().includes(id) : false;
}

/** Clear all favorite template ids. */
export function clearFavoriteTemplateIds(): string[] {
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
 * Drop favorite ids that no longer exist in the loaded catalog, persisting
 * the cleaned list when anything was removed. Returns the surviving ids in
 * the same order as `favoriteIds`. An empty/partial `templates` list never
 * prunes, so a failed or incomplete catalog cannot wipe favorites.
 */
export function pruneFavoriteTemplateIds<T extends { id?: string | null }>(
  templates: readonly T[],
  favoriteIds: readonly string[] = loadFavoriteTemplateIds(),
): string[] {
  const list = Array.isArray(templates) ? templates : [];
  const prev = favoriteIds || [];
  if (list.length === 0) return [...prev];
  const live = new Set<string>();
  for (const t of list) {
    const id = (t.id || '').trim();
    if (id) live.add(id);
  }
  const kept = prev.filter((id) => live.has(id));
  if (kept.length !== prev.length) persist(kept);
  return kept;
}

/** Pick up to `limit` favorited templates that still exist in the catalog. */
export function pickFavoriteTemplates<T extends { id?: string | null }>(
  templates: T[],
  favoriteIds: readonly string[],
  limit = 12,
): T[] {
  if (!Array.isArray(templates) || limit <= 0) return [];
  const byId = new Map<string, T>();
  for (const t of templates) {
    const id = (t.id || '').trim();
    if (id && !byId.has(id)) byId.set(id, t);
  }
  const out: T[] = [];
  for (const id of favoriteIds) {
    const hit = byId.get(id);
    if (hit) out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

export function templatesFavoritesUseful(favoriteIds: readonly string[]): boolean {
  return (favoriteIds || []).length > 0;
}

export const TEMPLATES_FAVORITES_KEY = STORAGE_KEY;
export const TEMPLATES_FAVORITES_LIMIT = MAX_FAVORITES;
