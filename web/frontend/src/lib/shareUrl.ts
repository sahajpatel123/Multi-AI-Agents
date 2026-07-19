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
  // Strip embedded NUL bytes — they break URL parsers downstream and aren't
  // a legitimate character in any user-authored share text.
  // eslint-disable-next-line no-control-regex
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

/**
 * Plain-text clipboard payload for the public /share landing.
 * Includes attribution + optional share URL so recipients can keep or re-send the take.
 */
export function buildShareTakeClipboardText(opts: {
  agentName: string;
  prompt?: string;
  response?: string;
  shareUrl?: string;
}): string {
  const agentName = (opts.agentName || 'Arena mind').trim() || 'Arena mind';
  const prompt = (opts.prompt || '').trim();
  const response = (opts.response || '').trim();
  const shareUrl = (opts.shareUrl || '').trim();
  const lines: string[] = [`${agentName} · Arena`];
  if (prompt) {
    lines.push('', `Q: ${prompt}`);
  }
  if (response) {
    lines.push('', `"${response}"`);
  } else if (!prompt) {
    lines.push('', 'A take shared on Arena.');
  }
  if (shareUrl) {
    lines.push('', shareUrl);
  }
  return lines.join('\n').trim();
}

/** Payload for the Web Share API (system share sheet on mobile / supported desktops). */
export type NativeShareData = {
  title: string;
  text: string;
  url: string;
};

export function buildNativeShareData(opts: {
  agentName: string;
  oneLiner: string;
  shareUrl: string;
}): NativeShareData {
  const agentName = (opts.agentName || 'Arena').trim() || 'Arena';
  const oneLiner = (opts.oneLiner || '').trim();
  const shareUrl = (opts.shareUrl || '').trim();
  return {
    title: `${agentName} on Arena`,
    text: oneLiner
      ? `"${oneLiner}" — ${agentName} on Arena`
      : `A take from ${agentName} on Arena`,
    url: shareUrl,
  };
}

/**
 * Web Share payload for a collaborative Room invite link.
 * Always points at the public `/room/:slug` URL (never a private shell route).
 */
export function buildRoomInviteShareData(opts: {
  roomName: string;
  shareUrl: string;
}): NativeShareData {
  const roomName = (opts.roomName || 'Research room').trim() || 'Research room';
  const shareUrl = (opts.shareUrl || '').trim();
  return {
    title: `${roomName} · Arena Room`,
    text: `Join “${roomName}” on Arena — compare research findings with the group.`,
    url: shareUrl,
  };
}

/**
 * True when the runtime exposes navigator.share.
 * Injectable for unit tests (no real navigator required).
 */
export function canUseNativeShare(
  nav: { share?: unknown } | null | undefined =
    typeof navigator !== 'undefined' ? navigator : undefined,
): boolean {
  return typeof nav?.share === 'function';
}

export type NativeShareResult = 'shared' | 'cancelled' | 'unavailable' | 'failed';

/**
 * Invoke the system share sheet. Pure-ish: share implementation is injectable for tests.
 * AbortError (user dismisses the sheet) maps to `cancelled`, not failure.
 */
export async function invokeNativeShare(
  data: NativeShareData,
  share?: (payload: NativeShareData) => Promise<void>,
): Promise<NativeShareResult> {
  if (!data.url) return 'failed';
  const fn =
    share ??
    (typeof navigator !== 'undefined' && typeof navigator.share === 'function'
      ? (payload: NativeShareData) => navigator.share(payload)
      : undefined);
  if (!fn) return 'unavailable';
  try {
    await fn(data);
    return 'shared';
  } catch (err) {
    const name =
      err && typeof err === 'object' && 'name' in err
        ? String((err as { name?: string }).name)
        : '';
    if (name === 'AbortError') return 'cancelled';
    return 'failed';
  }
}
