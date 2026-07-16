/** Portable markdown for Agent Mode Rooms list. */

import { formatIsoWhen } from './relativeTime';

export type AgentRoomExportItem = {
  name?: string | null;
  slug?: string | null;
  topic?: string | null;
  description?: string | null;
  memberCount?: number | null;
  taskCount?: number | null;
  createdAt?: string | null;
  activityAt?: string | null;
  roomId?: string | null;
};

function displayName(item: AgentRoomExportItem): string {
  const name = (item.name || '').trim();
  if (name) return name;
  const slug = (item.slug || '').trim();
  if (slug) return slug;
  return 'Untitled room';
}

export function formatAgentRoomsExport(opts: {
  items: AgentRoomExportItem[];
  totalCount?: number;
  filterNote?: string;
}): string {
  const lines: string[] = ['# Agent Rooms', ''];

  const total = opts.totalCount;
  const items = opts.items || [];
  if (typeof total === 'number' && Number.isFinite(total) && total > 0) {
    lines.push(
      items.length === total
        ? `**${items.length}** room${items.length === 1 ? '' : 's'}`
        : `**${items.length}** of **${total}** rooms in this view`,
    );
    lines.push('');
  }

  const filterNote = (opts.filterNote || '').trim();
  if (filterNote) {
    lines.push(`_Filtered view: ${filterNote}_`);
    lines.push('');
  }

  if (items.length === 0) {
    lines.push('_No rooms in this view._');
  } else {
    items.forEach((item, i) => {
      const title = displayName(item);
      lines.push(`## ${i + 1}. ${title}`);
      lines.push('');

      const topic = (item.topic || '').trim();
      if (topic) {
        lines.push(`**Topic:** ${topic}`);
        lines.push('');
      }

      const description = (item.description || '').trim();
      if (description) {
        lines.push(description);
        lines.push('');
      }

      const meta: string[] = [];
      if (typeof item.memberCount === 'number' && Number.isFinite(item.memberCount)) {
        meta.push(
          `${item.memberCount} member${item.memberCount === 1 ? '' : 's'}`,
        );
      }
      if (typeof item.taskCount === 'number' && Number.isFinite(item.taskCount)) {
        meta.push(`${item.taskCount} task${item.taskCount === 1 ? '' : 's'}`);
      }
      if (item.activityAt) meta.push(`Active ${formatIsoWhen(item.activityAt, { fallback: '—' })}`);
      else if (item.createdAt) meta.push(`Created ${formatIsoWhen(item.createdAt, { fallback: '—' })}`);
      if (meta.length > 0) {
        lines.push(`- ${meta.join(' · ')}`);
      }

      const slug = (item.slug || '').trim();
      if (slug) {
        lines.push(`- **Slug:** \`${slug}\``);
      }
      const roomId = (item.roomId || '').trim();
      if (roomId) {
        lines.push(`- _Room \`${roomId}\`_`);
      }
      lines.push('');
    });
  }

  lines.push('---');
  lines.push('_Shared from Arena Agent Rooms_');
  return lines.join('\n').trim() + '\n';
}
