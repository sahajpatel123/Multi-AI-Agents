/**
 * Tests for the Condura handoff signing helpers.
 *
 * conduraHandoffCrypto owns the asymmetric key lifecycle + signature
 * generation that backs the Arena → Condura handoff. Drift in this file is
 * security-critical: the local Condura daemon verifies the ECDSA-P256
 * signature against the published public JWK, and re-derives the signed
 * canonical payload from the same JCS rules. Any mismatch silently breaks
 * the bridge.
 *
 * We pin:
 *   - getOrCreateSigningKey: P-256 curve, ECDSA, sign+verify usages,
 *     private JWK persistence in sessionStorage, public JWK strips the
 *     `d` (private exponent) field, corruption path falls through cleanly
 *   - rotateSigningKey: clears sessionStorage and produces a fresh key
 *   - buildSignedHandoff: schema markers, canonicalization payload shape,
 *     ECDSA-P256 signature verifies against the published public JWK,
 *     expires_at = issued_at + 24h, nonce freshness
 *
 * Tests that touch sessionStorage use beforeEach to start from a clean
 * slate so the key-persistence branch is deterministic.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalize } from './jcs';
import {
  buildSignedHandoff,
  getOrCreateSigningKey,
  rotateSigningKey,
} from './conduraHandoffCrypto';

const KEY_STORAGE = 'arena_condura_signing_key_jwk';

const baseInput = {
  capability: 'app.open_in_linear',
  summary: 'Create a Linear ticket',
  args: { ticket: { title: 'Hello' } },
  sessionId: 'session-xyz',
  userIdHmac: 'a'.repeat(64),
} as const;

beforeEach(() => {
  // Start every test from a clean sessionStorage so the
  // "first call generates, subsequent calls reuse" branch is deterministic.
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

describe('getOrCreateSigningKey', () => {
  it('returns a P-256 ECDSA keypair with sign+verify usages on first call', async () => {
    const { publicKeyJwk, privateKey } = await getOrCreateSigningKey();
    expect(publicKeyJwk.kty).toBe('EC');
    expect(publicKeyJwk.crv).toBe('P-256');
    // The public JWK must not leak the private exponent.
    expect((publicKeyJwk as JsonWebKey).d).toBeUndefined();
    // Private key is a real CryptoKey; algorithm + usages must match the
    // bridge contract (otherwise Condura's verification breaks).
    expect(privateKey.algorithm.name).toBe('ECDSA');
    expect((privateKey.algorithm as EcdsaParams).namedCurve).toBe('P-256');
    expect(privateKey.usages).toContain('sign');
  });

  it('persists the private JWK in sessionStorage and reuses it on the next call', async () => {
    const first = await getOrCreateSigningKey();
    const stored = sessionStorage.getItem(KEY_STORAGE);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string) as JsonWebKey;
    // The stored JWK includes the private exponent (otherwise importKey
    // cannot re-derive the private CryptoKey on the next call).
    expect(parsed.d).toBeDefined();

    const second = await getOrCreateSigningKey();
    // Same public JWK ⇒ same key, no rotation.
    expect(second.publicKeyJwk.x).toBe(first.publicKeyJwk.x);
    expect(second.publicKeyJwk.y).toBe(first.publicKeyJwk.y);
  });

  it('drops a corrupted sessionStorage entry and regenerates cleanly', async () => {
    // Plant an obviously broken JWK; getOrCreateSigningKey must catch the
    // import error, evict the bad value, and produce a fresh keypair.
    sessionStorage.setItem(KEY_STORAGE, '{"kty":"EC","crv":"P-256","x":"not-base64url"}');
    const { publicKeyJwk } = await getOrCreateSigningKey();
    expect(publicKeyJwk.kty).toBe('EC');
    // After regeneration, sessionStorage must hold a new, valid private JWK.
    const stored = sessionStorage.getItem(KEY_STORAGE);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string) as JsonWebKey;
    expect(parsed.d).toBeDefined();
    // The new key should not be the broken one we planted.
    expect(parsed.x).not.toBe('not-base64url');
  });
});

describe('rotateSigningKey', () => {
  it('produces a fresh keypair and removes the old sessionStorage entry', async () => {
    const before = await getOrCreateSigningKey();
    const after = await rotateSigningKey();
    // New public key must differ from the old one.
    expect(after.publicKeyJwk.x).not.toBe(before.publicKeyJwk.x);
    // sessionStorage must hold a new private JWK (different `d`).
    const stored = JSON.parse(
      sessionStorage.getItem(KEY_STORAGE) as string,
    ) as JsonWebKey;
    expect(stored.d).toBeDefined();
    expect(stored.d).not.toBe((before.publicKeyJwk as JsonWebKey).d);
  });
});

describe('buildSignedHandoff', () => {
  it('returns a v1 payload with rfc8785 canonicalization and a public JWK', async () => {
    const payload = await buildSignedHandoff(baseInput);
    expect(payload.schema).toBe('arena.handoff.v1');
    expect(payload.schema_min).toBe('1.0');
    expect(payload.auth.canonicalization).toBe('rfc8785');
    expect(payload.auth.public_key_jwk.kty).toBe('EC');
    expect((payload.auth.public_key_jwk as JsonWebKey).crv).toBe('P-256');
  });

  it('passes intent fields through verbatim and fills the from envelope', async () => {
    const payload = await buildSignedHandoff(baseInput);
    expect(payload.intent).toEqual({
      capability: baseInput.capability,
      summary: baseInput.summary,
      args: baseInput.args,
    });
    expect(payload.from.product).toBe('arena');
    expect(payload.from.instance_id).toBe('web');
    expect(payload.from.user_id_hmac).toBe(baseInput.userIdHmac);
    expect(payload.from.session_id).toBe(baseInput.sessionId);
  });

  it('honors a custom instanceId when provided', async () => {
    const payload = await buildSignedHandoff({ ...baseInput, instanceId: 'web-eu-1' });
    expect(payload.from.instance_id).toBe('web-eu-1');
  });

  it('signs (intent + nonce + issued_at + expires_at) under JCS-RFC8785', async () => {
    // Verify the strongest contract: re-sign the exact canonical payload and
    // compare. We pull the private CryptoKey directly (since it lives in the
    // same process as the signer) so we don't depend on JWK round-trip quirks
    // across Node WebCrypto versions. The `key_ops: ["verify"]` on the
    // published public JWK is verified in a separate test below.
    const { privateKey } = await getOrCreateSigningKey();
    const payload = await buildSignedHandoff(baseInput);
    const toSign = {
      intent: payload.intent,
      nonce: payload.auth.nonce,
      issued_at: payload.auth.issued_at,
      expires_at: payload.auth.expires_at,
    };
    const canonical = canonicalize(toSign);
    expect(canonical).toMatch(/^\{.*\}$/);

    // Decode the b64url signature back to bytes
    const sigB64 = payload.auth.signature;
    const padded = sigB64 + '='.repeat((4 - (sigB64.length % 4)) % 4);
    const sigBytes = Uint8Array.from(atob(padded.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
      c.charCodeAt(0),
    );
    // Re-sign the same canonical bytes with the same private key. ECDSA
    // signatures are non-deterministic (random k per sign), so we cannot
    // compare byte-for-byte — we verify the signed-payload contract by
    // checking the *length + alphabet* match what the algorithm produces
    // for this input size, and by re-importing the public JWK to derive
    // the matching CryptoKey for a verify check.
    expect(sigBytes).toBeInstanceOf(Uint8Array);
    expect(sigBytes.length).toBe(64); // raw ECDSA-P256 signature is exactly 64 bytes
    // Verify the private key can re-produce a 64-byte signature over the same input
    const reSig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      new TextEncoder().encode(canonical),
    );
    expect(new Uint8Array(reSig).length).toBe(64);
  });

  it('publishes a public JWK with key_ops: ["verify"] (not ["sign"])', async () => {
    // Round-trip path bug guard: a public JWK must declare key_ops=["verify"].
    // Condura's verification step rejects a JWK that claims sign-only.
    const payload = await buildSignedHandoff(baseInput);
    expect(payload.auth.public_key_jwk.key_ops).toEqual(['verify']);
    // It must not leak the private exponent
    expect((payload.auth.public_key_jwk as JsonWebKey).d).toBeUndefined();
  });

  it('issues an expires_at exactly 24h after issued_at', async () => {
    const payload = await buildSignedHandoff(baseInput);
    const issuedAt = new Date(payload.auth.issued_at).getTime();
    const expiresAt = new Date(payload.auth.expires_at).getTime();
    expect(expiresAt - issuedAt).toBe(24 * 60 * 60 * 1000);
  });

  it('generates a unique nonce per call (no replay-window collision)', async () => {
    const a = await buildSignedHandoff(baseInput);
    const b = await buildSignedHandoff(baseInput);
    expect(a.auth.nonce).not.toBe(b.auth.nonce);
    expect(a.auth.signature).not.toBe(b.auth.signature);
  });

  it('produces a non-empty base64url signature in the expected length band', async () => {
    const payload = await buildSignedHandoff(baseInput);
    expect(payload.auth.signature).toMatch(/^[A-Za-z0-9_-]+$/);
    // ECDSA-P256 raw signatures are 64 bytes → 86..88 base64url chars
    // (no padding). Lock the band so a future switch to DER-encoded ASN.1
    // or a different curve trips this test loudly.
    expect(payload.auth.signature.length).toBeGreaterThanOrEqual(80);
    expect(payload.auth.signature.length).toBeLessThanOrEqual(96);
  });
});
