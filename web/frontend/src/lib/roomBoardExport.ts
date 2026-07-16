/** Portable markdown for a collaborative Room research board. */

export type RoomBoardExportTask = {
  title?: string | null;
  author?: string | null;
  score?: number | null;
  createdAt?: string | null;
  excerpt?: string | null;
  question?: string | null;
  taskId?: string | null;
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/**
 * Collapse answer payloads (plain or JSON-ish Agent output) into a short excerpt.
 */
export function plainAnswerExcerpt(answer: unknown, maxLen = 280): string {
  if (answer == null) return '';
  let text = '';
  if (typeof answer === 'string') {
    const trimmed = answer.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (Array.isArray(parsed.sentences)) {
          text = parsed.sentences
            .map((s) =>
              s && typeof s === 'object' && 'text' in s
                ? String((s as { text?: unknown }).text || '')
                : '',
            )
            .filter(Boolean)
            .join(' ');
        } else if (typeof parsed.text === 'string') {
          text = parsed.text;
        } else if (typeof parsed.final_answer === 'string') {
          text = parsed.final_answer;
        } else {
          text = trimmed;
        }
      } catch {
        text = trimmed;
      }
    } else {
      text = trimmed;
    }
  } else if (typeof answer === 'object') {
    try {
      text = JSON.stringify(answer);
    } catch {
      return '';
    }
  } else {
    text = String(answer);
  }

  text = text
    .replace(/#{1,3}\s/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trimEnd()}…`;
}

export function formatRoomBoardExport(opts: {
  roomName?: string;
  shareUrl?: string;
  memberCount?: number | null;
  totalTaskCount?: number | null;
  filterNote?: string | null;
  tasks?: RoomBoardExportTask[];
}): string {
  const room = (opts.roomName || 'Research room').trim() || 'Research room';
  const lines: string[] = [`# ${room} · Research board`, ''];

  const meta: string[] = [];
  if (typeof opts.memberCount === 'number' && opts.memberCount > 0) {
    meta.push(`${opts.memberCount} researcher${opts.memberCount === 1 ? '' : 's'}`);
  }
  const total =
    typeof opts.totalTaskCount === 'number' && Number.isFinite(opts.totalTaskCount)
      ? opts.totalTaskCount
      : null;
  const tasks = opts.tasks || [];
  if (total != null && total > 0) {
    meta.push(
      tasks.length === total
        ? `${tasks.length} task${tasks.length === 1 ? '' : 's'}`
        : `${tasks.length} of ${total} tasks`,
    );
  } else if (tasks.length > 0) {
    meta.push(`${tasks.length} task${tasks.length === 1 ? '' : 's'}`);
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

  const filterNote = (opts.filterNote || '').trim();
  if (filterNote) {
    lines.push(`_Filtered view: ${filterNote}_`);
    lines.push('');
  }

  if (tasks.length === 0) {
    lines.push(
      filterNote
        ? '_No research tasks match this filter._'
        : '_No research tasks on the board yet._',
    );
    lines.push('');
  } else {
    tasks.forEach((t, i) => {
      const title = (t.title || '').trim() || 'Untitled task';
      lines.push(`## ${i + 1}. ${title}`);
      lines.push('');

      const metaRow: string[] = [];
      const author = (t.author || '').trim();
      if (author) metaRow.push(author);
      if (typeof t.score === 'number' && Number.isFinite(t.score)) {
        metaRow.push(`${Math.round(t.score)}/100`);
      }
      const when = formatWhen(t.createdAt);
      if (when) metaRow.push(when);
      if (metaRow.length > 0) {
        lines.push(`- ${metaRow.join(' · ')}`);
      }

      const question = (t.question || '').trim();
      if (question && question !== title) {
        lines.push(`- **Question:** ${question}`);
      }

      const excerpt = (t.excerpt || '').trim();
      if (excerpt) {
        lines.push(`- _${excerpt}_`);
      }

      const taskId = (t.taskId || '').trim();
      if (taskId) {
        lines.push(`- _Task \`${taskId}\`_`);
      }

      lines.push('');
    });
  }

  lines.push('---');
  lines.push('_Shared from Arena Rooms_');
  return lines.join('\n').trim() + '\n';
}
