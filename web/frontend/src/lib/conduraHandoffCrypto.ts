import { canonicalize } from './jcs';

const KEY_STORAGE = 'arena_condura_signing_key_jwk';

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

export async function getOrCreateSigningKey(): Promise<{
  publicKeyJwk: JsonWebKey;
  privateKey: CryptoKey;
}> {
  // sessionStorage can throw in private mode, with quota exceeded, or
  // under enterprise storage-disable policies. Treat every read as
  // best-effort — if the read fails, fall through to key generation.
  // The signing key never leaves the browser; nothing security-relevant
  // is at risk, but a crash here would silently break every handoff.
  let existing: string | null = null;
  try {
    existing = sessionStorage.getItem(KEY_STORAGE);
  } catch {
    existing = null;
  }
  if (existing) {
    try {
      const jwk = JSON.parse(existing) as JsonWebKey;
      const privateKey = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign'],
      );
      // Strip the private exponent to produce the public JWK. The stored
      // JWK is the *private* key (it must include `d` so we can re-import
      // it), so the inherited `key_ops: ["sign"]` is wrong for the public
      // form — a public key may only `["verify"]`, otherwise Condura's
      // signature-verification step rejects it as a malformed JWK.
      const publicJwk: JsonWebKey = { ...jwk, key_ops: ['verify'] };
      delete publicJwk.d;
      return { publicKeyJwk: publicJwk, privateKey };
    } catch {
      try {
        sessionStorage.removeItem(KEY_STORAGE);
      } catch {
        /* ignore — best-effort cleanup */
      }
    }
  }
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  try {
    sessionStorage.setItem(KEY_STORAGE, JSON.stringify(privateJwk));
  } catch {
    // Quota / private mode — the in-memory CryptoKey is still usable
    // for the current call, but the next call will regenerate. That's
    // acceptable for a handoff signing key.
  }
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  return { publicKeyJwk, privateKey: keyPair.privateKey };
}

export async function rotateSigningKey(): Promise<{
  publicKeyJwk: JsonWebKey;
  privateKey: CryptoKey;
}> {
  try {
    sessionStorage.removeItem(KEY_STORAGE);
  } catch {
    /* ignore — the regeneration below proceeds regardless */
  }
  return getOrCreateSigningKey();
}

export async function buildSignedHandoff(input: {
  capability: string;
  summary: string;
  args: Record<string, unknown>;
  sessionId: string;
  userIdHmac: string;
  instanceId?: string;
}): Promise<import('../types/condura').HandoffPayload> {
  const { publicKeyJwk, privateKey } = await getOrCreateSigningKey();
  const nonce = randomNonce();
  // Use a single Date.now() so issued_at and expires_at share the
  // same millisecond — previously the two calls could tick across
  // a millisecond boundary and flake the "expires_at exactly 24h
  // after issued_at" test (off by one ms).
  const issuedAtMs = Date.now();
  const issuedAt = new Date(issuedAtMs).toISOString();
  const expiresAt = new Date(issuedAtMs + 24 * 60 * 60 * 1000).toISOString();
  const intent = {
    capability: input.capability,
    summary: input.summary,
    args: input.args,
  };
  const toSign = {
    intent,
    nonce,
    issued_at: issuedAt,
    expires_at: expiresAt,
  };
  const canonical = canonicalize(toSign);
  const signatureBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(canonical),
  );
  return {
    schema: 'arena.handoff.v1',
    schema_min: '1.0',
    from: {
      product: 'arena',
      instance_id: input.instanceId || 'web',
      user_id_hmac: input.userIdHmac,
      session_id: input.sessionId,
    },
    intent,
    auth: {
      public_key_jwk: publicKeyJwk,
      nonce,
      issued_at: issuedAt,
      expires_at: expiresAt,
      canonicalization: 'rfc8785',
      signature: b64url(signatureBuf),
    },
    deprecation_warnings: [],
  };
}
