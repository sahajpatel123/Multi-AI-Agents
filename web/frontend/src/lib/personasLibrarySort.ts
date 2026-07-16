/** Sort helpers for the Personas full library. */

export type PersonasLibrarySort = 'default' | 'name' | 'on_panel' | 'unlocked';

export const PERSONAS_LIBRARY_SORT_OPTIONS: Array<{
  value: PersonasLibrarySort;
  label: string;
}> = [
  { value: 'default', label: 'Catalog order' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'on_panel', label: 'On panel first' },
  { value: 'unlocked', label: 'Unlocked first' },
];

export function personasLibrarySortLabel(sort: PersonasLibrarySort): string {
  return PERSONAS_LIBRARY_SORT_OPTIONS.find((o) => o.value === sort)?.label || 'Catalog order';
}

export type PersonasLibrarySortable = {
  id?: string | null;
  name?: string | null;
  /** True when this mind is currently in the user’s four-slot panel. */
  onPanel?: boolean | null;
  /** True when the user’s tier can use this mind. */
  unlocked?: boolean | null;
};

function cmpStr(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

/**
 * Sort persona library cards. Does not mutate the input.
 * `default` preserves the incoming catalog order.
 */
export function sortPersonasLibrary<T extends PersonasLibrarySortable>(
  personas: T[],
  sort: PersonasLibrarySort,
): T[] {
  if (sort === 'default') return [...(personas || [])];

  const list = [...(personas || [])];
  const tie = (a: T, b: T) =>
    cmpStr(String(a.id || a.name || ''), String(b.id || b.name || ''));
  const byName = (a: T, b: T) => {
    const d = cmpStr((a.name || '').trim() || 'zzz', (b.name || '').trim() || 'zzz');
    return d !== 0 ? d : tie(a, b);
  };

  list.sort((a, b) => {
    switch (sort) {
      case 'on_panel': {
        const pa = a.onPanel ? 0 : 1;
        const pb = b.onPanel ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return byName(a, b);
      }
      case 'unlocked': {
        const ua = a.unlocked ? 0 : 1;
        const ub = b.unlocked ? 0 : 1;
        if (ua !== ub) return ua - ub;
        return byName(a, b);
      }
      case 'name':
      default:
        return byName(a, b);
    }
  });

  return list;
}
