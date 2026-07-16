/** Availability filter for Agent task templates (Condura-gated vs ready). */

export type TemplatesAvailability = 'all' | 'ready' | 'unavailable';

export const TEMPLATES_AVAILABILITY_OPTIONS: Array<{
  value: TemplatesAvailability;
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'ready', label: 'Ready' },
  { value: 'unavailable', label: 'Unavailable' },
];

export function templatesAvailabilityLabel(filter: TemplatesAvailability): string {
  return TEMPLATES_AVAILABILITY_OPTIONS.find((o) => o.value === filter)?.label || 'All';
}

export type TemplatesAvailabilityItem = {
  disabled?: boolean | null;
};

/**
 * Filter templates by whether they are currently selectable.
 * Does not mutate the input array.
 */
export function filterTemplatesByAvailability<T extends TemplatesAvailabilityItem>(
  templates: T[],
  filter: TemplatesAvailability,
): T[] {
  const list = templates || [];
  if (filter === 'all') return [...list];
  if (filter === 'ready') return list.filter((t) => !t.disabled);
  return list.filter((t) => !!t.disabled);
}

/** True when the catalog has both ready and unavailable templates. */
export function templatesAvailabilityFilterUseful(
  templates: TemplatesAvailabilityItem[],
): boolean {
  const list = templates || [];
  if (list.length < 2) return false;
  let hasReady = false;
  let hasUnavailable = false;
  for (const t of list) {
    if (t.disabled) hasUnavailable = true;
    else hasReady = true;
    if (hasReady && hasUnavailable) return true;
  }
  return false;
}
