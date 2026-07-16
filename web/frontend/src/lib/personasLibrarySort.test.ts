import { describe, expect, it } from 'vitest';
import { personasLibrarySortLabel, sortPersonasLibrary } from './personasLibrarySort';

describe('sortPersonasLibrary', () => {
  const items = [
    { id: 'c', name: 'Contrarian', onPanel: false, unlocked: false },
    { id: 'a', name: 'Analyst', onPanel: true, unlocked: true },
    { id: 'b', name: 'Builder', onPanel: false, unlocked: true },
  ];

  it('preserves catalog order for default', () => {
    expect(sortPersonasLibrary(items, 'default').map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });

  it('sorts by name A–Z', () => {
    expect(sortPersonasLibrary(items, 'name').map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('puts on-panel minds first, then name', () => {
    expect(sortPersonasLibrary(items, 'on_panel').map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('puts unlocked minds first, then name', () => {
    expect(sortPersonasLibrary(items, 'unlocked').map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('labels sorts', () => {
    expect(personasLibrarySortLabel('on_panel')).toBe('On panel first');
    expect(personasLibrarySortLabel('default')).toBe('Catalog order');
  });
});
