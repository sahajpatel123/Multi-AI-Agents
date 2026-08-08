/**
 * Source-level regression test: every top-traffic tool page must mount
 * <RelatedTools path="…" /> with the path that matches the page's URL.
 *
 * Catches two regressions cheaply:
 *  - the mount is removed entirely (component silently disappears)
 *  - the path prop drifts (e.g. /persona-match → /persona-matches)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath: string) =>
  readFileSync(join(here, relativePath), 'utf8');

const PAGES: ReadonlyArray<{ file: string; path: string }> = [
  { file: '../pages/PersonaMatchPage.tsx', path: '/persona-match' },
  { file: '../pages/PersonaBattlePage.tsx', path: '/persona-battle' },
  { file: '../pages/PersonaCouncilPage.tsx', path: '/persona-council' },
  { file: '../pages/PersonaMosaicPage.tsx', path: '/persona-mosaic' },
  { file: '../pages/PersonaDilemmaPage.tsx', path: '/persona-dilemma' },
];

describe('RelatedTools mount on top-traffic tool pages', () => {
  for (const { file, path } of PAGES) {
    it(`${file} mounts <RelatedTools path="${path}" />`, () => {
      const src = readSource(file);
      expect(src, `${file} imports RelatedTools`).toContain(
        "import { RelatedTools } from '../components/RelatedTools';",
      );
      expect(src, `${file} mounts RelatedTools with path=${path}`).toMatch(
        new RegExp(`<RelatedTools[^>]*path="${path}"[^>]*/>`),
      );
    });
  }

  it('every mounted path is in the playground catalog', async () => {
    const { PERSONA_PLAYGROUND_ENTRIES } = await import('../data/personaPlayground');
    const catalogPaths = new Set(PERSONA_PLAYGROUND_ENTRIES.map((e) => e.path));
    for (const { path } of PAGES) {
      expect(catalogPaths.has(path), `${path} should be in the catalog`).toBe(true);
    }
  });

  it('RelatedTools component is also mounted on the hub', () => {
    const src = readSource('../pages/PersonaPlaygroundPage.tsx');
    expect(src).toMatch(/<RelatedTools[^>]*path="\/persona-playground"[^>]*\/>/);
  });
});
