/** Pure validation / copy for Profile settings save. */

export type ProfileSaveIssue = 'name_required' | 'name_too_long' | null;

export const PROFILE_NAME_MAX = 80;

export function validateProfileName(name: string): ProfileSaveIssue {
  const n = (name || '').trim();
  if (!n) return 'name_required';
  if (n.length > PROFILE_NAME_MAX) return 'name_too_long';
  return null;
}

export function profileSaveIssueMessage(issue: Exclude<ProfileSaveIssue, null>): string {
  switch (issue) {
    case 'name_required':
      return 'Add a display name so others (and rooms) can recognize you.';
    case 'name_too_long':
      return `Display name must be ${PROFILE_NAME_MAX} characters or fewer.`;
  }
}

export function profileSaveCaughtErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return 'Could not save profile. Check your connection and try again.';
}
