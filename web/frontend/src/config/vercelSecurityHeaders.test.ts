/**
 * Pin the defensive response headers declared in vercel.json.
 * Pure JSON shape check — does not hit the network.
 *
 * Pinned:
 * - Strict-Transport-Security — HSTS, 2-year max-age, includeSubDomains.
 *   Without `preload` so we don't accidentally opt the domain into the
 *   browser preload list from a config-only change.
 * - Referrer-Policy — strict-origin-when-cross-origin. Default is fine
 *   in modern browsers but explicit is more honest.
 * - Permissions-Policy — denies unused sensors, whitelists payment only
 *   for the same-origin + Razorpay checkout.
 * - X-Frame-Options + X-Content-Type-Options — kept verbatim from cycle 1.
 * - CSP — preserved verbatim (cycle 374 didn't touch CSP).
 *
 * If any header disappears or its value drifts, the test fails so the
 * next guard cycle has a clear signal.
 */

import { describe, expect, it } from 'vitest';
import vercelConfig from '../../vercel.json';

interface Header {
  key: string;
  value: string;
}

interface HeaderRule {
  source: string;
  headers: Header[];
}

function findRule(source: string): HeaderRule {
  const rule = (vercelConfig.headers as HeaderRule[]).find((r) => r.source === source);
  if (!rule) throw new Error(`Missing header rule for source: ${source}`);
  return rule;
}

function headerValue(rule: HeaderRule, key: string): string {
  const entry = rule.headers.find((h) => h.key === key);
  if (!entry) throw new Error(`Missing header: ${key}`);
  return entry.value;
}

describe('vercel.json security headers', () => {
  const rule = findRule('/(.*)');

  it('declares HSTS with a long max-age and includeSubDomains', () => {
    const hsts = headerValue(rule, 'Strict-Transport-Security');
    expect(hsts).toMatch(/max-age=\d{6,}/);
    expect(hsts).toMatch(/includeSubDomains/);
  });

  it('declares a strict-origin Referrer-Policy', () => {
    expect(headerValue(rule, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('denies unused sensors in Permissions-Policy', () => {
    const policy = headerValue(rule, 'Permissions-Policy');
    for (const feature of ['camera', 'microphone', 'geolocation', 'accelerometer', 'gyroscope', 'magnetometer', 'usb']) {
      // Each denied feature must appear with an empty allowlist.
      expect(policy, feature).toMatch(new RegExp(`${feature}=\\(\\)`));
    }
  });

  it('whitelists payment for self + Razorpay only', () => {
    const policy = headerValue(rule, 'Permissions-Policy');
    expect(policy).toMatch(/payment=\(self "https:\/\/checkout\.razorpay\.com"\)/);
  });

  it('still emits X-Frame-Options DENY and X-Content-Type-Options nosniff', () => {
    expect(headerValue(rule, 'X-Frame-Options')).toBe('DENY');
    expect(headerValue(rule, 'X-Content-Type-Options')).toBe('nosniff');
  });

  it('still emits the CSP from cycle 374 unchanged', () => {
    const csp = headerValue(rule, 'Content-Security-Policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' checkout.razorpay.com");
    expect(csp).toContain('connect-src');
    expect(csp).toContain('frame-src checkout.razorpay.com');
  });
});