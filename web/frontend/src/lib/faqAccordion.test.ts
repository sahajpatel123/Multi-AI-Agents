import { describe, expect, it } from 'vitest';
import { isFaqOpen, toggleFaqOpen } from './faqAccordion';

describe('faqAccordion', () => {
  it('opens a closed item and closes the open one', () => {
    expect(toggleFaqOpen(null, 0)).toBe(0);
    expect(toggleFaqOpen(0, 0)).toBe(null);
    expect(toggleFaqOpen(0, 2)).toBe(2);
  });

  it('reports open state by index', () => {
    expect(isFaqOpen(1, 1)).toBe(true);
    expect(isFaqOpen(1, 0)).toBe(false);
    expect(isFaqOpen(null, 0)).toBe(false);
  });
});
