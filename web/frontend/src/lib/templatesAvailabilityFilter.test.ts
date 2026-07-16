import { describe, expect, it } from 'vitest';
import {
  filterTemplatesByAvailability,
  templatesAvailabilityFilterUseful,
  templatesAvailabilityLabel,
} from './templatesAvailabilityFilter';

describe('templatesAvailabilityFilter', () => {
  const items = [
    { id: 'a', disabled: false },
    { id: 'b', disabled: true },
    { id: 'c', disabled: false },
  ];

  it('filters ready and unavailable', () => {
    expect(filterTemplatesByAvailability(items, 'all')).toHaveLength(3);
    expect(filterTemplatesByAvailability(items, 'ready').map((t) => t.id)).toEqual(['a', 'c']);
    expect(filterTemplatesByAvailability(items, 'unavailable').map((t) => t.id)).toEqual(['b']);
  });

  it('detects when chips are useful', () => {
    expect(templatesAvailabilityFilterUseful(items)).toBe(true);
    expect(templatesAvailabilityFilterUseful([{ disabled: false }, { disabled: false }])).toBe(
      false,
    );
  });

  it('labels filters', () => {
    expect(templatesAvailabilityLabel('ready')).toBe('Ready');
    expect(templatesAvailabilityLabel('all')).toBe('All');
  });
});
