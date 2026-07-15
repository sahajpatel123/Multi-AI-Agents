import { describe, expect, it } from 'vitest';
import {
  conduraPrimaryLabel,
  isSafeConduraInstallUrl,
  resolveInstallUrl,
} from './conduraCta';

describe('isSafeConduraInstallUrl', () => {
  it('allows official https hosts only', () => {
    expect(isSafeConduraInstallUrl('https://condura.app')).toBe(true);
    expect(isSafeConduraInstallUrl('https://www.condura.app/download')).toBe(true);
    expect(isSafeConduraInstallUrl('http://condura.app')).toBe(false);
    expect(isSafeConduraInstallUrl('https://evil.com')).toBe(false);
    expect(isSafeConduraInstallUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('resolveInstallUrl', () => {
  it('falls back when unsafe', () => {
    expect(resolveInstallUrl('https://phish.example')).toBe('https://condura.app');
    expect(resolveInstallUrl('https://condura.app/x')).toBe('https://condura.app/x');
  });
});

describe('conduraPrimaryLabel', () => {
  it('reflects probe and busy states', () => {
    expect(
      conduraPrimaryLabel({
        mobile: false,
        probe: { kind: 'ready' },
        probing: false,
        busy: false,
      }),
    ).toBe('Send to Condura');
    expect(
      conduraPrimaryLabel({
        mobile: true,
        probe: { kind: 'unknown' },
        probing: false,
        busy: false,
      }),
    ).toMatch(/desktop/i);
    expect(
      conduraPrimaryLabel({
        mobile: false,
        probe: { kind: 'not_installed' },
        probing: true,
        busy: false,
      }),
    ).toBe('Detecting…');
  });
});
