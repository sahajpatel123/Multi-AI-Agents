import { describe, expect, it } from 'vitest';
import {
  SIDEBAR_SAVED_PIN_ALL,
  SIDEBAR_SAVED_PIN_ONLY,
  filterSavedByPin,
  savedPinFilterLabel,
} from './sidebarSavedPinFilter';

describe('filterSavedByPin', () => {
  const sample = [
    { id: 1, pinned: false },
    { id: 2, pinned: true },
    { id: 3, pinned: undefined },
    { id: 4, pinned: true },
  ];

  it('keeps every item for the all filter', () => {
    expect(filterSavedByPin(sample, SIDEBAR_SAVED_PIN_ALL).map((s) => s.id)).toEqual([1, 2, 3, 4]);
  });

  it('keeps only pinned items for the pinned filter', () => {
    expect(filterSavedByPin(sample, SIDEBAR_SAVED_PIN_ONLY).map((s) => s.id)).toEqual([2, 4]);
  });

  it('returns a new array and tolerates missing input', () => {
    expect(filterSavedByPin(undefined as never, SIDEBAR_SAVED_PIN_ONLY)).toEqual([]);
    const source = [...sample];
    filterSavedByPin(source, SIDEBAR_SAVED_PIN_ONLY);
    expect(source).toHaveLength(sample.length);
  });

  it('labels filters', () => {
    expect(savedPinFilterLabel(SIDEBAR_SAVED_PIN_ONLY)).toBe('pinned');
    expect(savedPinFilterLabel(SIDEBAR_SAVED_PIN_ALL)).toBe('all');
  });
});
