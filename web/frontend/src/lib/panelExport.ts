/** Portable markdown for the current four-mind Arena panel. */

export type PanelExportPersona = {
  name: string;
  quote?: string;
  description?: string;
  id?: string;
};

export function formatPanelExport(opts: {
  minds: PanelExportPersona[];
  isDefault?: boolean;
}): string {
  const lines: string[] = [
    '# Arena panel — four minds',
    '',
  ];

  if (opts.isDefault) {
    lines.push('_Default four minds_');
    lines.push('');
  }

  const minds = opts.minds || [];
  if (minds.length === 0) {
    lines.push('_No minds on this panel._');
  } else {
    minds.forEach((m, i) => {
      const name = (m.name || 'Mind').trim() || 'Mind';
      const slot = i + 1;
      lines.push(`## Slot ${slot} · ${name}`);
      lines.push('');
      const quote = (m.quote || '').trim();
      if (quote) {
        lines.push(`> ${quote}`);
        lines.push('');
      }
      const description = (m.description || '').trim();
      if (description) {
        lines.push(description);
        lines.push('');
      }
      const id = (m.id || '').trim();
      if (id) {
        lines.push(`_id: \`${id}\`_`);
        lines.push('');
      }
    });
  }

  lines.push('---');
  lines.push('_Shared from Arena Personas_');
  return lines.join('\n').trim() + '\n';
}
