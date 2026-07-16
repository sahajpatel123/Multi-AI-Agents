import { describe, expect, it } from 'vitest';
import {
  TEMPLATES_EXPERTISE_ALL,
  collectTemplatesExpertiseOptions,
  filterTemplatesByExpertise,
  templatesExpertiseFilterUseful,
  templatesExpertiseLabel,
} from './templatesExpertiseFilter';

describe('templatesExpertiseFilter', () => {
  const items = [
    { id: 'a', default_expertise: 'expert' },
    { id: 'b', default_expertise: 'curious' },
    { id: 'c', default_expertise: 'expert' },
  ];

  it('collects All levels plus unique expertise sorted by label', () => {
    const opts = collectTemplatesExpertiseOptions(items);
    expect(opts[0]).toEqual({ value: TEMPLATES_EXPERTISE_ALL, label: 'All levels' });
    expect(opts.slice(1).map((o) => o.value)).toEqual(['curious', 'expert']);
    expect(opts[1].label).toBe('Curious');
  });

  it('filters by expertise', () => {
    expect(filterTemplatesByExpertise(items, TEMPLATES_EXPERTISE_ALL)).toHaveLength(3);
    expect(filterTemplatesByExpertise(items, 'expert').map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('detects usefulness and labels', () => {
    expect(templatesExpertiseFilterUseful(items)).toBe(true);
    expect(templatesExpertiseFilterUseful([{ default_expertise: 'expert' }])).toBe(false);
    const opts = collectTemplatesExpertiseOptions(items);
    expect(templatesExpertiseLabel('curious', opts)).toBe('Curious');
  });
});
