/** Pure decisions for the offline / reconnected banner. */

export type NetworkBannerKind = 'offline' | 'reconnected' | 'hidden';

export function networkBannerKind(opts: {
  online: boolean;
  showReconnected: boolean;
}): NetworkBannerKind {
  if (!opts.online) return 'offline';
  if (opts.showReconnected) return 'reconnected';
  return 'hidden';
}

export function networkBannerMessage(kind: NetworkBannerKind): string | null {
  if (kind === 'offline') {
    return 'You are offline — new prompts and streams will wait until the connection returns.';
  }
  if (kind === 'reconnected') {
    return 'Back online — you can continue.';
  }
  return null;
}

/** Offline is urgent (assertive alert); reconnected is polite status. */
export function networkBannerRole(kind: NetworkBannerKind): 'alert' | 'status' | null {
  if (kind === 'offline') return 'alert';
  if (kind === 'reconnected') return 'status';
  return null;
}

export function networkBannerAriaLive(kind: NetworkBannerKind): 'assertive' | 'polite' | null {
  if (kind === 'offline') return 'assertive';
  if (kind === 'reconnected') return 'polite';
  return null;
}

/** How long to show the reconnected toast (ms). 0 under reduced motion callers. */
export const NETWORK_RECONNECTED_HOLD_MS = 2800;
