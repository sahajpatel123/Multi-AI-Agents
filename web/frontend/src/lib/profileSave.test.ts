import { describe, expect, it } from 'vitest';
import {
  PROFILE_NAME_MAX,
  profileSaveCaughtErrorMessage,
  profileSaveIssueMessage,
  validateProfileName,
} from './profileSave';

describe('profileSave', () => {
  it('requires a non-empty name', () => {
    expect(validateProfileName('')).toBe('name_required');
    expect(validateProfileName('   ')).toBe('name_required');
    expect(validateProfileName('Sahaj')).toBeNull();
  });

  it('enforces max length', () => {
    expect(validateProfileName('x'.repeat(PROFILE_NAME_MAX))).toBeNull();
    expect(validateProfileName('x'.repeat(PROFILE_NAME_MAX + 1))).toBe('name_too_long');
  });

  it('maps issues and caught errors to human copy', () => {
    expect(profileSaveIssueMessage('name_required')).toMatch(/display name/i);
    expect(profileSaveCaughtErrorMessage(new Error('Network down'))).toBe('Network down');
    expect(profileSaveCaughtErrorMessage({})).toMatch(/try again/i);
  });
});
