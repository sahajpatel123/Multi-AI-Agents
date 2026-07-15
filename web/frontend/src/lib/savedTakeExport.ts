/** Portable markdown for a bookmarked Arena take. */

export function formatSavedTakeExport(opts: {
  agentName: string;
  prompt: string;
  oneLiner: string;
  verdict?: string;
  score?: number | null;
}): string {
  const agentName = (opts.agentName || 'Arena mind').trim() || 'Arena mind';
  const prompt = (opts.prompt || '').trim() || '(no prompt)';
  const oneLiner = (opts.oneLiner || '').trim();
  const verdict = (opts.verdict || '').trim();
  const lines: string[] = [
    `# ${agentName} · Saved on Arena`,
    '',
    `**Question:** ${prompt}`,
    '',
  ];
  if (oneLiner) {
    lines.push(`> ${oneLiner}`);
    lines.push('');
  }
  if (verdict && verdict !== oneLiner) {
    lines.push('## Full take');
    lines.push('');
    lines.push(verdict);
    lines.push('');
  }
  if (typeof opts.score === 'number' && Number.isFinite(opts.score)) {
    lines.push(`_Score: ${Math.round(opts.score)}_`);
    lines.push('');
  }
  lines.push('---');
  lines.push('_Shared from Arena (saved take)_');
  return lines.join('\n').trim() + '\n';
}
