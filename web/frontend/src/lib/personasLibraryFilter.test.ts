import { describe, expect, it } from 'vitest';
import {
  filterPersonasLibraryByAvailability,
  personasLibraryAvailabilityLabel,
} from './personasLibraryFilter';

const sample = [
  { id: 'a', onPanel: true, unlocked: true },
  { id: 'b', onPanel: false, unlocked: true },
  { id: 'c', onPanel: false, unlocked: false },
  { id: 'd', onPanel: true, unlocked: true },
];

describe('filterPersonasLibraryByAvailability', () => {
  it('returns all for all filter', () => {
    expect(filterPersonasLibraryByAvailability(sample, 'all').map((p) => p.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('keeps minds on the panel', () => {
    expect(filterPersonasLibraryByAvailability(sample, 'on_panel').map((p) => p.id)).toEqual([
      'a',
      'd',
    ]);
  });

  it('keeps unlocked minds', () => {
    expect(filterPersonasLibraryByAvailability(sample, 'unlocked').map((p) => p.id)).toEqual([
      'a',
      'b',
      'd',
    ]);
  });

  it('keeps locked minds', () => {
    expect(filterPersonasLibraryByAvailability(sample, 'locked').map((p) => p.id)).toEqual(['c']);
  });

  it('does not mutate input', () => {
    const copy = [...sample];
    filterPersonasLibraryByAvailability(sample, 'locked');
    expect(sample).toEqual(copy);
  });
});

describe('personasLibraryAvailabilityLabel', () => {
  it('returns labels', () => {
    expect(personasLibraryAvailabilityLabel('on_panel')).toBe('On panel');
    expect(personasLibraryAvailabilityLabel('locked')).toBe('Locked');
  });
});
