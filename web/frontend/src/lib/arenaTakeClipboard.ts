/**
 * Clipboard / share body for a single Arena mind take.
 * Prefers the full verdict over the short one-liner when available.
 */

export function pickArenaTakeBody(opts: {
  verdict?: string | null;
  oneLiner?: string | null;
}): string {
  const verdict = (opts.verdict || '').trim();
  if (verdict) return verdict;
  return (opts.oneLiner || '').trim();
}

/**
 * Portable markdown for copying one mind's take (question + full body).
 */
export function formatArenaTakeClipboard(opts: {
  agentName: string;
  verdict?: string | null;
  oneLiner?: string | null;
  prompt?: string | null;
}): string {
  const name = (opts.agentName || 'Arena mind').trim() || 'Arena mind';
  const take = pickArenaTakeBody(opts);
  const prompt = (opts.prompt || '').trim();
  const lines: string[] = [`# ${name} · Arena`, ''];
  if (prompt) {
    lines.push(`**Question:** ${prompt}`, '');
  }
  if (take) {
    lines.push('## Take', '', take, '');
  } else {
    lines.push('_Empty take._', '');
  }
  lines.push('---', '_Copied from Arena_');
  return lines.join('\n').trim() + '\n';
}

/** Short teaser for social / native share sheets (prefers one-liner). */
export function pickArenaTakeTeaser(opts: {
  verdict?: string | null;
  oneLiner?: string | null;
  maxLen?: number;
}): string {
  const one = (opts.oneLiner || '').trim();
  const body = one || pickArenaTakeBody(opts);
  const max = opts.maxLen && opts.maxLen > 0 ? opts.maxLen : 280;
  if (body.length <= max) return body;
  return `${body.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
