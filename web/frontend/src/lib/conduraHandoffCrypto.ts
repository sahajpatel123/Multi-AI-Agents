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
  const existing = sessionStorage.getItem(KEY_STORAGE);
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
      const { d: _d, ...publicJwk } = jwk;
      return { publicKeyJwk: publicJwk, privateKey };
    } catch {
      sessionStorage.removeItem(KEY_STORAGE);
    }
  }
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  sessionStorage.setItem(KEY_STORAGE, JSON.stringify(privateJwk));
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  return { publicKeyJwk, privateKey: keyPair.privateKey };
}

export async function rotateSigningKey(): Promise<{
  publicKeyJwk: JsonWebKey;
  privateKey: CryptoKey;
}> {
  sessionStorage.removeItem(KEY_STORAGE);
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
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
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
