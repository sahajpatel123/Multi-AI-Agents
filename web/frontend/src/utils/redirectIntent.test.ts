import { describe, it, expect, beforeEach } from 'vitest';
import {
  setRedirectIntent,
  getRedirectIntent,
  clearRedirectIntent,
} from './redirectIntent';

describe('redirectIntent', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns /arena by default', () => {
    expect(getRedirectIntent()).toBe('/arena');
  });

  it('round-trips intent through sessionStorage', () => {
    setRedirectIntent('/agent');
    expect(getRedirectIntent()).toBe('/agent');
    setRedirectIntent('/account');
    expect(getRedirectIntent()).toBe('/account');
  });

  it('clearRedirectIntent removes the value', () => {
    setRedirectIntent('/agent');
    clearRedirectIntent();
    expect(getRedirectIntent()).toBe('/arena');
  });
});