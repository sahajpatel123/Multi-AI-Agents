/** Portable markdown for the Agent task templates catalog. */

export type TemplatesExportItem = {
  title?: string | null;
  category?: string | null;
  description?: string | null;
  example?: string | null;
  promptTemplate?: string | null;
  slots?: string[] | null;
  expertise?: string | null;
  id?: string | null;
  disabled?: boolean | null;
  disabledReason?: string | null;
};

export function formatTemplatesExport(opts: {
  items: TemplatesExportItem[];
  totalCount?: number | null;
  filterNote?: string | null;
}): string {
  const items = opts.items || [];
  const lines: string[] = ['# Arena Agent · Task templates', ''];

  const total =
    typeof opts.totalCount === 'number' && Number.isFinite(opts.totalCount)
      ? opts.totalCount
      : null;
  if (total != null && total > 0) {
    lines.push(
      items.length === total
        ? `**${items.length}** template${items.length === 1 ? '' : 's'}`
        : `**${items.length}** of **${total}** templates in this view`,
    );
    lines.push('');
  } else if (items.length > 0) {
    lines.push(`**${items.length}** template${items.length === 1 ? '' : 's'}`);
    lines.push('');
  }

  const filterNote = (opts.filterNote || '').trim();
  if (filterNote) {
    lines.push(`_Filtered view: ${filterNote}_`);
    lines.push('');
  }

  if (items.length === 0) {
    lines.push(
      filterNote
        ? '_No templates match this filter._'
        : '_No task templates available._',
    );
    lines.push('');
  } else {
    items.forEach((t, i) => {
      const title = (t.title || '').trim() || 'Untitled template';
      lines.push(`## ${i + 1}. ${title}`);
      lines.push('');

      const meta: string[] = [];
      const cat = (t.category || '').trim();
      if (cat) meta.push(cat);
      const slots = (t.slots || []).map((s) => (s || '').trim()).filter(Boolean);
      if (slots.length > 0) meta.push(`${slots.length} slot${slots.length === 1 ? '' : 's'}`);
      const expertise = (t.expertise || '').trim();
      if (expertise) meta.push(`expertise: ${expertise}`);
      if (t.disabled) meta.push('disabled');
      if (meta.length > 0) {
        lines.push(`- ${meta.join(' · ')}`);
      }

      const description = (t.description || '').trim();
      if (description) {
        lines.push(`- ${description}`);
      }
      const example = (t.example || '').trim();
      if (example) {
        lines.push(`- **Example:** ${example}`);
      }
      const prompt = (t.promptTemplate || '').trim();
      if (prompt) {
        lines.push('');
        lines.push('```');
        lines.push(prompt);
        lines.push('```');
      }
      const reason = (t.disabledReason || '').trim();
      if (t.disabled && reason) {
        lines.push(`- _Unavailable: ${reason}_`);
      }
      const id = (t.id || '').trim();
      if (id) {
        lines.push(`- _id: \`${id}\`_`);
      }
      lines.push('');
    });
  }

  lines.push('---');
  lines.push('_Shared from Arena Agent templates_');
  return lines.join('\n').trim() + '\n';
}
