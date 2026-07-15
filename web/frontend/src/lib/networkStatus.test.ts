import { describe, expect, it } from 'vitest';
import {
  networkBannerAriaLive,
  networkBannerKind,
  networkBannerMessage,
  networkBannerRole,
} from './networkStatus';

describe('networkStatus', () => {
  it('prefers offline over reconnected toast', () => {
    expect(networkBannerKind({ online: false, showReconnected: true })).toBe('offline');
    expect(networkBannerKind({ online: false, showReconnected: false })).toBe('offline');
  });

  it('shows reconnected only while online and flagged', () => {
    expect(networkBannerKind({ online: true, showReconnected: true })).toBe('reconnected');
    expect(networkBannerKind({ online: true, showReconnected: false })).toBe('hidden');
  });

  it('returns honest banner copy', () => {
    expect(networkBannerMessage('offline')).toMatch(/offline/i);
    expect(networkBannerMessage('reconnected')).toMatch(/online/i);
    expect(networkBannerMessage('hidden')).toBeNull();
  });

  it('uses assertive alert offline and polite status when reconnected', () => {
    expect(networkBannerRole('offline')).toBe('alert');
    expect(networkBannerAriaLive('offline')).toBe('assertive');
    expect(networkBannerRole('reconnected')).toBe('status');
    expect(networkBannerAriaLive('reconnected')).toBe('polite');
    expect(networkBannerRole('hidden')).toBeNull();
  });
});
