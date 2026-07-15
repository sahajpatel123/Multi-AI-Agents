import { describe, expect, it } from 'vitest';
import { shouldUpgradeModalEscapeClose } from './upgradeModalEscape';

describe('shouldUpgradeModalEscapeClose', () => {
  it('allows Escape when no checkout is active', () => {
    expect(shouldUpgradeModalEscapeClose(null)).toBe(true);
  });

  it('blocks Escape while Razorpay checkout is open', () => {
    expect(shouldUpgradeModalEscapeClose('plus_monthly')).toBe(false);
  });
});
