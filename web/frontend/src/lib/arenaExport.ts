import type { PromptResponse, ScoredAgent } from '../types';

export type ArenaExportPersona = {
  name: string;
  color?: string;
};

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
