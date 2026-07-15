/** Browser tab titles for primary Arena routes. */

import { getStageKey, type StageKey } from './agentPipelineStages';

const BRAND = 'Arena';

const STAGE_SHORT: Record<StageKey, string> = {
  planner: 'Planning',
  researcher: 'Researching',
  solver: 'Solving',
  critic: 'Critiquing',
  verifier: 'Verifying',
  synthesizer: 'Synthesizing',
  judge: 'Judging',
};

/**
 * Map a location pathname to a document title.
 * Pure — safe to unit test without the DOM.
 */
export function titleForPath(pathname: string): string {
  const path = (pathname || '/').split('?')[0].replace(/\/$/, '') || '/';

  switch (path) {
    case '/':
      return `${BRAND} — Four minds. One question.`;
    case '/app':
    case '/arena':
      return `Arena panel · ${BRAND}`;
    case '/agent':
      return `Agent Mode · ${BRAND}`;
    case '/agent/watchlist':
      return `Watchlist · ${BRAND}`;
    case '/personas':
      return `Personas · ${BRAND}`;
    case '/pricing':
      return `Pricing · ${BRAND}`;
    case '/product':
      return `Product · ${BRAND}`;
    case '/about':
      return `About · ${BRAND}`;
    case '/signin':
      return `Sign in · ${BRAND}`;
    case '/changelog':
      return `Changelog · ${BRAND}`;
    case '/privacy':
      return `Privacy · ${BRAND}`;
    case '/terms':
      return `Terms · ${BRAND}`;
    case '/account':
      return `Account · ${BRAND}`;
    case '/share':
      return `Shared take · ${BRAND}`;
    default:
      if (path.startsWith('/room/')) return `Room · ${BRAND}`;
      if (path.startsWith('/agent/')) return `Agent · ${BRAND}`;
      return BRAND;
  }
}

/**
 * Live tab title while Agent research (or refine) is in flight.
 * Helps multitaskers see progress without returning to the tab.
 */
export function titleForAgentBusy(opts: {
  stage?: string;
  refining?: boolean;
  challenging?: boolean;
} = {}): string {
  if (opts.challenging) return `Challenging… · Agent Mode · ${BRAND}`;
  if (opts.refining) return `Refining… · Agent Mode · ${BRAND}`;
  const key = getStageKey(opts.stage);
  const short = key ? STAGE_SHORT[key] : 'Working';
  return `${short}… · Agent Mode · ${BRAND}`;
}

/**
 * Live tab title while the Arena panel is producing takes.
 */
export function titleForArenaBusy(
  kind: 'pipeline' | 'streaming' | 'chat' | 'debate' | 'discuss' = 'streaming',
): string {
  if (kind === 'pipeline') return `Starting… · Arena panel · ${BRAND}`;
  if (kind === 'chat') return `Mind replying… · Arena panel · ${BRAND}`;
  if (kind === 'debate') return `Debate in progress… · Arena panel · ${BRAND}`;
  if (kind === 'discuss') return `Discussing… · Arena panel · ${BRAND}`;
  return `Four minds responding… · Arena panel · ${BRAND}`;
}

export function applyDocumentTitle(pathname: string): void {
  if (typeof document === 'undefined') return;
  document.title = titleForPath(pathname);
}

/** Set an absolute title string (busy overlays). No-op outside the browser. */
export function applyAbsoluteDocumentTitle(title: string): void {
  if (typeof document === 'undefined') return;
  document.title = title;
}
