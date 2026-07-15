import { describe, expect, it } from 'vitest';
import { findPrimaryFlow, primaryPaths, PRIMARY_FLOWS } from './primaryFlows';

describe('primaryFlows registry', () => {
  it('lists core product paths used by nav and CTAs', () => {
    const paths = primaryPaths();
    expect(paths).toContain('/');
    expect(paths).toContain('/app');
    expect(paths).toContain('/agent');
    expect(paths).toContain('/agent/watchlist');
    expect(paths).toContain('/signin');
    expect(paths).toContain('/personas');
    expect(paths).toContain('/share');
  });

  it('marks arena/agent/watchlist as auth-required', () => {
    for (const id of ['arena', 'agent', 'watchlist'] as const) {
      const flow = PRIMARY_FLOWS.find((f) => f.id === id);
      expect(flow?.requiresAuth).toBe(true);
    }
  });

  it('resolves agent watchlist path', () => {
    expect(findPrimaryFlow('/agent/watchlist')?.id).toBe('watchlist');
    expect(findPrimaryFlow('/unknown')).toBeUndefined();
  });
});
