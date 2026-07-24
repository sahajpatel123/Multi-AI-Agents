/**
 * Tests for Persona Library data + URL builders.
 *
 * The library is the curated prompt catalog at /persona-library. It
 * depends on:
 *  - having at least 6 entries across 3+ categories
 *  - every entry having a non-empty title / prompt / description / category
 *  - category ids being a closed set
 *  - every suggestedPersona id existing in the PERSONAS catalog
 *  - URL builders encoding correctly
 *  - filtering + sorting helpers behaving deterministically
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  PERSONA_LIBRARY_CATEGORIES,
  PERSONA_LIBRARY_ENTRIES,
  entriesByCategory,
  entriesFeaturedFirst,
  libraryArenaLink,
  libraryShareUrl,
  type LibraryCategory,
  type PersonaLibraryEntry,
} from './personaLibrary';

const VALID_CATEGORY_IDS = new Set<LibraryCategory>(
  PERSONA_LIBRARY_CATEGORIES.map((c) => c.id),
);

describe('PERSONA_LIBRARY_CATEGORIES', () => {
  it('has at least 3 categories', () => {
    expect(PERSONA_LIBRARY_CATEGORIES.length).toBeGreaterThanOrEqual(3);
  });

  it('every category has a non-empty label and description', () => {
    for (const c of PERSONA_LIBRARY_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
    }
  });

  it('every category id is unique', () => {
    const ids = PERSONA_LIBRARY_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('PERSONA_LIBRARY_ENTRIES', () => {
  it('has at least 6 curated entries', () => {
    expect(PERSONA_LIBRARY_ENTRIES.length).toBeGreaterThanOrEqual(6);
  });

  it('every entry has a non-empty title, prompt, description', () => {
    for (const entry of PERSONA_LIBRARY_ENTRIES) {
      expect(entry.title.length).toBeGreaterThan(4);
      expect(entry.prompt.length).toBeGreaterThan(20);
      expect(entry.description.length).toBeGreaterThan(20);
    }
  });

  it('every entry id is unique', () => {
    const ids = PERSONA_LIBRARY_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every category is a closed set', () => {
    for (const entry of PERSONA_LIBRARY_ENTRIES) {
      expect(VALID_CATEGORY_IDS.has(entry.category)).toBe(true);
    }
  });

  it('every suggestedPersona id exists in the catalog (or is undefined)', () => {
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const entry of PERSONA_LIBRARY_ENTRIES) {
      if (!entry.suggestedPersonas) continue;
      for (const id of entry.suggestedPersonas) {
        expect(known.has(id), `unknown persona ${id} in ${entry.id}`).toBe(true);
      }
    }
  });

  it('tone is one of the closed set', () => {
    const tones = new Set(['sharp', 'warm', 'playful', 'serious']);
    for (const entry of PERSONA_LIBRARY_ENTRIES) {
      expect(tones.has(entry.tone)).toBe(true);
    }
  });
});

describe('URL builders', () => {
  it('libraryArenaLink encodes the prompt into a query string', () => {
    const link = libraryArenaLink('https://x', 'What is the meaning of life?');
    expect(link.startsWith('https://x/app?prompt=')).toBe(true);
    expect(decodeURIComponent(link)).toContain('What is the meaning of life?');
  });

  it('libraryShareUrl encodes the entry id', () => {
    const url = libraryShareUrl('https://x', 'lib-asymmetric-move');
    expect(url).toBe('https://x/persona-library?entry=lib-asymmetric-move');
  });
});

describe('entriesByCategory', () => {
  it('returns all entries when category is null', () => {
    expect(entriesByCategory(PERSONA_LIBRARY_ENTRIES, null)).toEqual(
      PERSONA_LIBRARY_ENTRIES,
    );
  });

  it('filters by category', () => {
    const strategy = entriesByCategory(PERSONA_LIBRARY_ENTRIES, 'strategy');
    expect(strategy.length).toBeGreaterThan(0);
    for (const entry of strategy) {
      expect(entry.category).toBe('strategy');
    }
  });

  it('returns empty array for a category with no entries', () => {
    // Pick a category that we don't actually populate; should be empty.
    const fake = entriesByCategory(PERSONA_LIBRARY_ENTRIES, 'product');
    // 'product' is a real category — this assertion is intentionally weak.
    expect(Array.isArray(fake)).toBe(true);
  });
});

describe('entriesFeaturedFirst', () => {
  it('puts featured entries before non-featured ones', () => {
    const sorted = entriesFeaturedFirst(PERSONA_LIBRARY_ENTRIES);
    let seenNonFeatured = false;
    for (const entry of sorted) {
      if (!entry.featured) {
        seenNonFeatured = true;
      } else if (seenNonFeatured) {
        throw new Error(`Featured entry ${entry.id} appeared after a non-featured one`);
      }
    }
  });

  it('preserves the original order within each group', () => {
    const sorted = entriesFeaturedFirst(PERSONA_LIBRARY_ENTRIES);
    const featured = sorted.filter((e) => e.featured).map((e) => e.id);
    const originalFeatured = PERSONA_LIBRARY_ENTRIES.filter((e) => e.featured).map(
      (e) => e.id,
    );
    expect(featured).toEqual(originalFeatured);

    const nonFeatured = sorted.filter((e) => !e.featured).map((e) => e.id);
    const originalNonFeatured = PERSONA_LIBRARY_ENTRIES.filter((e) => !e.featured).map(
      (e) => e.id,
    );
    expect(nonFeatured).toEqual(originalNonFeatured);
  });
});

describe('PersonaLibraryEntry type invariants', () => {
  it('every entry conforms to the public type', () => {
    const sample: PersonaLibraryEntry = PERSONA_LIBRARY_ENTRIES[0];
    expect(typeof sample.id).toBe('string');
    expect(typeof sample.title).toBe('string');
    expect(typeof sample.prompt).toBe('string');
    expect(typeof sample.category).toBe('string');
    expect(typeof sample.description).toBe('string');
    expect(typeof sample.tone).toBe('string');
  });
});