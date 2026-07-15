import { describe, expect, it } from 'vitest';
import { formatAttemptedPath, notFoundActions } from './notFoundRecovery';

describe('notFoundRecovery', () => {
  it('formats attempted paths safely', () => {
    expect(formatAttemptedPath('/')).toBeNull();
    expect(formatAttemptedPath('/missing-page')).toBe('/missing-page');
    expect(formatAttemptedPath('/a<script>')).toBe('/ascript');
    expect(formatAttemptedPath('/room/xyz', '?x=1')).toBe('/room/xyz?x=1');
  });

  it('offers watchlist only when authenticated', () => {
    const guest = notFoundActions(false);
    expect(guest.map((a) => a.id)).toEqual(['home', 'arena', 'product']);
    expect(guest.find((a) => a.id === 'arena')?.requiresAuth).toBe(true);

    const authed = notFoundActions(true);
    expect(authed.map((a) => a.id)).toEqual(['home', 'arena', 'agent', 'watchlist']);
    expect(authed.every((a) => !a.requiresAuth)).toBe(true);
  });
});
