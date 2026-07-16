/** Portable markdown for Agent Answer Evolution analysis. */

export type EvolutionExportShift = {
  from_task?: string;
  to_task?: string;
  gained_terms?: string[];
  lost_terms?: string[];
};

export type EvolutionExportTimelineItem = {
  task_id?: string | null;
  created_at?: string | null;
  snippet?: string | null;
  score?: number | null;
  isCurrent?: boolean;
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function formatTemporalEvolutionExport(opts: {
  question?: string | null;
  taskId?: string | null;
  evolutionScore?: number | null;
  trendLabel?: string | null;
  stability?: number | null;
  relatedCount?: number | null;
  message?: string | null;
  shifts?: EvolutionExportShift[];
  timeline?: EvolutionExportTimelineItem[];
}): string {
  const lines: string[] = ['# Arena Agent · Answer evolution', ''];

  const question = (opts.question || '').trim();
  if (question) {
    lines.push(`**Question:** ${question}`);
    lines.push('');
  }

  const meta: string[] = [];
  if (typeof opts.evolutionScore === 'number' && Number.isFinite(opts.evolutionScore)) {
    const label = (opts.trendLabel || '').trim();
    meta.push(
      `**Evolution:** ${Math.round(opts.evolutionScore)}/100${label ? ` · ${label}` : ''}`,
    );
  }
  if (typeof opts.stability === 'number' && Number.isFinite(opts.stability)) {
    meta.push(`**Stability:** ${Math.round(opts.stability)}/100`);
  }
  if (typeof opts.relatedCount === 'number' && opts.relatedCount > 0) {
    meta.push(
      `**Related runs:** ${opts.relatedCount}`,
    );
  }
  if (meta.length > 0) {
    for (const m of meta) lines.push(m);
    lines.push('');
  }

  const msg = (opts.message || '').trim();
  if (msg) {
    lines.push(msg);
    lines.push('');
  }

  const timeline = opts.timeline || [];
  if (timeline.length > 0) {
    lines.push('## Related runs');
    lines.push('');
    timeline.forEach((item, i) => {
      const parts: string[] = [];
      const when = formatWhen(item.created_at);
      if (when) parts.push(when);
      if (typeof item.score === 'number' && Number.isFinite(item.score)) {
        parts.push(`${Math.round(item.score)}/100`);
      }
      if (item.isCurrent) parts.push('current');
      const head = parts.length > 0 ? parts.join(' · ') : `Run ${i + 1}`;
      lines.push(`### ${i + 1}. ${head}`);
      lines.push('');
      const snippet = (item.snippet || '').trim();
      if (snippet) {
        lines.push(`> ${snippet}`);
        lines.push('');
      }
      const tid = (item.task_id || '').trim();
      if (tid) {
        lines.push(`- _Task \`${tid}\`_`);
        lines.push('');
      }
    });
  }

  const shifts = opts.shifts || [];
  if (shifts.length > 0) {
    lines.push('## Key shifts between runs');
    lines.push('');
    shifts.forEach((s, i) => {
      const from = (s.from_task || '').trim().slice(0, 8);
      const to = (s.to_task || '').trim().slice(0, 8);
      const pair =
        from || to
          ? ` (${from || '?'}${from || to ? ' → ' : ''}${to || '?'})`
          : '';
      lines.push(`### ${i + 1}. Shift${pair}`);
      lines.push('');
      const gained = (s.gained_terms || []).map((t) => (t || '').trim()).filter(Boolean);
      const lost = (s.lost_terms || []).map((t) => (t || '').trim()).filter(Boolean);
      if (gained.length > 0) {
        lines.push(`- **Gained:** ${gained.join(', ')}`);
      }
      if (lost.length > 0) {
        lines.push(`- **Faded:** ${lost.join(', ')}`);
      }
      if (gained.length === 0 && lost.length === 0) {
        lines.push('- _No term-level shift recorded_');
      }
      lines.push('');
    });
  } else if (!msg && timeline.length === 0) {
    lines.push('_Related runs stay close in vocabulary — little drift detected yet._');
    lines.push('');
  }

  const taskId = (opts.taskId || '').trim();
  if (taskId) {
    lines.push(`_Task \`${taskId}\`_`);
    lines.push('');
  }

  lines.push('---');
  lines.push('_Shared from Arena Agent_');
  return lines.join('\n').trim() + '\n';
}
