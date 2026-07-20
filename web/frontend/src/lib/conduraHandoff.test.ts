/**
 * Tests for the Condura handoff payload + clipboard-URL helpers.
 *
 * These two functions sit on the bridge between Arena (web) and Condura
 * (local). Their contracts are:
 *   - buildHandoffPayload: derives a session-scoped userIdHmac from
 *     (userId, sessionId) using SHA-256, then asks the signing module to
 *     produce a signed HandoffPayload (auth.canonicalization = 'rfc8785').
 *   - handoffClipboardUrl: packs a HandoffPayload into a URL-safe base64url
 *     blob and wraps it in `condura://arena/handoff?payload=...` so the user
 *     can hand it off via the clipboard when the browser-side probe does not
 *     find a Condura daemon at 127.0.0.1.
 *
 * Both contracts are security-critical (the handoff is the only identity the
 * local Condura daemon receives), so we pin the userIdHmac derivation, the
 * canonicalization contract, and the URL encoding (incl. unicode round-trip).
 */

import { describe, expect, it } from 'vitest';
import { buildHandoffPayload, handoffClipboardUrl } from './conduraHandoff';

const baseInput = {
  capability: 'app.open_in_linear',
  summary: 'Create a Linear ticket',
  args: { ticket: { title: 'Hello' }, source_prompt: 'create a ticket' },
  sessionId: 'session-abc-123',
  userId: 42,
} as const;

describe('buildHandoffPayload', () => {
  it('returns a v1 payload with the documented schema markers', async () => {
    const payload = await buildHandoffPayload(baseInput);
    expect(payload.schema).toBe('arena.handoff.v1');
    expect(payload.schema_min).toBe('1.0');
    expect(payload.deprecation_warnings).toEqual([]);
    expect(payload.from.product).toBe('arena');
    expect(payload.from.instance_id).toBe('web');
    expect(payload.auth.canonicalization).toBe('rfc8785');
  });

  it('derives userIdHmac as SHA-256 of "arena:{userId}:{sessionId}"', async () => {
    // jsdom provides crypto.subtle — verify against a hand-computed reference.
    const expected = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`arena:${baseInput.userId}:${baseInput.sessionId}`),
    );
    const expectedHex = Array.from(new Uint8Array(expected))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const payload = await buildHandoffPayload(baseInput);
    expect(payload.from.user_id_hmac).toBe(expectedHex);
    expect(payload.from.user_id_hmac).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes userIdHmac when userId changes', async () => {
    const a = await buildHandoffPayload({ ...baseInput, userId: 1 });
    const b = await buildHandoffPayload({ ...baseInput, userId: 2 });
    expect(a.from.user_id_hmac).not.toBe(b.from.user_id_hmac);
  });

  it('changes userIdHmac when sessionId changes', async () => {
    const a = await buildHandoffPayload({ ...baseInput, sessionId: 'session-A' });
    const b = await buildHandoffPayload({ ...baseInput, sessionId: 'session-B' });
    expect(a.from.user_id_hmac).not.toBe(b.from.user_id_hmac);
  });

  it('accepts string-typed userId and produces the same HMAC as numeric', async () => {
    const numeric = await buildHandoffPayload({ ...baseInput, userId: 42 });
    const stringy = await buildHandoffPayload({ ...baseInput, userId: '42' });
    // The template-literal coercion "arena:42:..." is identical for both,
    // so the HMAC must match. (Locking this prevents accidental re-keying
    // when the auth context switches between User.id and User.id.toString().)
    expect(stringy.from.user_id_hmac).toBe(numeric.from.user_id_hmac);
  });

  it('passes intent fields through verbatim', async () => {
    const payload = await buildHandoffPayload(baseInput);
    expect(payload.intent.capability).toBe(baseInput.capability);
    expect(payload.intent.summary).toBe(baseInput.summary);
    expect(payload.intent.args).toEqual(baseInput.args);
    expect(payload.from.session_id).toBe(baseInput.sessionId);
  });

  it('issues an expires_at 24h after issued_at', async () => {
    const before = Date.now();
    const payload = await buildHandoffPayload(baseInput);
    const after = Date.now();
    const issuedAt = new Date(payload.auth.issued_at).getTime();
    const expiresAt = new Date(payload.auth.expires_at).getTime();
    const expectedDeltaMs = 24 * 60 * 60 * 1000;
    expect(expiresAt - issuedAt).toBe(expectedDeltaMs);
    // Bound the issued_at against wall-clock drift: must fall between the
    // snapshot we took before and after the call.
    expect(issuedAt).toBeGreaterThanOrEqual(before);
    expect(issuedAt).toBeLessThanOrEqual(after);
  });

  it('produces a base64url-encoded ECDSA-P256 signature', async () => {
    const payload = await buildHandoffPayload(baseInput);
    // ECDSA-P256 signatures encode to 64 bytes → ~86 base64url chars
    // (no padding). Lock the alphabet so a future switch to a different
    // curve or scheme trips this test loudly.
    expect(payload.auth.signature).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(payload.auth.signature.length).toBeGreaterThanOrEqual(80);
    expect(payload.auth.signature.length).toBeLessThanOrEqual(96);
    // The signing key is published alongside the signature.
    expect(payload.auth.public_key_jwk).toBeDefined();
    expect(payload.auth.public_key_jwk.kty).toBe('EC');
    expect((payload.auth.public_key_jwk as JsonWebKey).crv).toBe('P-256');
  });

  it('uses a fresh nonce and fresh key per call (no replay-window collision)', async () => {
    const a = await buildHandoffPayload(baseInput);
    const b = await buildHandoffPayload(baseInput);
    // Two consecutive builds must not share a nonce — otherwise the
    // server-side replay protection (which is nonce-keyed) breaks.
    expect(a.auth.nonce).not.toBe(b.auth.nonce);
    expect(a.auth.signature).not.toBe(b.auth.signature);
  });
});

describe('handoffClipboardUrl', () => {
  it('builds a condura://arena/handoff?payload= URL', () => {
    const payload = {
      schema: 'arena.handoff.v1',
      schema_min: '1.0',
      from: { product: 'arena' as const, instance_id: 'web', user_id_hmac: 'x', session_id: 'y' },
      intent: { capability: 'x', summary: 'y', args: {} },
      auth: {
        public_key_jwk: { kty: 'EC', crv: 'P-256' } as JsonWebKey,
        nonce: 'n',
        issued_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2026-01-02T00:00:00.000Z',
        canonicalization: 'rfc8785' as const,
        signature: 's',
      },
      deprecation_warnings: [],
    };
    const url = handoffClipboardUrl(payload);
    expect(url.startsWith('condura://arena/handoff?payload=')).toBe(true);
  });

  it('encodes payload as base64url (no +, /, or = padding)', () => {
    // Craft an input whose JSON contains characters that would produce + or /
    // in standard base64, so we can assert they get URL-safe-substituted.
    const payload = {
      schema: 'arena.handoff.v1',
      schema_min: '1.0',
      from: { product: 'arena' as const, instance_id: '>>>???', user_id_hmac: 'a', session_id: 'b' },
      intent: { capability: 'cap', summary: '>>><<<>>>', args: { key: '>>>' } },
      auth: {
        public_key_jwk: { kty: 'EC' } as JsonWebKey,
        nonce: 'nn',
        issued_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2026-01-02T00:00:00.000Z',
        canonicalization: 'rfc8785' as const,
        signature: 'ss',
      },
      deprecation_warnings: [],
    };
    const url = handoffClipboardUrl(payload);
    const b64 = url.slice('condura://arena/handoff?payload='.length);
    expect(b64).not.toMatch(/[+/=]/);
    expect(b64).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('round-trips unicode payloads (the unescape(encodeURIComponent) bridge)', () => {
    // The helper uses the legacy `unescape(encodeURIComponent(...))` trick
    // so btoa() (which only accepts latin1) survives UTF-8 inputs. Pin this
    // because removing it would silently mangle non-ASCII summary / args.
    const payload = {
      schema: 'arena.handoff.v1',
      schema_min: '1.0',
      from: {
        product: 'arena' as const,
        instance_id: 'web',
        user_id_hmac: 'h',
        session_id: 's',
      },
      intent: {
        capability: 'cap',
        summary: 'Create a Linear ticket — emoji 🎟 + résumé',
        args: { title: '日本語 / français / emoji 🚀' },
      },
      auth: {
        public_key_jwk: { kty: 'EC' } as JsonWebKey,
        nonce: 'n',
        issued_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2026-01-02T00:00:00.000Z',
        canonicalization: 'rfc8785' as const,
        signature: 'sig',
      },
      deprecation_warnings: [],
    };
    const url = handoffClipboardUrl(payload);
    const b64 = url.slice('condura://arena/handoff?payload='.length);
    // Decode back: base64url → base64 → atob → URI-decode → JSON.parse
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = decodeURIComponent(escape(atob(padded.replace(/-/g, '+').replace(/_/g, '/'))));
    const decoded = JSON.parse(json);
    expect(decoded.intent.summary).toBe(payload.intent.summary);
    expect(decoded.intent.args).toEqual(payload.intent.args);
  });

  it('is deterministic for byte-identical inputs', () => {
    const payload = {
      schema: 'arena.handoff.v1',
      schema_min: '1.0',
      from: { product: 'arena' as const, instance_id: 'web', user_id_hmac: 'h', session_id: 's' },
      intent: { capability: 'cap', summary: 'sum', args: { k: 'v' } },
      auth: {
        public_key_jwk: { kty: 'EC' } as JsonWebKey,
        nonce: 'n',
        issued_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2026-01-02T00:00:00.000Z',
        canonicalization: 'rfc8785' as const,
        signature: 'sig',
      },
      deprecation_warnings: [],
    };
    expect(handoffClipboardUrl(payload)).toBe(handoffClipboardUrl(payload));
  });
});
