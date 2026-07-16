/** Sort helpers for Agent task templates catalog. */

export type TemplatesSort = 'default' | 'title' | 'category' | 'slots';

export const TEMPLATES_SORT_OPTIONS: Array<{ value: TemplatesSort; label: string }> = [
  { value: 'default', label: 'Catalog order' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'category', label: 'Category' },
  { value: 'slots', label: 'Most slots' },
];

export function templatesSortLabel(sort: TemplatesSort): string {
  return TEMPLATES_SORT_OPTIONS.find((o) => o.value === sort)?.label || 'Catalog order';
}

export type TemplatesSortable = {
  id?: string | null;
  title?: string | null;
  category?: string | null;
  slots?: string[] | null;
};

function cmpStr(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

/**
 * Sort templates for display. Does not mutate the input.
 * `default` preserves the incoming catalog order.
 */
export function sortTemplates<T extends TemplatesSortable>(
  templates: T[],
  sort: TemplatesSort,
): T[] {
  if (sort === 'default') return [...(templates || [])];

  const list = [...(templates || [])];
  const tie = (a: T, b: T) =>
    cmpStr(String(a.id || a.title || ''), String(b.id || b.title || ''));

  list.sort((a, b) => {
    switch (sort) {
      case 'category': {
        const d = cmpStr(
          (a.category || '').trim() || 'zzz',
          (b.category || '').trim() || 'zzz',
        );
        if (d !== 0) return d;
        const t = cmpStr((a.title || '').trim() || 'zzz', (b.title || '').trim() || 'zzz');
        return t !== 0 ? t : tie(a, b);
      }
      case 'slots': {
        const sa = Array.isArray(a.slots) ? a.slots.length : 0;
        const sb = Array.isArray(b.slots) ? b.slots.length : 0;
        const d = sb - sa;
        if (d !== 0) return d;
        const t = cmpStr((a.title || '').trim() || 'zzz', (b.title || '').trim() || 'zzz');
        return t !== 0 ? t : tie(a, b);
      }
      case 'title':
      default: {
        const d = cmpStr((a.title || '').trim() || 'zzz', (b.title || '').trim() || 'zzz');
        return d !== 0 ? d : tie(a, b);
      }
    }
  });

  return list;
}
