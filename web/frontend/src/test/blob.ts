import { expect } from 'vitest';

/**
 * Cross-realm-safe Blob assertion for tests that consume `Response.blob()`.
 *
 * `Response.blob()` can hand back a Blob constructed in a different JavaScript
 * realm (Node's undici implementation vs the jsdom/global constructor), so
 * `expect(value).toBeInstanceOf(Blob)` fails spuriously in CI even when the
 * value is a perfectly good Blob. Brand-check via Object.prototype.toString
 * instead — it only matches real Blobs regardless of which realm built them.
 */
export function expectBlob(value: unknown): void {
  expect(Object.prototype.toString.call(value)).toBe('[object Blob]');
}
