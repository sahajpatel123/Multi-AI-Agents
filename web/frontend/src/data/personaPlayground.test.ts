/**
 * Persona Playground catalog integrity tests.
 *
 * The playground at /persona-playground is the discoverability surface
 * for every persona tool. If a route is registered in main.tsx but the
 * playground catalog never learns about it, the tool becomes an
 * orphan (reachable only by direct URL). If the catalog lists a path
 * the router does not know, the card links to a 404.
 *
 * Invariants:
 *  - every /persona-* and /personas route in main.tsx is in the catalog
 *    (the catalog is the discoverability index — it must be complete)
 *  - every catalog path is registered as a route in main.tsx
 *    (no broken card links)
 *  - catalog paths are unique
 *  - required fields (path, name, tagline, blurb, format) are non-empty
 *  - every category used has at least one tool
 *  - the playground page itself (/persona-playground) is not listed
 *    inside the catalog (the hub does not list itself)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PERSONA_PLAYGROUND_ENTRIES,
  personaPlaygroundCategories,
  type PersonaPlaygroundEntry,
} from './personaPlayground';

const here = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath: string) =>
  readFileSync(join(here, relativePath), 'utf8');

const ROUTES_PATH = '../main.tsx';

const ROUTE_PATTERN = /<Route\s+path="([^"]+)"\s+element=\{<([A-Za-z0-9_]+)Page\s+\/>\}/g;

const TOOL_PATH_PATTERN = /^\/persona-(?!playground$)[a-z-]+$/;

function extractPersonaRoutes(): string[] {
  const src = readSource(ROUTES_PATH);
  const paths: string[] = [];
  for (const match of src.matchAll(ROUTE_PATTERN)) {
    const path = match[1];
    if (TOOL_PATH_PATTERN.test(path)) {
      paths.push(path);
    }
  }
  return paths.sort();
}

describe('Persona Playground catalog', () => {
  it('has unique paths', () => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const entry of PERSONA_PLAYGROUND_ENTRIES) {
      if (seen.has(entry.path)) duplicates.add(entry.path);
      seen.add(entry.path);
    }
    expect(Array.from(duplicates)).toEqual([]);
  });

  it('every entry has non-empty required fields', () => {
    for (const entry of PERSONA_PLAYGROUND_ENTRIES) {
      expect(entry.path, `path on ${entry.name ?? 'unknown'}`).toMatch(/^\/persona/);
      expect(entry.name, `name for ${entry.path}`).not.toEqual('');
      expect(entry.tagline, `tagline for ${entry.path}`).not.toEqual('');
      expect(entry.blurb, `blurb for ${entry.path}`).not.toEqual('');
      expect(entry.format, `format for ${entry.path}`).not.toEqual('');
    }
  });

  it('every category has at least one tool', () => {
    const seen = new Set(PERSONA_PLAYGROUND_ENTRIES.map((e) => e.category));
    const declared = new Set(personaPlaygroundCategories());
    expect(seen).toEqual(declared);
  });

  it('does not list the hub itself', () => {
    const self = PERSONA_PLAYGROUND_ENTRIES.find((e) => e.path === '/persona-playground');
    expect(self).toBeUndefined();
  });

  it('every catalog path is registered as a route in main.tsx', () => {
    const registered = new Set(extractPersonaRoutes());
    const orphans: string[] = [];
    for (const entry of PERSONA_PLAYGROUND_ENTRIES) {
      if (!registered.has(entry.path)) orphans.push(entry.path);
    }
    expect(orphans, 'catalog paths that have no <Route> entry').toEqual([]);
  });

  it('every persona route in main.tsx is in the catalog (no orphans)', () => {
    const registered = extractPersonaRoutes();
    const catalogPaths = new Set(PERSONA_PLAYGROUND_ENTRIES.map((e) => e.path));
    const missing: string[] = [];
    for (const path of registered) {
      if (!catalogPaths.has(path)) missing.push(path);
    }
    expect(missing, 'routes that are not in the playground catalog').toEqual([]);
  });

  it('every entry belongs to a recognized category', () => {
    const allowed = new Set<string>(personaPlaygroundCategories());
    for (const entry of PERSONA_PLAYGROUND_ENTRIES) {
      expect(allowed.has(entry.category), `bad category on ${entry.path}`).toBe(true);
    }
  });
});

describe('Persona Playground entry shape (typecheck helper)', () => {
  it('matches the documented surface', () => {
    const sample: PersonaPlaygroundEntry = {
      path: '/persona-match',
      name: 'Persona Match',
      tagline: 'Which Arena mind are you?',
      blurb: 'Five questions, sixteen minds, one match.',
      category: 'discover',
      format: '5-question quiz',
    };
    expect(sample.path).toMatch(/^\/persona/);
  });
});
