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
      // Unknown routes render NotFoundPage — label the tab honestly.
      return `Not found · ${BRAND}`;
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

/** Max chars for names embedded in the tab title (keep tabs scannable). */
const TITLE_NAME_MAX = 48;

function compactTitlePart(raw: string, max = TITLE_NAME_MAX): string {
  const s = (raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * Tab title for a collaborative Room once the room name is known.
 * Falls back to the generic route title when name is empty.
 */
export function titleForRoom(roomName?: string | null): string {
  const name = compactTitlePart(roomName || '');
  if (!name) return `Room · ${BRAND}`;
  return `${name} · Room · ${BRAND}`;
}

/**
 * Tab title for a public shared take — prefer the mind name, then a prompt snippet.
 */
export function titleForShare(opts: {
  agentName?: string | null;
  prompt?: string | null;
} = {}): string {
  const agent = compactTitlePart(opts.agentName || '', 32);
  if (agent) return `${agent} · Shared take · ${BRAND}`;
  const prompt = compactTitlePart(opts.prompt || '', 40);
  if (prompt) return `${prompt} · Shared take · ${BRAND}`;
  return `Shared take · ${BRAND}`;
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
