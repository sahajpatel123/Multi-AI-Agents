/** Portable markdown for a collaborative Room group synthesis. */

export type RoomSynthesisContradiction = {
  member_a?: string;
  member_b?: string;
  claim_a?: string;
  claim_b?: string;
  resolution_hint?: string;
};

export type RoomSynthesisTask = {
  title?: string;
  author?: string;
  score?: number | null;
};

export function formatRoomSynthesisExport(opts: {
  roomName: string;
  shareUrl?: string;
  synthesis?: string;
  patterns?: string[];
  contradictions?: RoomSynthesisContradiction[];
  tasks?: RoomSynthesisTask[];
  memberCount?: number;
  taskCount?: number;
}): string {
  const roomName = (opts.roomName || 'Research room').trim() || 'Research room';
  const lines: string[] = [
    `# ${roomName} · Group synthesis`,
    '',
  ];

  const meta: string[] = [];
  if (typeof opts.memberCount === 'number' && opts.memberCount > 0) {
    meta.push(`${opts.memberCount} researcher${opts.memberCount === 1 ? '' : 's'}`);
  }
  if (typeof opts.taskCount === 'number' && opts.taskCount > 0) {
    meta.push(`${opts.taskCount} task${opts.taskCount === 1 ? '' : 's'}`);
  }
  if (meta.length > 0) {
    lines.push(meta.join(' · '));
    lines.push('');
  }

  const shareUrl = (opts.shareUrl || '').trim();
  if (shareUrl) {
    lines.push(`**Room:** ${shareUrl}`);
    lines.push('');
  }

  const contradictions = opts.contradictions || [];
  if (contradictions.length > 0) {
    lines.push('## Contradictions');
    lines.push('');
    contradictions.forEach((c, i) => {
      const a = (c.member_a || 'Member A').trim() || 'Member A';
      const b = (c.member_b || 'Member B').trim() || 'Member B';
      lines.push(`### ${i + 1}. ${a} vs ${b}`);
      lines.push('');
      const claimA = (c.claim_a || '').trim();
      const claimB = (c.claim_b || '').trim();
      if (claimA) lines.push(`- **${a}:** ${claimA}`);
      if (claimB) lines.push(`- **${b}:** ${claimB}`);
      const hint = (c.resolution_hint || '').trim();
      if (hint) {
        lines.push(`- _Resolution hint:_ ${hint}`);
      }
      lines.push('');
    });
  }

  const patterns = (opts.patterns || []).map((p) => (p || '').trim()).filter(Boolean);
  if (patterns.length > 0) {
    lines.push('## Shared patterns');
    lines.push('');
    for (const p of patterns) {
      lines.push(`- ${p}`);
    }
    lines.push('');
  }

  const synthesis = (opts.synthesis || '').trim();
  if (synthesis) {
    lines.push('## Synthesis');
    lines.push('');
    lines.push(synthesis);
    lines.push('');
  } else if (contradictions.length === 0 && patterns.length === 0) {
    lines.push('_No synthesis available yet — add two or more research tasks._');
    lines.push('');
  }

  const tasks = opts.tasks || [];
  if (tasks.length > 0) {
    lines.push('## Tasks on the board');
    lines.push('');
    tasks.forEach((t, i) => {
      const title = (t.title || 'Untitled task').trim() || 'Untitled task';
      const author = (t.author || '').trim();
      const score =
        typeof t.score === 'number' && Number.isFinite(t.score) ? Math.round(t.score) : null;
      let row = `${i + 1}. **${title}**`;
      if (author) row += ` — ${author}`;
      if (score != null) row += ` (${score}/100)`;
      lines.push(row);
    });
    lines.push('');
  }

  lines.push('---');
  lines.push('_Shared from Arena Rooms_');
  return lines.join('\n').trim() + '\n';
}
