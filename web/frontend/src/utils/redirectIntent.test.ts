import { describe, it, expect, beforeEach } from 'vitest';
import {
  setRedirectIntent,
  getRedirectIntent,
  clearRedirectIntent,
  isSafeRedirectPath,
  describeRedirectDestination,
  DEFAULT_REDIRECT_INTENT,
} from './redirectIntent';

describe('redirectIntent', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns /app by default (canonical Arena shell)', () => {
    expect(getRedirectIntent()).toBe(DEFAULT_REDIRECT_INTENT);
    expect(getRedirectIntent()).toBe('/app');
  });

  it('round-trips safe relative intents', () => {
    setRedirectIntent('/agent');
    expect(getRedirectIntent()).toBe('/agent');
    setRedirectIntent('/account');
    expect(getRedirectIntent()).toBe('/account');
    setRedirectIntent('/agent/watchlist?tab=1');
    expect(getRedirectIntent()).toBe('/agent/watchlist?tab=1');
  });

  it('clearRedirectIntent restores the default', () => {
    setRedirectIntent('/agent');
    clearRedirectIntent();
    expect(getRedirectIntent()).toBe('/app');
  });

  it('rejects open-redirect payloads and leaves prior intent (or default)', () => {
    setRedirectIntent('/agent');
    setRedirectIntent('https://evil.example/phish');
    expect(getRedirectIntent()).toBe('/agent');

    clearRedirectIntent();
    setRedirectIntent('//evil.example');
    expect(getRedirectIntent()).toBe('/app');

    setRedirectIntent('/\\evil.example');
    expect(getRedirectIntent()).toBe('/app');
  });
});

describe('isSafeRedirectPath', () => {
  it('allows app-relative paths only', () => {
    expect(isSafeRedirectPath('/app')).toBe(true);
    expect(isSafeRedirectPath('/agent?x=1')).toBe(true);
    expect(isSafeRedirectPath('https://x.com')).toBe(false);
    expect(isSafeRedirectPath('//x.com')).toBe(false);
    expect(isSafeRedirectPath('javascript:alert(1)')).toBe(false);
    expect(isSafeRedirectPath('')).toBe(false);
  });
});

describe('describeRedirectDestination', () => {
  it('labels primary destinations for sign-in copy', () => {
    expect(describeRedirectDestination('/app')).toBe('Arena');
    expect(describeRedirectDestination('/agent')).toBe('Agent Mode');
    expect(describeRedirectDestination('/agent/watchlist')).toBe('Watchlist');
    expect(describeRedirectDestination('/room/abc')).toBe('the shared room');
    expect(describeRedirectDestination('/weird')).toBe('where you left off');
  });
});
