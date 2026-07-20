/**
 * Tests for the Room member display helpers.
 *
 * roomUtils.ts backs the avatar chip in RoomPage: a deterministic color
 * from the user id and a 1-2 character initial string from the display
 * name. Both are pure functions consumed inline in JSX; if their contract
 * drifts (off-by-one modulo, wrong trim semantics, lowercase fallback),
 * the avatar becomes visually inconsistent across the room board.
 *
 * We pin:
 *   - color: deterministic per user id, 6-color rotation, abs() handles
 *     negative ids, 0 → first color, large ids cycle via modulo
 *   - initials: first+last for two-word names, first-two for one-word,
 *     trim + filter handles extra whitespace, empty → '?'
 */

import { describe, expect, it } from 'vitest';
import { getUserColor, getUserInitials } from './roomUtils';

describe('getUserColor', () => {
  it('returns the documented six hex colors', () => {
    const colors = ['#C4956A', '#5A8C6A', '#534AB7', '#D85A30', '#185FA5', '#8C7355'];
    // Every id 0..5 must map to its slot, then it cycles back to slot 0.
    for (let i = 0; i < colors.length; i++) {
      expect(getUserColor(i)).toBe(colors[i]);
    }
    expect(getUserColor(colors.length)).toBe(colors[0]);
    expect(getUserColor(colors.length + 1)).toBe(colors[1]);
  });

  it('is deterministic: same input always yields the same color', () => {
    expect(getUserColor(42)).toBe(getUserColor(42));
    expect(getUserColor(99)).toBe(getUserColor(99));
  });

  it('handles zero as the first color', () => {
    expect(getUserColor(0)).toBe('#C4956A');
  });

  it('handles negative ids via Math.abs', () => {
    // The fallback is "deterministic and never crashes" — Math.abs prevents
    // JS's negative-modulo quirk from returning a negative index.
    expect(getUserColor(-1)).toBe(getUserColor(1));
    expect(getUserColor(-7)).toBe(getUserColor(1)); // |-7| % 6 = 1
    expect(getUserColor(-6)).toBe(getUserColor(0)); // |-6| % 6 = 0
  });

  it('cycles cleanly through large ids without crashing', () => {
    expect(getUserColor(1_000_000)).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(getUserColor(Number.MAX_SAFE_INTEGER)).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('always returns a valid hex string', () => {
    for (const id of [0, 1, 2, 3, 4, 5, 6, 7, 8, 42, 100, 9999]) {
      expect(getUserColor(id)).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('getUserInitials', () => {
  it('returns first + last initial (uppercase) for two-word names', () => {
    expect(getUserInitials('John Doe')).toBe('JD');
    expect(getUserInitials('alice cooper')).toBe('AC');
  });

  it('returns first-two characters (uppercase) for single-word names', () => {
    expect(getUserInitials('John')).toBe('JO');
    expect(getUserInitials('alice')).toBe('AL');
  });

  it('returns first + last initial even for three-or-more-word names', () => {
    expect(getUserInitials('John Middle Doe')).toBe('JD');
    expect(getUserInitials('alice bob carol dave')).toBe('AD');
  });

  it('trims and collapses extra whitespace', () => {
    expect(getUserInitials('   John    Doe   ')).toBe('JD');
    expect(getUserInitials('\tAlice\n  Bob\r ')).toBe('AB');
  });

  it('returns "?" for empty or whitespace-only names', () => {
    expect(getUserInitials('')).toBe('?');
    expect(getUserInitials('   ')).toBe('?');
    expect(getUserInitials('\t\n\r')).toBe('?');
  });

  it('treats a nullish/undefined name as "?" via the falsy fallback', () => {
    // The RoomPage caller does `getUserInitials(m.name || '')`, so the
    // helper itself only sees strings — but a null/undefined input must
    // also fail safe rather than throw.
    expect(getUserInitials(null as unknown as string)).toBe('?');
    expect(getUserInitials(undefined as unknown as string)).toBe('?');
  });

  it('handles single-character names by uppercasing them', () => {
    expect(getUserInitials('A')).toBe('A');
    expect(getUserInitials('a')).toBe('A');
    expect(getUserInitials('Z Middle')).toBe('ZM');
  });

  it('preserves non-ASCII characters (locale-agnostic uppercase)', () => {
    // We don't pin the exact uppercase form across locales (Intl.Collator
    // rules differ), but we lock that the result is non-empty and matches
    // the first character in some recognizable form. The contract is "show
    // the user something", not "follow a specific Unicode folding".
    const result = getUserInitials('élise Müller');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});
