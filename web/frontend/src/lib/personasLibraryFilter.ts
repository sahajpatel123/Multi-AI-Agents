/** Availability filter for the Personas full library. */

export type PersonasLibraryAvailability =
  | 'all'
  | 'on_panel'
  | 'unlocked'
  | 'locked';

export const PERSONAS_LIBRARY_AVAILABILITY_OPTIONS: Array<{
  value: PersonasLibraryAvailability;
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'on_panel', label: 'On panel' },
  { value: 'unlocked', label: 'Unlocked' },
  { value: 'locked', label: 'Locked' },
];

export function personasLibraryAvailabilityLabel(
  filter: PersonasLibraryAvailability,
): string {
  return (
    PERSONAS_LIBRARY_AVAILABILITY_OPTIONS.find((o) => o.value === filter)?.label || 'All'
  );
}

export type PersonasLibraryFilterable = {
  onPanel?: boolean | null;
  unlocked?: boolean | null;
};

/**
 * Filter persona library cards by panel membership / tier unlock.
 * Does not mutate the input array.
 */
export function filterPersonasLibraryByAvailability<T extends PersonasLibraryFilterable>(
  personas: T[],
  filter: PersonasLibraryAvailability,
): T[] {
  const list = personas || [];
  switch (filter) {
    case 'on_panel':
      return list.filter((p) => !!p.onPanel);
    case 'unlocked':
      return list.filter((p) => !!p.unlocked);
    case 'locked':
      return list.filter((p) => !p.unlocked);
    case 'all':
    default:
      return [...list];
  }
}
