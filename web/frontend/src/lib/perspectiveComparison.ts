/** Pure helpers for Arena perspective comparison. */

const DEFAULT_STOP = new Set([
  'this',
  'that',
  'have',
  'with',
  'from',
  'your',
  'they',
  'what',
  'when',
  'will',
  'would',
  'could',
  'should',
  'about',
  'there',
  'their',
  'which',
  'while',
  'where',
  'been',
  'were',
  'into',
  'than',
  'then',
  'them',
  'also',
  'just',
  'more',
  'most',
  'only',
  'over',
  'such',
  'very',
  'some',
  'does',
  'done',
  'make',
  'made',
  'need',
  'like',
  'even',
  'each',
  'both',
  'being',
]);

export function extractPerspectiveKeywords(text: string, limit = 5): string[] {
  const words = (text || '').toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    if (DEFAULT_STOP.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= limit) break;
  }
  return out;
}

/** Confidence may arrive as 0–1 or 0–100; always format as integer 0–100. */
export function formatConfidenceScore(raw: number | null | undefined): string | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const n = raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
  if (n < 0 || n > 100) return null;
  return String(n);
}

export type PerspectiveRowInput = {
  agentId: string;
  name: string;
  color?: string;
  oneLiner?: string;
  score?: number | null;
  confidence?: number | null;
  isWinner?: boolean;
};

export type PerspectiveRow = {
  agentId: string;
  name: string;
  color: string;
  oneLiner: string;
  keywords: string[];
  scoreLabel: string | null;
  confidenceLabel: string | null;
  isWinner: boolean;
};

export function buildPerspectiveRows(inputs: PerspectiveRowInput[]): PerspectiveRow[] {
  return (inputs || []).map((r) => {
    const oneLiner = (r.oneLiner || '').trim();
    const score =
      typeof r.score === 'number' && Number.isFinite(r.score) ? Math.round(r.score) : null;
    return {
      agentId: r.agentId,
      name: (r.name || r.agentId || 'Mind').trim() || 'Mind',
      color: (r.color || '#C4956A').trim() || '#C4956A',
      oneLiner,
      keywords: extractPerspectiveKeywords(oneLiner),
      scoreLabel: score != null ? String(score) : null,
      confidenceLabel: formatConfidenceScore(r.confidence ?? null),
      isWinner: Boolean(r.isWinner),
    };
  });
}

export function formatPerspectiveComparisonMarkdown(opts: {
  question?: string;
  rows: PerspectiveRow[];
}): string {
  const lines: string[] = ['# Arena perspective comparison', ''];
  const q = (opts.question || '').trim();
  if (q) {
    lines.push(`**Question:** ${q}`);
    lines.push('');
  }
  const rows = opts.rows || [];
  if (rows.length === 0) {
    lines.push('_No perspectives available._');
  } else {
    for (const r of rows) {
      const badges: string[] = [];
      if (r.isWinner) badges.push('winner');
      if (r.scoreLabel) badges.push(`score ${r.scoreLabel}`);
      if (r.confidenceLabel) badges.push(`confidence ${r.confidenceLabel}%`);
      const badge = badges.length ? ` · ${badges.join(' · ')}` : '';
      lines.push(`## ${r.name}${badge}`);
      lines.push('');
      if (r.oneLiner) {
        lines.push(`> ${r.oneLiner}`);
        lines.push('');
      }
      if (r.keywords.length) {
        lines.push(`Keywords: ${r.keywords.join(', ')}`);
        lines.push('');
      }
    }
  }
  lines.push('---');
  lines.push('_Shared from Arena_');
  return lines.join('\n').trim() + '\n';
}
