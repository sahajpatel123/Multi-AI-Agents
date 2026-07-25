/**
 * Recent shares — localStorage-backed history of share actions the
 * user has taken. Mirrors the recentComparisons / recentTools /
 * featuredArchive pattern: versioned schema, safe JSON parse, dedupe
 * by url (or label for label-only shares), bounded list.
 *
 * The hub uses this to surface a "Share again" surface so users can
 * re-share their recent compare pairs and streak milestones without
 * re-running the underlying tool.
 */

const STORAGE_KEY = 'arena:persona-playground:recent-shares:v1';
const MAX_ITEMS = 8;

export type ShareKind = 'compare' | 'streak' | 'tool' | 'other';

export interface RecentShare {
  /** What kind of share this was. */
  readonly kind: ShareKind;
  /** Short label for the share (e.g. "Council vs Mosaic Council", "7-day streak"). */
  readonly label: string;
  /** Optional URL the user copied. */
  readonly url?: string;
  /** Last-copied timestamp (ms since epoch). */
  readonly at: number;
}

function isValidKind(kind: unknown): kind is ShareKind {
  return kind === 'compare' || kind === 'streak' || kind === 'tool' || kind === 'other';
}

function isValidUrl(url: unknown): url is string {
  return typeof url === 'string' && url.length > 0;
}

function dedupeKey(share: RecentShare): string {
  // Compare + streak shares dedupe by url; tool shares dedupe by url;
  // anything without a url dedupes by label.
  if (share.url) return `${share.kind}|${share.url}`;
  return `${share.kind}|${share.label}`;
}

export function readRecentShares(
  storage: Pick<Storage, 'getItem'> | null,
): readonly RecentShare[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: RecentShare[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const o = item as { kind?: unknown; label?: unknown; url?: unknown; at?: unknown };
      if (!isValidKind(o.kind)) continue;
      if (typeof o.label !== 'string' || !o.label.trim()) continue;
      const at = typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : Date.now();
      const url = isValidUrl(o.url) ? (o.url as string) : undefined;
      const candidate: RecentShare = url
        ? { kind: o.kind, label: o.label, url, at }
        : { kind: o.kind, label: o.label, at };
      const key = dedupeKey(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(candidate);
      if (out.length >= MAX_ITEMS) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function writeRecentShares(
  storage: Pick<Storage, 'setItem'> | null,
  list: readonly RecentShare[],
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
  } catch {
    /* silent */
  }
}

export function recordRecentShare(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  share: Omit<RecentShare, 'at'> & { at?: number },
  now: number = Date.now(),
): void {
  const at = share.at ?? now;
  const candidate: RecentShare = share.url
    ? { kind: share.kind, label: share.label, url: share.url, at }
    : { kind: share.kind, label: share.label, at };
  const existing = readRecentShares(storage);
  const key = dedupeKey(candidate);
  const filtered = existing.filter((e) => dedupeKey(e) !== key);
  const next: RecentShare[] = [candidate, ...filtered].slice(0, MAX_ITEMS);
  writeRecentShares(storage, next);
}

export function clearRecentShares(
  storage: Pick<Storage, 'removeItem'> | null,
): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* silent */
  }
}

export const RECENT_SHARES_KEY = STORAGE_KEY;
export const RECENT_SHARES_LIMIT = MAX_ITEMS;
