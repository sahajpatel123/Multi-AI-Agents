/**
 * CatalogExport — derive a portable representation of the persona
 * catalog for download. Pure helpers; the widget lives at
 * components/CatalogExport.tsx and is mounted on the hub. Mirrors
 * the other lib helpers in keeping formatting logic out of React
 * so it can be unit-tested without a DOM.
 *
 * Two formats supported:
 *   - markdown: A human-readable list grouped by category with
 *     each tool's name, tagline, blurb, format, and path.
 *   - json: A flat array of `{ name, path, category, format,
 *     tagline, blurb }` records, sorted alphabetically by name.
 */

import {
  PERSONA_PLAYGROUND_ENTRIES,
  personaPlaygroundCategoryLabel,
  type PersonaPlaygroundCategory,
  type PersonaPlaygroundEntry,
} from '../data/personaPlayground';

export type ExportFormat = 'markdown' | 'json' | 'csv';

const CATEGORY_ORDER: readonly PersonaPlaygroundCategory[] = [
  'discover',
  'versus',
  'council',
  'roast',
  'decide',
  'forecast',
  'mosaic',
];

function escapeMarkdown(text: string): string {
  return text.replace(/([|`*_{}[\]<>])/g, '\\$1');
}

function groupByCategory() {
  const byCat = new Map<PersonaPlaygroundCategory, PersonaPlaygroundEntry[]>();
  for (const cat of CATEGORY_ORDER) byCat.set(cat, []);
  for (const entry of PERSONA_PLAYGROUND_ENTRIES) {
    byCat.get(entry.category)?.push(entry);
  }
  return byCat;
}

export function renderCatalogMarkdown(): string {
  const lines: string[] = [];
  lines.push('# Persona Playground catalog');
  lines.push('');
  lines.push(`${PERSONA_PLAYGROUND_ENTRIES.length} tools across ${CATEGORY_ORDER.length} categories.`);
  lines.push('');
  const byCat = groupByCategory();
  for (const cat of CATEGORY_ORDER) {
    const list = byCat.get(cat) ?? [];
    if (list.length === 0) continue;
    lines.push(`## ${personaPlaygroundCategoryLabel(cat)} (${list.length})`);
    lines.push('');
    for (const entry of list) {
      lines.push(`### [${escapeMarkdown(entry.name)}](${entry.path})`);
      lines.push('');
      lines.push(`*${escapeMarkdown(entry.tagline)}*`);
      lines.push('');
      lines.push(escapeMarkdown(entry.blurb));
      lines.push('');
      lines.push(`- Format: ${escapeMarkdown(entry.format)}`);
      lines.push(`- Path: \`${entry.path}\``);
      lines.push('');
    }
  }
  return lines.join('\n');
}

export function renderCatalogJson(): string {
  const records = [...PERSONA_PLAYGROUND_ENTRIES]
    .map((entry) => ({
      name: entry.name,
      path: entry.path,
      category: entry.category,
      format: entry.format,
      tagline: entry.tagline,
      blurb: entry.blurb,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return JSON.stringify(records, null, 2);
}

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function renderCatalogCsv(): string {
  const header = ['name', 'path', 'category', 'format', 'tagline', 'blurb'];
  const rows = [...PERSONA_PLAYGROUND_ENTRIES]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) =>
      [e.name, e.path, e.category, e.format, e.tagline, e.blurb]
        .map(escapeCsv)
        .join(','),
    );
  return [header.join(','), ...rows].join('\n');
}

export function renderCatalog(format: ExportFormat): string {
  if (format === 'markdown') return renderCatalogMarkdown();
  if (format === 'csv') return renderCatalogCsv();
  return renderCatalogJson();
}

export function catalogFilename(format: ExportFormat): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const ext = format === 'markdown' ? 'md' : format === 'csv' ? 'csv' : 'json';
  return `persona-playground-${stamp}.${ext}`;
}

/**
 * Trigger a browser download of the catalog. Uses a temporary
 * <a download> element — silent on failure (private mode may
 * block it; the caller decides whether to surface a toast).
 */
export function downloadCatalog(format: ExportFormat): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    const blob = new Blob([renderCatalog(format)], {
      type:
        format === 'markdown'
          ? 'text/markdown;charset=utf-8'
          : format === 'csv'
            ? 'text/csv;charset=utf-8'
            : 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = catalogFilename(format);
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}