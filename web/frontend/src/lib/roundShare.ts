/**
 * Stateless public sharing for a complete Arena round.
 *
 * A round link points at the existing public `/share` landing with
 * `round=1` plus up to four compact take parameters (`t0`…`t3`). The
 * payload is intentionally a summary: the question and each take's
 * one-liner/score, capped so the full encoded URL stays comfortably inside
 * the shared 2000-character budget even on mobile share sheets.
 */

export type RoundShareTake = {
  agentId: string;
  oneLiner: string;
  score?: number;
};

export type RoundShareData = {
  prompt: string;
  winnerAgentId?: string;
  takes: RoundShareTake[];
};

export type RoundShareInput = {
  prompt: string;
  winnerAgentId?: string;
  takes: readonly RoundShareTake[];
  /** Defaults to `window.location.origin` in the browser. */
  origin?: string;
};

export const ROUND_SHARE_MAX_AGENT_LEN = 64;
export const ROUND_SHARE_MAX_TAKE_LEN = 220;
export const ROUND_SHARE_MAX_PROMPT_LEN = 500;
export const ROUND_SHARE_MAX_TAKES = 4;
/** Total encoded URL budget, matching the share sheet guidance for /share. */
export const ROUND_SHARE_MAX_URL_LEN = 2000;

function clip(value: string, max: number): string {
  // Strip embedded NUL bytes — they break URL parsers downstream.
  // eslint-disable-next-line no-control-regex
  return (value || '').replace(/\u0000/g, '').slice(0, max).trim();
}

function encodeTake(take: RoundShareTake, takeLen: number): string {
  const agentId = clip(take.agentId, ROUND_SHARE_MAX_AGENT_LEN);
  const score = Number.isFinite(take.score) ? Math.max(0, Math.min(100, Math.round(take.score ?? 0))) : '';
  const oneLiner = clip(take.oneLiner, takeLen);
  return [agentId, String(score), oneLiner].join('|');
}

function decodeScore(raw: string): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Build a public `/share` URL for a full round. The question is clipped to
 * 500 chars and each take to 220 chars by default, then progressively
 * shortened (by take length, take count, then prompt length) when the
 * encoded URL would exceed the share budget — multi-byte text expands
 * several times over once URL-encoded, so raw character caps alone are not
 * enough. When takes are dropped, an explicitly selected winner is retained
 * whenever its answer can still fit in the compacted link.
 */
export function buildRoundShareUrl(input: RoundShareInput): string {
  const origin = (input.origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(
    /\/$/,
    '',
  );
  const winnerAgentId = clip(input.winnerAgentId || '', ROUND_SHARE_MAX_AGENT_LEN);

  const build = (promptLen: number, takeLen: number, maxTakes: number): string => {
    const params = new URLSearchParams();
    params.set('round', '1');
    params.set('prompt', clip(input.prompt, promptLen));
    if (winnerAgentId) {
      params.set('winner', winnerAgentId);
    }
    const candidates = input.takes
      .filter(
        (take) =>
          clip(take.agentId, ROUND_SHARE_MAX_AGENT_LEN) ||
          clip(take.oneLiner, takeLen),
      );
    const selected = candidates.slice(0, maxTakes);
    if (winnerAgentId && maxTakes > 0) {
      const winner = candidates.find(
        (take) =>
          clip(take.agentId, ROUND_SHARE_MAX_AGENT_LEN) === winnerAgentId &&
          Boolean(clip(take.oneLiner, takeLen)),
      );
      const selectedWinner = selected.some(
        (take) =>
          clip(take.agentId, ROUND_SHARE_MAX_AGENT_LEN) === winnerAgentId &&
          Boolean(clip(take.oneLiner, takeLen)),
      );
      if (winner && !selectedWinner) {
        selected[selected.length - 1] = winner;
      }
    }
    selected.forEach((take, index) => {
      params.set(`t${index}`, encodeTake(take, takeLen));
    });
    return `${origin}/share?${params.toString()}`;
  };

  let promptLen = ROUND_SHARE_MAX_PROMPT_LEN;
  let takeLen = ROUND_SHARE_MAX_TAKE_LEN;
  let maxTakes = ROUND_SHARE_MAX_TAKES;
  let url = build(promptLen, takeLen, maxTakes);

  for (let guard = 0; guard < 64 && url.length > ROUND_SHARE_MAX_URL_LEN; guard += 1) {
    if (takeLen > 80) {
      takeLen = Math.max(80, Math.floor(takeLen * 0.7));
    } else if (maxTakes > 1) {
      maxTakes -= 1;
    } else if (promptLen > 160) {
      promptLen = Math.max(160, Math.floor(promptLen * 0.7));
    } else if (takeLen > 0) {
      takeLen = 0;
    } else if (promptLen > 0) {
      promptLen = 0;
    } else {
      break;
    }
    url = build(promptLen, takeLen, maxTakes);
  }

  return url;
}

/**
 * Parse the round payload from SharePage's query params. Returns null when
 * the link is not a round link or carries no usable takes, so the existing
 * single-take landing is never confused with an empty or malformed round.
 */
export function parseRoundShareUrl(params: URLSearchParams): RoundShareData | null {
  if (params.get('round') !== '1') return null;

  const prompt = clip(params.get('prompt') || '', ROUND_SHARE_MAX_PROMPT_LEN);
  const winnerAgentId = clip(params.get('winner') || '', ROUND_SHARE_MAX_AGENT_LEN);
  const takes: RoundShareTake[] = [];

  for (let index = 0; index < ROUND_SHARE_MAX_TAKES; index += 1) {
    const raw = params.get(`t${index}`) || '';
    if (!raw) continue;
    const firstSep = raw.indexOf('|');
    if (firstSep < 0) continue;
    const secondSep = raw.indexOf('|', firstSep + 1);
    const agentId = clip(raw.slice(0, firstSep), ROUND_SHARE_MAX_AGENT_LEN);
    const scoreRaw = secondSep < 0 ? '' : raw.slice(firstSep + 1, secondSep);
    const oneLiner = clip(
      secondSep < 0 ? '' : raw.slice(secondSep + 1),
      ROUND_SHARE_MAX_TAKE_LEN,
    );
    if (!agentId && !oneLiner) continue;
    takes.push({
      agentId,
      oneLiner,
      score: decodeScore(scoreRaw),
    });
  }

  if (!takes.length) return null;
  return {
    prompt,
    winnerAgentId: winnerAgentId || undefined,
    takes,
  };
}

/**
 * Plain-text clipboard payload for a shared round. Keeps the same attribution
 * style as the single-take clipboard so recipients can paste it into notes.
 */
export function formatRoundShareText(opts: {
  prompt: string;
  takes: readonly RoundShareTake[];
  resolveAgentName: (agentId: string) => string;
  shareUrl?: string;
}): string {
  const prompt = (opts.prompt || '').trim();
  const lines: string[] = ['Arena round'];
  if (prompt) {
    lines.push('', `Q: ${prompt}`);
  }
  const takes = opts.takes.slice(0, ROUND_SHARE_MAX_TAKES);
  if (takes.length) {
    lines.push('');
    takes.forEach((take, index) => {
      const name = opts.resolveAgentName(take.agentId) || take.agentId || `Take ${index + 1}`;
      const score = Number.isFinite(take.score) ? ` · ${Math.round(take.score ?? 0)}/100` : '';
      lines.push(`${name}${score}`);
      lines.push((take.oneLiner || '').trim() || '(no take text)');
    });
  }
  if (opts.shareUrl) {
    lines.push('', opts.shareUrl);
  }
  return lines.join('\n').trim();
}
