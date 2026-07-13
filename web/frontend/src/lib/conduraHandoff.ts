import { buildSignedHandoff } from './conduraHandoffCrypto';
import type { HandoffPayload } from '../types/condura';

export async function buildHandoffPayload(input: {
  capability: string;
  summary: string;
  args: Record<string, unknown>;
  sessionId: string;
  userId: number | string;
}): Promise<HandoffPayload> {
  // Client-side HMAC substitute: stable pseudonym for this browser session only.
  // Server stores user_id on HandoffRecord; this field is for Condura correlation.
  const userIdHmac = await sha256Hex(`arena:${input.userId}:${input.sessionId}`);
  return buildSignedHandoff({
    capability: input.capability,
    summary: input.summary,
    args: input.args,
    sessionId: input.sessionId,
    userIdHmac,
  });
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function handoffClipboardUrl(payload: HandoffPayload): string {
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `condura://arena/handoff?payload=${b64}`;
}
