/** Client-side auth form copy helpers (pure). */

export function authCaughtErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message.trim();
  }
  return fallback;
}

export type SignupClientIssue =
  | 'password_mismatch'
  | 'name_required'
  | 'password_short'
  | null;

export function validateSignupFields(input: {
  name: string;
  password: string;
  confirmPassword: string;
}): SignupClientIssue {
  if (input.password !== input.confirmPassword) return 'password_mismatch';
  if (!input.name.trim()) return 'name_required';
  if (input.password.length < 8) return 'password_short';
  return null;
}

export function signupClientIssueMessage(issue: Exclude<SignupClientIssue, null>): string {
  switch (issue) {
    case 'password_mismatch':
      return 'Passwords do not match';
    case 'name_required':
      return 'Name is required';
    case 'password_short':
      return 'Password must be at least 8 characters';
  }
}
