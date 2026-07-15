/** Pure helpers for Agent expertise level / domain chrome. */

export const EXPERTISE_LEVELS = [
  { id: 'none', label: 'None' },
  { id: 'curious', label: 'Curious' },
  { id: 'practitioner', label: 'Practitioner' },
  { id: 'expert', label: 'Expert' },
  { id: 'researcher', label: 'Researcher' },
] as const;

export type ExpertiseLevelId = (typeof EXPERTISE_LEVELS)[number]['id'];

const LEVEL_IDS = new Set<string>(EXPERTISE_LEVELS.map((l) => l.id));

/** Normalize free-form API/user values to a known level (default curious). */
export function normalizeExpertiseLevel(level: string | null | undefined): ExpertiseLevelId {
  const n = (level || '').trim().toLowerCase();
  if (LEVEL_IDS.has(n)) return n as ExpertiseLevelId;
  return 'curious';
}

export function shouldShowExpertiseDomain(level: string | null | undefined): boolean {
  return normalizeExpertiseLevel(level) !== 'none';
}

/** Domain text to send with a level change (cleared when level is none). */
export function domainForExpertiseLevel(
  level: string | null | undefined,
  currentDomain: string,
): string {
  if (normalizeExpertiseLevel(level) === 'none') return '';
  return (currentDomain || '').trim();
}

export function expertiseDomainPlaceholder(level: string | null | undefined): string {
  const n = normalizeExpertiseLevel(level);
  if (n === 'none') return '';
  if (n === 'researcher') return 'e.g. ML research, clinical trials…';
  if (n === 'expert') return 'e.g. cardiology, tax law…';
  if (n === 'practitioner') return 'e.g. product design, nursing…';
  return 'e.g. product, investing, climate…';
}
