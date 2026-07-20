/**
 * Tests for the UI persona catalog fixture.
 *
 * `data/personas.ts` is the canonical client-side list consumed by the
 * persona picker, the panel studio, the Arena header chips, and the
 * sidebar library. It must mirror the backend persona library
 * (`seed_personas.py` + `PERSONA_PROMPTS` in `core/agents.py`) so the
 * UI cannot show a persona the backend cannot dispatch.
 *
 * Drift detection: if a future edit adds a new persona to one side and
 * forgets the other, the persona picker renders a ghost or the picker
 * is missing a mind. These tests pin the cross-side invariants.
 *
 * Cross-validation strategy: Vitest is a JS/TS bundler, so we cannot
 * import the Python backend modules directly. Instead we read the
 * Python source files as text and parse out the persona id list with
 * a regex. This catches drift on the id set without needing a Python
 * runtime in the JS test process.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';

const REPO_ROOT = resolve(__dirname, '../../../../');

function readBackendIds(filePath: string, keyRegex: RegExp): Set<string> {
  // Read the Python source and extract persona id string literals from
  // the dict literal. Tolerates trailing comments / whitespace by
  // matching the entire Python file as one blob.
  const source = readFileSync(filePath, 'utf-8');
  const ids = new Set<string>();
  for (const match of source.matchAll(keyRegex)) {
    ids.add(match[1]);
  }
  return ids;
}

describe('PERSONAS catalog', () => {
  it('contains exactly 16 personas (matches backend seed + tier matrix)', () => {
    expect(PERSONAS).toHaveLength(16);
  });

  it('uses unique ids (the picker would break on duplicates)', () => {
    const ids = PERSONAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('id set matches the 16 ids in backend PERSONA_PROMPTS', () => {
    // PERSONA_PROMPTS is a dict literal in arena/core/agents.py, keyed by
    // id: 'name'. We match every `'foo':` key inside that literal block.
    const agentsPath = resolve(REPO_ROOT, 'backend/arena/core/agents.py');
    const source = readFileSync(agentsPath, 'utf-8');
    // Slice out the PERSONA_PROMPTS dict body to avoid false matches in
    // other dict literals (e.g. PERSONA_METADATA at the bottom).
    const dictMatch = source.match(/PERSONA_PROMPTS[^=]*=\s*\{([\s\S]*?)\n\}/);
    expect(dictMatch, 'PERSONA_PROMPTS literal not found').not.toBeNull();
    const promptIds = new Set<string>();
    for (const m of dictMatch![1].matchAll(/^\s*['"]([a-z]+)['"]\s*:/gm)) {
      promptIds.add(m[1]);
    }
    expect(promptIds.size).toBeGreaterThanOrEqual(16);
    const fixtureIds = new Set(PERSONAS.map((p) => p.id));
    const missing = [...promptIds].filter((id) => !fixtureIds.has(id));
    const extra = [...fixtureIds].filter((id) => !promptIds.has(id));
    expect(missing, 'Backend prompt ids missing from UI catalog').toEqual([]);
    expect(extra, 'UI catalog ids missing from backend prompts').toEqual([]);
  });

  it('id set matches the 16 ids in backend seed_personas.py', () => {
    const seedPath = resolve(REPO_ROOT, 'backend/arena/core/seed_personas.py');
    const source = readFileSync(seedPath, 'utf-8');
    // The seed file stores each persona as a dict with `persona_id` +
    // `name`. Match `persona_id: "..."` to extract the id set.
    const seedIds = new Set<string>();
    for (const m of source.matchAll(/["']persona_id["']\s*:\s*["']([a-z]+)["']/g)) {
      seedIds.add(m[1]);
    }
    const fixtureIds = new Set(PERSONAS.map((p) => p.id));
    expect(seedIds.size).toBe(16);
    const missing = [...seedIds].filter((id) => !fixtureIds.has(id));
    const extra = [...fixtureIds].filter((id) => !seedIds.has(id));
    expect(missing, 'Backend seed ids missing from UI catalog').toEqual([]);
    expect(extra, 'UI catalog ids missing from backend seed').toEqual([]);
  });

  it('every persona declares the full required field set', () => {
    const required: Array<keyof (typeof PERSONAS)[number]> = [
      'id',
      'name',
      'color',
      'bgTint',
      'quote',
      'temperature',
      'description',
      'locked',
      'slot',
    ];
    for (const p of PERSONAS) {
      for (const field of required) {
        expect(p[field], `${p.id ?? '<no id>'} missing ${field}`).toBeDefined();
      }
    }
  });

  it('color and bgTint are 6-digit hex strings (inline CSS custom props)', () => {
    const hex = /^#[0-9A-Fa-f]{6}$/;
    for (const p of PERSONAS) {
      expect(p.color, `${p.id} color`).toMatch(hex);
      expect(p.bgTint, `${p.id} bgTint`).toMatch(hex);
    }
  });

  it('quote and description are non-empty trimmed strings', () => {
    for (const p of PERSONAS) {
      expect(p.quote.length, `${p.id} quote`).toBeGreaterThan(0);
      expect(p.description.length, `${p.id} description`).toBeGreaterThan(0);
      expect(p.quote.trim()).toBe(p.quote);
      expect(p.description.trim()).toBe(p.description);
    }
  });

  it('temperature is in [0, 1] (LLM sampling bounds)', () => {
    for (const p of PERSONAS) {
      expect(p.temperature, `${p.id} temperature`).toBeGreaterThanOrEqual(0);
      expect(p.temperature, `${p.id} temperature`).toBeLessThanOrEqual(1);
    }
  });

  it('slot is either 1..4 or null (no slot 0, no other values)', () => {
    const allowed: Array<1 | 2 | 3 | 4 | null> = [1, 2, 3, 4, null];
    for (const p of PERSONAS) {
      expect(allowed, `${p.id} slot value ${p.slot}`).toContain(p.slot);
    }
  });

  it('assigns slots 1..4 with no duplicates (the default panel)', () => {
    const slots = PERSONAS.map((p) => p.slot).filter(
      (s): s is 1 | 2 | 3 | 4 => s !== null,
    );
    expect(slots.sort()).toEqual([1, 2, 3, 4]);
  });

  it('free-tier personas (FREE_PERSONAS) are all present in the catalog', () => {
    // FREE_PERSONAS in tier_config.py: {analyst, philosopher, pragmatist,
    // contrarian, futurist, empath}. Without these, a FREE user on first
    // load would see an empty persona picker.
    const tierPath = resolve(REPO_ROOT, 'backend/arena/core/tier_config.py');
    const source = readFileSync(tierPath, 'utf-8');
    const freeMatch = source.match(/FREE_PERSONAS\s*=\s*\{([^}]*)\}/);
    expect(freeMatch, 'FREE_PERSONAS literal not found').not.toBeNull();
    const freeIds = new Set<string>();
    for (const m of freeMatch![1].matchAll(/['"]([a-z]+)['"]/g)) {
      freeIds.add(m[1]);
    }
    expect(freeIds.size).toBe(6);
    const fixtureIds = new Set(PERSONAS.map((p) => p.id));
    for (const required of freeIds) {
      expect(fixtureIds.has(required), `Free-tier persona ${required} missing`).toBe(true);
    }
  });
});

