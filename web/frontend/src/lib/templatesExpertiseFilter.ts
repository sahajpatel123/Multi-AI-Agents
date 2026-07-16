/** Expertise-level filter for Agent task templates. */

export const TEMPLATES_EXPERTISE_ALL = 'all' as const;

export type TemplatesExpertiseFilter = typeof TEMPLATES_EXPERTISE_ALL | string;

export type TemplatesExpertiseOption = {
  value: TemplatesExpertiseFilter;
  label: string;
};

export type TemplatesExpertiseItem = {
  default_expertise?: string | null;
  expertise?: string | null;
};

const EXPERTISE_LABELS: Record<string, string> = {
  curious: 'Curious',
  practitioner: 'Practitioner',
  researcher: 'Researcher',
  expert: 'Expert',
};

function resolveExpertiseKey(item: TemplatesExpertiseItem): string {
  const raw = (item.default_expertise || item.expertise || '').trim().toLowerCase();
  return raw || 'unknown';
}

function labelForExpertise(key: string): string {
  if (EXPERTISE_LABELS[key]) return EXPERTISE_LABELS[key];
  if (!key || key === 'unknown') return 'Unspecified';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Build All + unique expertise chips from the catalog.
 */
export function collectTemplatesExpertiseOptions(
  templates: TemplatesExpertiseItem[],
): TemplatesExpertiseOption[] {
  const keys = new Set<string>();
  for (const t of templates || []) {
    keys.add(resolveExpertiseKey(t));
  }
  const minds = [...keys]
    .map((value) => ({ value, label: labelForExpertise(value) }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }),
    );
  return [{ value: TEMPLATES_EXPERTISE_ALL, label: 'All levels' }, ...minds];
}

export function templatesExpertiseLabel(
  filter: TemplatesExpertiseFilter,
  options: TemplatesExpertiseOption[],
): string {
  return options.find((o) => o.value === filter)?.label || 'All levels';
}

/**
 * Filter templates by default expertise. Does not mutate the input.
 */
export function filterTemplatesByExpertise<T extends TemplatesExpertiseItem>(
  templates: T[],
  filter: TemplatesExpertiseFilter,
): T[] {
  const list = templates || [];
  if (!filter || filter === TEMPLATES_EXPERTISE_ALL) return [...list];
  return list.filter((t) => resolveExpertiseKey(t) === filter);
}

/** True when more than one expertise level is present. */
export function templatesExpertiseFilterUseful(
  templates: TemplatesExpertiseItem[],
): boolean {
  const keys = new Set<string>();
  for (const t of templates || []) {
    keys.add(resolveExpertiseKey(t));
    if (keys.size > 1) return true;
  }
  return false;
}
