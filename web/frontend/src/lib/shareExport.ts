import type { RoundShareData } from './roundShare';

const CSV_FORMULA_PREFIXES: readonly string[] = ['=', '+', '-', '@', '\t', '\r'];

/** Versioned, machine-readable payload for a public single-take share. */
export type ShareTakeJsonPayload = {
  schema_version: 1;
  kind: 'take';
  agent: {
    id: string | null;
    name: string;
  };
  prompt: string | null;
  response: string;
  share_url: string | null;
};

/** Versioned, machine-readable payload for a public round share. */
export type ShareRoundJsonPayload = {
  schema_version: 1;
  kind: 'round';
  prompt: string | null;
  winner_agent_id: string | null;
  takes: Array<{
    agent_id: string | null;
    agent_name: string;
    one_liner: string;
    score: number | null;
  }>;
  share_url: string | null;
};

function optionalText(value: string | undefined | null): string | null {
  const text = (value || '').trim();
  return text || null;
}

function scoreOrNull(value: number | undefined): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value as number)));
}

function csvCell(value: string | number | boolean | null | undefined): string {
  const raw = value == null ? '' : String(value);
  // Shared prompts and answers are user- or model-controlled. Neutralize
  // formula-like cells so opening an export in a spreadsheet cannot execute
  // content that merely happened to start with =, +, -, or @.
  const firstSignificant = raw.trimStart()[0] || '';
  const safe = CSV_FORMULA_PREFIXES.includes(firstSignificant) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildShareTakeJsonPayload(opts: {
  agentId: string;
  agentName: string;
  prompt?: string;
  response?: string;
  shareUrl?: string;
}): ShareTakeJsonPayload {
  return {
    schema_version: 1,
    kind: 'take',
    agent: {
      id: optionalText(opts.agentId),
      name: (opts.agentName || 'Arena mind').trim() || 'Arena mind',
    },
    prompt: optionalText(opts.prompt),
    response: (opts.response || '').trim(),
    share_url: optionalText(opts.shareUrl),
  };
}

export function buildShareRoundJsonPayload(opts: {
  round: RoundShareData;
  resolveAgentName: (agentId: string) => string;
  shareUrl?: string;
}): ShareRoundJsonPayload {
  return {
    schema_version: 1,
    kind: 'round',
    prompt: optionalText(opts.round.prompt),
    winner_agent_id: optionalText(opts.round.winnerAgentId),
    takes: opts.round.takes.map((take) => ({
      agent_id: optionalText(take.agentId),
      agent_name:
        (opts.resolveAgentName(take.agentId) || take.agentId || 'Arena mind').trim() ||
        'Arena mind',
      one_liner: (take.oneLiner || '').trim(),
      score: scoreOrNull(take.score),
    })),
    share_url: optionalText(opts.shareUrl),
  };
}

/**
 * Spreadsheet-friendly export for a public round link. The prompt and share
 * URL repeat on each row so the file remains useful when filtered or pivoted,
 * while the winner flag keeps the public judgment visible outside Arena.
 * UTF-8 BOM + CRLF makes the file open cleanly in common spreadsheet apps.
 */
export function formatShareRoundCsv(opts: {
  round: RoundShareData;
  resolveAgentName: (agentId: string) => string;
  shareUrl?: string;
}): string {
  const headers = [
    'prompt',
    'agent_id',
    'agent_name',
    'score',
    'winner',
    'one_liner',
    'share_url',
  ];
  const winnerAgentId = optionalText(opts.round.winnerAgentId);
  const lines = [headers.map(csvCell).join(',')];

  opts.round.takes.forEach((take) => {
    const score = scoreOrNull(take.score);
    lines.push(
      [
        optionalText(opts.round.prompt),
        optionalText(take.agentId),
        (opts.resolveAgentName(take.agentId) || take.agentId || 'Arena mind').trim() ||
          'Arena mind',
        score,
        winnerAgentId && take.agentId === winnerAgentId ? 'yes' : 'no',
        (take.oneLiner || '').trim(),
        optionalText(opts.shareUrl),
      ]
        .map(csvCell)
        .join(','),
    );
  });

  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
