/** Pure helpers for Condura install / handoff CTA behaviour. */

import type { ConduraProbeState } from '../types/condura';

const ALLOWED_INSTALL_HOSTS = new Set(['condura.app', 'www.condura.app']);

/** Only allow https://condura.app (and www) install destinations. */
export function isSafeConduraInstallUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    return ALLOWED_INSTALL_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function resolveInstallUrl(url: string | undefined | null): string {
  const fallback = 'https://condura.app';
  if (url && isSafeConduraInstallUrl(url)) return url.trim();
  return fallback;
}

export function conduraPrimaryLabel(input: {
  mobile: boolean;
  probe: ConduraProbeState;
  probing: boolean;
  busy: boolean;
}): string {
  if (input.probing) return 'Detecting…';
  if (input.busy) return 'Working…';
  if (input.mobile) return 'Save handoff — run on desktop';
  if (input.probe.kind === 'ready') return 'Send to Condura';
  if (input.probe.kind === 'installed_not_running') return 'Start Condura, then retry';
  if (input.probe.kind === 'not_installed') return 'Install Condura';
  return 'Detect Condura';
}
