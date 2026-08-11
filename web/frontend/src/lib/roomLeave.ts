import { safeLocalStorage } from './safeStorage';

/**
 * Persist the user's "I left this room" intent so the RoomPage
 * auto-join-on-load effect does not silently re-add them on the next
 * visit. Leaving is a deliberate act: viewing the room again after a
 * leave should show the Join button, not quietly restore membership.
 */
const STORAGE_PREFIX = 'arena:left-rooms:v1:';
const MAX_SLUGS_PER_USER = 200;

function storageKey(userId: string | number): string {
  return `${STORAGE_PREFIX}${String(userId)}`;
}

function readLeftSlugs(userId: string | number): string[] {
  const raw = safeLocalStorage.getItem(storageKey(userId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
  } catch {
    // Corrupt/old payloads are treated as "no leave history" rather
    // than crashing the room page on load.
    return [];
  }
}

function persistLeftSlugs(userId: string | number, slugs: string[]): void {
  safeLocalStorage.setItem(storageKey(userId), JSON.stringify(slugs.slice(0, MAX_SLUGS_PER_USER)));
}

export function roomWasLeft(userId: string | number, slug: string): boolean {
  if (!slug) return false;
  return readLeftSlugs(userId).includes(slug);
}

export function markRoomLeft(userId: string | number, slug: string): void {
  if (!slug) return;
  const slugs = readLeftSlugs(userId);
  if (!slugs.includes(slug)) {
    persistLeftSlugs(userId, [...slugs, slug]);
  }
}

export function clearRoomLeft(userId: string | number, slug: string): void {
  if (!slug) return;
  persistLeftSlugs(
    userId,
    readLeftSlugs(userId).filter((s) => s !== slug),
  );
}
