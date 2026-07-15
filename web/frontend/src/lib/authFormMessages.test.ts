import { describe, expect, it } from 'vitest';
import {
  authCaughtErrorMessage,
  signupClientIssueMessage,
  validateSignupFields,
} from './authFormMessages';

describe('authFormMessages', () => {
  it('prefers Error.message when present', () => {
    expect(authCaughtErrorMessage(new Error('Invalid credentials'), 'fail')).toBe(
      'Invalid credentials',
    );
    expect(authCaughtErrorMessage('x', 'fallback')).toBe('fallback');
  });

  it('validates signup fields in priority order', () => {
    expect(
      validateSignupFields({ name: 'A', password: 'short', confirmPassword: 'other' }),
    ).toBe('password_mismatch');
    expect(
      validateSignupFields({ name: '', password: 'longenough', confirmPassword: 'longenough' }),
    ).toBe('name_required');
    expect(
      validateSignupFields({ name: 'A', password: 'short', confirmPassword: 'short' }),
    ).toBe('password_short');
    expect(
      validateSignupFields({ name: 'A', password: 'longenough', confirmPassword: 'longenough' }),
    ).toBe(null);
  });

  it('maps issues to user-facing strings', () => {
    expect(signupClientIssueMessage('password_mismatch')).toMatch(/match/i);
    expect(signupClientIssueMessage('password_short')).toMatch(/8/);
  });
});
