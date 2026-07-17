/** Portable markdown for the Personas full library (filtered view). */

export type PersonasLibraryExportItem = {
  name?: string | null;
  quote?: string | null;
  description?: string | null;
  id?: string | null;
  onPanel?: boolean | null;
  unlocked?: boolean | null;
  panelSlot?: number | null;
};

function displayName(item: PersonasLibraryExportItem): string {
  const name = (item.name || '').trim();
  if (name) return name;
  const id = (item.id || '').trim();
  if (id) return id;
  return 'Untitled mind';
}

export function formatPersonasLibraryExport(opts: {
  items: PersonasLibraryExportItem[];
  totalCount?: number;
  filterNote?: string;
}): string {
  const lines: string[] = ['# Arena Personas · Full library', ''];

  const total = opts.totalCount;
  const items = opts.items || [];
  if (typeof total === 'number' && Number.isFinite(total) && total > 0) {
    lines.push(
      items.length === total
        ? `**${items.length}** mind${items.length === 1 ? '' : 's'}`
        : `**${items.length}** of **${total}** minds in this view`,
    );
    lines.push('');
  }

  const filterNote = (opts.filterNote || '').trim();
  if (filterNote) {
    lines.push(`_Filtered view: ${filterNote}_`);
    lines.push('');
  }

  if (items.length === 0) {
    lines.push('_No minds in this view._');
  } else {
    items.forEach((item, i) => {
      const title = displayName(item);
      lines.push(`## ${i + 1}. ${title}`);
      lines.push('');

      const quote = (item.quote || '').trim();
      if (quote) {
        lines.push(`> ${quote}`);
        lines.push('');
      }

      const description = (item.description || '').trim();
      if (description) {
        lines.push(description);
        lines.push('');
      }

      const meta: string[] = [];
      if (item.onPanel) {
        const slot =
          typeof item.panelSlot === 'number' && Number.isFinite(item.panelSlot)
            ? item.panelSlot
            : null;
        meta.push(slot != null ? `On panel · slot ${slot}` : 'On panel');
      }
      if (item.unlocked === true) meta.push('Unlocked');
      if (item.unlocked === false) meta.push('Locked');
      if (meta.length > 0) {
        lines.push(`- ${meta.join(' · ')}`);
      }

      const id = (item.id || '').trim();
      if (id) {
        lines.push(`- _id: \`${id}\`_`);
      }
      lines.push('');
    });
  }

  lines.push('---');
  lines.push('_Shared from Arena Personas library_');
  return lines.join('\n').trim() + '\n';
}

/**
 * Clipboard text for a single mind from the Personas library.
 * Prefer name + quote + description so a shared note stays useful outside the app.
 */
export function formatPersonasLibraryItemCopy(item: PersonasLibraryExportItem): string {
  const name = displayName(item);
  const quote = (item.quote || '').trim();
  const description = (item.description || '').trim();
  const id = (item.id || '').trim();
  // Require real content — do not invent "Untitled mind" alone.
  if (!(item.name || '').trim() && !quote && !description && !id) return '';

  const lines: string[] = [`# ${name}`, ''];

  if (quote) {
    lines.push(`> ${quote}`);
    lines.push('');
  }
  if (description) {
    lines.push(description);
    lines.push('');
  }

  const meta: string[] = [];
  if (item.onPanel) {
    const slot =
      typeof item.panelSlot === 'number' && Number.isFinite(item.panelSlot)
        ? item.panelSlot
        : null;
    meta.push(slot != null ? `On panel · slot ${slot}` : 'On panel');
  }
  if (item.unlocked === true) meta.push('Unlocked');
  if (item.unlocked === false) meta.push('Locked');
  if (meta.length > 0) {
    lines.push(`- ${meta.join(' · ')}`);
  }
  if (id) {
    lines.push(`- _id: \`${id}\`_`);
  }

  lines.push('');
  lines.push('---');
  lines.push('_Shared from Arena Personas library_');
  return lines.join('\n').trim() + '\n';
}
