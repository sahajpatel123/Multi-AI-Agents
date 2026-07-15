import { describe, expect, it } from 'vitest';
import { networkBannerKind, networkBannerMessage } from './networkStatus';

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
});
