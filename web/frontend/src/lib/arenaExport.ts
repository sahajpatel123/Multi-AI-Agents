import type { PromptResponse, ScoredAgent } from '../types';

export type ArenaExportPersona = {
  name: string;
  color?: string;
};

/**
 * Pick the winning scored take from an Arena response.
 * Prefers `is_winner`, then `winner_agent_id`, then highest score.
 */
export function pickArenaWinner(response: PromptResponse): ScoredAgent | null {
  const rows = response.all_responses || [];
  if (!rows.length) return null;
  const flagged = rows.find((r) => r.is_winner);
  if (flagged) return flagged;
  const byId = response.winner_agent_id
    ? rows.find((r) => r.response.agent_id === response.winner_agent_id)
    : null;
  if (byId) return byId;
  return [...rows].sort((a, b) => b.score - a.score)[0] ?? null;
}

/**
 * Portable markdown for just the winning mind — for notes, docs, and quick share.
 */
export function formatArenaWinnerExport(
  response: PromptResponse,
  resolvePersona: (agentId: string) => ArenaExportPersona,
): string {
  const winner = pickArenaWinner(response);
  if (!winner) {
    return [
      '# Arena · Winner',
      '',
      `**Question:** ${(response.prompt || '').trim() || '(no prompt)'}`,
      '',
      '_No winning take available yet._',
      '',
      '---',
      '_Shared from Arena_',
      '',
    ].join('\n');
  }

  const persona = resolvePersona(winner.response.agent_id);
  const name = persona.name || winner.response.agent_id;
  const score =
    typeof winner.score === 'number' && Number.isFinite(winner.score)
      ? Math.round(winner.score)
      : null;
  const oneLiner = (winner.response.one_liner || '').trim();
  const verdict = (winner.response.verdict || '').trim();
  const assumption = (winner.response.key_assumption || '').trim();

  const lines: string[] = [
    `# ${name} · Arena winner`,
    '',
    `**Question:** ${(response.prompt || '').trim() || '(no prompt)'}`,
    '',
  ];
  if (score != null) {
    lines.push(`**Score:** ${score}`, '');
  }
  if (oneLiner) {
    lines.push(`> ${oneLiner}`, '');
  }
  if (verdict && verdict !== oneLiner) {
    lines.push('## Full take', '', verdict, '');
  } else if (!oneLiner && verdict) {
    lines.push('## Full take', '', verdict, '');
  }
  if (assumption) {
    lines.push(`_Key assumption:_ ${assumption}`, '');
  }
  lines.push('---', '_Shared from Arena (winner only)_');
  return lines.join('\n').trim() + '\n';
}

/**
 * Build a portable markdown comparison of all four Arena takes.
 * Used by "Copy all takes" so users can paste into notes, docs, or share channels.
 */
export function formatArenaExport(
  response: PromptResponse,
  resolvePersona: (agentId: string) => ArenaExportPersona,
): string {
  const lines: string[] = [];
  lines.push('# Arena — four minds');
  lines.push('');
  lines.push(`**Question:** ${response.prompt.trim() || '(no prompt)'}`);
  lines.push('');

  const sorted = [...response.all_responses].sort((a, b) => {
    if (a.is_winner !== b.is_winner) return a.is_winner ? -1 : 1;
    return b.score - a.score;
  });

  for (const scored of sorted) {
    lines.push(formatAgentBlock(scored, resolvePersona(scored.response.agent_id)));
    lines.push('');
  }

  lines.push('---');
  lines.push('_Shared from Arena_');
  return lines.join('\n').trim() + '\n';
}

function formatAgentBlock(scored: ScoredAgent, persona: ArenaExportPersona): string {
  const name = persona.name || scored.response.agent_id;
  const badge = scored.is_winner ? ' · winner' : '';
  const score =
    typeof scored.score === 'number' && Number.isFinite(scored.score)
      ? ` · score ${Math.round(scored.score)}`
      : '';
  const oneLiner = (scored.response.one_liner || '').trim() || '_(no one-liner)_';
  const verdict = (scored.response.verdict || '').trim();

  const parts = [`## ${name}${badge}${score}`, '', oneLiner];
  if (verdict && verdict !== oneLiner) {
    parts.push('', `**Verdict:** ${verdict}`);
  }
  return parts.join('\n');
}
