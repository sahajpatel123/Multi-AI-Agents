/** Portable markdown for Room perspective drift analysis. */

export type DriftExportCluster = {
  theme?: string;
  size?: number;
  members?: Array<{ user?: string }>;
};

export type DriftExportPair = {
  similarity?: number;
  task_a?: { user?: string; snippet?: string };
  task_b?: { user?: string; snippet?: string };
};

export function formatPerspectiveDriftExport(opts: {
  roomName?: string;
  driftScore?: number | null;
  label?: string | null;
  taskCount?: number | null;
  meanSimilarity?: number | null;
  message?: string | null;
  clusters?: DriftExportCluster[];
  pairs?: DriftExportPair[];
}): string {
  const room = (opts.roomName || 'Research room').trim() || 'Research room';
  const lines: string[] = [`# ${room} · Perspective drift`, ''];

  if (typeof opts.driftScore === 'number' && Number.isFinite(opts.driftScore)) {
    const label = (opts.label || '').trim();
    lines.push(
      `**Drift:** ${Math.round(opts.driftScore)}/100${label ? ` · ${label}` : ''}`,
    );
  }
  if (typeof opts.taskCount === 'number' && opts.taskCount > 0) {
    lines.push(`**Tasks:** ${opts.taskCount}`);
  }
  if (typeof opts.meanSimilarity === 'number' && Number.isFinite(opts.meanSimilarity)) {
    lines.push(`**Mean overlap:** ${Math.round(opts.meanSimilarity * 100)}%`);
  }
  if (lines.length > 2) lines.push('');

  const msg = (opts.message || '').trim();
  if (msg) {
    lines.push(msg);
    lines.push('');
  }

  const clusters = opts.clusters || [];
  if (clusters.length > 0) {
    lines.push('## Viewpoint clusters');
    lines.push('');
    clusters.forEach((c, i) => {
      const theme = (c.theme || `Cluster ${i + 1}`).trim();
      const size = typeof c.size === 'number' ? c.size : c.members?.length || 0;
      const people = (c.members || [])
        .map((m) => (m.user || '').trim())
        .filter(Boolean)
        .join(', ');
      lines.push(`${i + 1}. **${theme}** (${size} task${size === 1 ? '' : 's'})`);
      if (people) lines.push(`   - ${people}`);
    });
    lines.push('');
  }

  const pairs = opts.pairs || [];
  if (pairs.length > 0) {
    lines.push('## Sharpest divergences');
    lines.push('');
    pairs.forEach((p, i) => {
      const a = p.task_a || {};
      const b = p.task_b || {};
      const sim =
        typeof p.similarity === 'number' && Number.isFinite(p.similarity)
          ? `${Math.round(p.similarity * 100)}% overlap`
          : 'overlap n/a';
      lines.push(`### ${i + 1}. ${(a.user || 'Member A').trim()} vs ${(b.user || 'Member B').trim()}`);
      lines.push('');
      lines.push(`_${sim}_`);
      lines.push('');
      lines.push(`- **${(a.user || 'A').trim()}:** ${(a.snippet || '—').trim()}`);
      lines.push(`- **${(b.user || 'B').trim()}:** ${(b.snippet || '—').trim()}`);
      lines.push('');
    });
  }

  if (clusters.length === 0 && pairs.length === 0 && !msg) {
    lines.push('_Not enough answer text yet to cluster viewpoints._');
    lines.push('');
  }

  lines.push('---');
  lines.push('_Shared from Arena Rooms_');
  return lines.join('\n').trim() + '\n';
}
