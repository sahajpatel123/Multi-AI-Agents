/** Max lengths aligned with SharePage sanitization so shared links stay openable. */
export const SHARE_MAX_AGENT_LEN = 64;
export const SHARE_MAX_TEXT_LEN = 2000;

export type ShareTakeInput = {
  agentId: string;
  prompt: string;
  response: string;
  /** Defaults to `window.location.origin` in the browser. */
  origin?: string;
};

function clip(value: string, max: number): string {
  return (value || '').replace(/\u0000/g, '').slice(0, max).trim();
}

/**
 * Build the public `/share` landing URL for an Arena take.
 * Used by Copy link, X, WhatsApp, and Email so recipients never land on `/app`.
 */
export function buildShareUrl(input: ShareTakeInput): string {
  const origin = (input.origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(
    /\/$/,
    '',
  );
  const params = new URLSearchParams();
  params.set('agent', clip(input.agentId, SHARE_MAX_AGENT_LEN));
  params.set('prompt', clip(input.prompt, SHARE_MAX_TEXT_LEN));
  params.set('response', clip(input.response, SHARE_MAX_TEXT_LEN));
  return `${origin}/share?${params.toString()}`;
}

export function buildShareText(opts: {
  agentName: string;
  oneLiner: string;
  shareUrl: string;
  channel: 'x' | 'whatsapp' | 'email';
}): string {
  const { agentName, oneLiner, shareUrl, channel } = opts;
  if (channel === 'x') {
    return `"${oneLiner}"
— ${agentName} on Arena

${shareUrl}

#Arena #AI`;
  }
  if (channel === 'whatsapp') {
    return `Check out this take on Arena:

"${oneLiner}"
— ${agentName}

${shareUrl}`;
  }
  return `I found this on Arena:

${agentName} says:
"${oneLiner}"

Check it out: ${shareUrl}`;
}
