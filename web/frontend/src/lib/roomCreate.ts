/** Pure validation / copy for creating a research room. */

export const ROOM_NAME_MIN = 2;
export const ROOM_NAME_MAX = 80;

export type RoomNameIssue = 'name_required' | 'name_too_short' | 'name_too_long' | null;

export function validateRoomName(name: string): RoomNameIssue {
  const n = (name || '').trim();
  if (!n) return 'name_required';
  if (n.length < ROOM_NAME_MIN) return 'name_too_short';
  if (n.length > ROOM_NAME_MAX) return 'name_too_long';
  return null;
}

export function roomNameIssueMessage(issue: Exclude<RoomNameIssue, null>): string {
  switch (issue) {
    case 'name_required':
      return 'Give the room a name so collaborators know what you’re researching.';
    case 'name_too_short':
      return `Room name needs at least ${ROOM_NAME_MIN} characters.`;
    case 'name_too_long':
      return `Room name must be ${ROOM_NAME_MAX} characters or fewer.`;
  }
}

export function roomCreateCaughtErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return 'Could not create room. Check your connection and try again.';
}

export function roomCreateButtonLabel(busy: boolean): string {
  return busy ? 'Creating…' : 'Create room →';
}
