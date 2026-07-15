import { describe, expect, it } from 'vitest';
import {
  domainForExpertiseLevel,
  expertiseDomainPlaceholder,
  normalizeExpertiseLevel,
  shouldShowExpertiseDomain,
} from './expertiseSelector';

describe('expertiseSelector', () => {
  it('normalizes known levels and defaults unknown to curious', () => {
    expect(normalizeExpertiseLevel('Expert')).toBe('expert');
    expect(normalizeExpertiseLevel('none')).toBe('none');
    expect(normalizeExpertiseLevel('')).toBe('curious');
    expect(normalizeExpertiseLevel('wizard')).toBe('curious');
  });

  it('hides domain when level is none', () => {
    expect(shouldShowExpertiseDomain('none')).toBe(false);
    expect(shouldShowExpertiseDomain('curious')).toBe(true);
    expect(domainForExpertiseLevel('none', 'cardiology')).toBe('');
    expect(domainForExpertiseLevel('expert', '  ML  ')).toBe('ML');
  });

  it('returns level-appropriate placeholders', () => {
    expect(expertiseDomainPlaceholder('none')).toBe('');
    expect(expertiseDomainPlaceholder('researcher')).toMatch(/research/i);
    expect(expertiseDomainPlaceholder('curious')).toMatch(/e\.g\./i);
  });
});
