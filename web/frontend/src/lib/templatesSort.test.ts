import { describe, expect, it } from 'vitest';
import { sortTemplates, templatesSortLabel } from './templatesSort';

describe('sortTemplates', () => {
  const items = [
    { id: 'b', title: 'Beta scan', category: 'Finance', slots: ['a'] },
    { id: 'a', title: 'Alpha brief', category: 'Business', slots: ['a', 'b', 'c'] },
    { id: 'c', title: 'Gamma note', category: 'Business', slots: ['a', 'b'] },
  ];

  it('preserves catalog order for default', () => {
    expect(sortTemplates(items, 'default').map((t) => t.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by title A–Z', () => {
    expect(sortTemplates(items, 'title').map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by category then title', () => {
    expect(sortTemplates(items, 'category').map((t) => t.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorts by most slots first', () => {
    expect(sortTemplates(items, 'slots').map((t) => t.id)).toEqual(['a', 'c', 'b']);
  });

  it('labels sorts', () => {
    expect(templatesSortLabel('title')).toBe('Title A–Z');
    expect(templatesSortLabel('default')).toBe('Catalog order');
  });
});
