/**
 * Pure helpers for the Discover rooms feed.
 *
 * The backend /api/rooms/discover endpoint was designed for a "Discover"
 * tab that lets a logged-in user browse active rooms they do not belong
 * to yet. These helpers keep the feed rows readable and testable.
 */

export type DiscoverRoomLike = {
  id: number | string;
  name?: string | null;
  slug?: string | null;
  member_count?: number | null;
  task_count?: number | null;
  synthesis_updated_at?: string | null;
};

/** "3 members · 5 tasks" — compact meta line for a discover card. */
export function discoverRoomMeta(room: DiscoverRoomLike | null | undefined): string {
  if (!room) return '0 members · 0 tasks';
  const members = Number.isFinite(room.member_count) ? Number(room.member_count) : 0;
  const tasks = Number.isFinite(room.task_count) ? Number(room.task_count) : 0;
  return `${members} member${members === 1 ? '' : 's'} · ${tasks} task${tasks === 1 ? '' : 's'}`;
}

/** Presence of synthesis separates "fresh" rooms from empty scaffolds. */
export function discoverRoomStatus(
  room: DiscoverRoomLike | null | undefined,
): 'New synthesis' | 'No synthesis yet' {
  if (!room || !room.synthesis_updated_at) return 'No synthesis yet';
  return 'New synthesis';
}

/** Accessible label for the whole discover row button. */
export function discoverRoomAriaLabel(room: DiscoverRoomLike | null | undefined): string {
  if (!room) return 'Open room';
  const name = (room.name || '').trim() || 'Untitled room';
  return `Open room ${name} — ${discoverRoomMeta(room)}, ${discoverRoomStatus(room)}`;
}

/** Empty-state copy distinguishes a search miss from an empty feed. */
export function discoverRoomEmptyTitle(searchQuery: string): string {
  const q = (searchQuery || '').trim();
  return q ? `No rooms match “${q}”` : 'No rooms to discover right now';
}
