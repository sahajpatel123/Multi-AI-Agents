/**
 * Tests for Persona Battle data helpers (preset + topic suggestion).
 *
 * These functions are the deterministic backbone of /persona-battle's
 * curated matchups and the "Suggest a topic" feature. They must:
 *  - resolve presets by id (or null for unknown)
 *  - always return a non-empty topic for any valid persona pairing
 *  - never throw on unknown persona ids
 *  - prefer overlap between the two pools before falling back to union
 *  - keep topic suggestions short enough to fit the topic textarea
 */

import { describe, expect, it } from 'vitest';
import {
  PERSONA_BATTLE_PRESETS,
  findBattlePreset,
  suggestBattleTopic,
} from './personaBattle';
import { PERSONAS } from './personas';

describe('PERSONA_BATTLE_PRESETS catalog', () => {
  it('has at least 5 curated matchups', () => {
    expect(PERSONA_BATTLE_PRESETS.length).toBeGreaterThanOrEqual(5);
  });

  it('every preset references a real persona', () => {
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const preset of PERSONA_BATTLE_PRESETS) {
      expect(known.has(preset.leftId), `left persona ${preset.leftId}`).toBe(true);
      expect(known.has(preset.rightId), `right persona ${preset.rightId}`).toBe(true);
    }
  });

  it('every preset has a distinct pair (no self-battles)', () => {
    for (const preset of PERSONA_BATTLE_PRESETS) {
      expect(preset.leftId).not.toBe(preset.rightId);
    }
  });

  it('every preset id is unique', () => {
    const ids = PERSONA_BATTLE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every preset has a topic and tagline', () => {
    for (const preset of PERSONA_BATTLE_PRESETS) {
      expect(preset.topic.length).toBeGreaterThan(8);
      expect(preset.tagline.length).toBeGreaterThan(2);
    }
  });
});

describe('findBattlePreset', () => {
  it('returns the preset matching the id', () => {
    const preset = findBattlePreset('contrarian-optimist-glass');
    expect(preset).not.toBeNull();
    expect(preset!.leftId).toBe('contrarian');
    expect(preset!.rightId).toBe('optimist');
  });

  it('returns null for unknown ids', () => {
    expect(findBattlePreset('not-a-real-preset')).toBeNull();
    expect(findBattlePreset('')).toBeNull();
    expect(findBattlePreset(null)).toBeNull();
  });
});

describe('suggestBattleTopic', () => {
  it('returns a non-empty string for any valid pairing', () => {
    for (let i = 0; i < PERSONAS.length; i++) {
      for (let j = i + 1; j < PERSONAS.length; j++) {
        const topic = suggestBattleTopic(PERSONAS[i].id, PERSONAS[j].id);
        expect(topic.length).toBeGreaterThan(8);
      }
    }
  });

  it('never throws on unknown persona ids', () => {
    expect(() => suggestBattleTopic('nope', 'also-nope')).not.toThrow();
    expect(suggestBattleTopic('nope', 'also-nope')).toBeTypeOf('string');
  });

  it('returns a string short enough for the textarea (max 500 chars)', () => {
    const topic = suggestBattleTopic('contrarian', 'optimist');
    expect(topic.length).toBeLessThanOrEqual(500);
  });
});
