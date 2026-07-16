/** Mind filter for Arena sidebar Saved takes. */

export const SIDEBAR_SAVED_MIND_ALL = 'all' as const;

export type SidebarSavedMindFilter = typeof SIDEBAR_SAVED_MIND_ALL | string;

export type SidebarSavedMindOption = {
  value: SidebarSavedMindFilter;
  label: string;
};

export type SidebarSavedMindItem = {
  agent_id?: string | null;
  persona_name?: string | null;
};

function resolveMindKey(item: SidebarSavedMindItem): string {
  return (item.agent_id || '').trim() || 'unknown';
}

/**
 * Build All + unique mind chips from the current saved list.
 * Labels prefer persona_name, then the optional name resolver, then agent id.
 */
export function collectSavedMindFilterOptions(
  items: SidebarSavedMindItem[],
  resolveName?: (agentId: string) => string | null | undefined,
): SidebarSavedMindOption[] {
  const labels = new Map<string, string>();
  for (const item of items || []) {
    const key = resolveMindKey(item);
    if (labels.has(key)) continue;
    const fromPersona = (item.persona_name || '').trim();
    const fromResolver = (resolveName?.(key) || '').trim();
    labels.set(key, fromPersona || fromResolver || key);
  }

  const minds = [...labels.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }),
    );

  return [{ value: SIDEBAR_SAVED_MIND_ALL, label: 'All' }, ...minds];
}

export function sidebarSavedMindFilterLabel(
  filter: SidebarSavedMindFilter,
  options: SidebarSavedMindOption[],
): string {
  return options.find((o) => o.value === filter)?.label || 'All';
}

/**
 * Filter saved takes by mind (agent_id). Does not mutate the input.
 */
export function filterSavedByMind<T extends SidebarSavedMindItem>(
  items: T[],
  filter: SidebarSavedMindFilter,
): T[] {
  const list = items || [];
  if (!filter || filter === SIDEBAR_SAVED_MIND_ALL) return [...list];
  return list.filter((item) => resolveMindKey(item) === filter);
}
