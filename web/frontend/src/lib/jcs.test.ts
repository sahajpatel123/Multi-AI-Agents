/**
 * Tests for the RFC 8785-style JSON Canonicalization utility used by Condura
 * handoff signatures. The canonicalization contract is security-critical: a
 * single byte of drift would invalidate signature verification, so we pin:
 *   - primitive encoding (null, booleans, numbers incl. non-finite → null)
 *   - string escaping (JSON.stringify parity)
 *   - array preservation of order
 *   - object key sorting (stable, alphabetical, ascending)
 *   - omission of keys whose value is `undefined`
 *   - stability: same input always produces the same output
 */

import { describe, expect, it } from 'vitest';
import { canonicalize } from './jcs';

describe('canonicalize', () => {
  it('encodes null and booleans as their JSON literals', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(false)).toBe('false');
  });

  it('encodes finite numbers via JSON.stringify (no exponent for small ints)', () => {
    expect(canonicalize(0)).toBe('0');
    expect(canonicalize(-7)).toBe('-7');
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize(3.14)).toBe('3.14');
    expect(canonicalize(-0)).toBe('0');
  });

  it('coerces non-finite numbers (NaN, Infinity, -Infinity) to null', () => {
    // Per RFC 8785, non-finite numbers cannot be represented and must be
    // encoded as null. This is the security-critical branch: any drift here
    // breaks signature verification.
    expect(canonicalize(NaN)).toBe('null');
    expect(canonicalize(Infinity)).toBe('null');
    expect(canonicalize(-Infinity)).toBe('null');
  });

  it('encodes strings with JSON.stringify escaping rules', () => {
    expect(canonicalize('hello')).toBe('"hello"');
    expect(canonicalize('')).toBe('""');
    expect(canonicalize('quote"inside')).toBe('"quote\\"inside"');
    expect(canonicalize('back\\slash')).toBe('"back\\\\slash"');
    expect(canonicalize('line\nbreak')).toBe('"line\\nbreak"');
  });

  it('encodes empty containers as their literal forms', () => {
    expect(canonicalize([])).toBe('[]');
    expect(canonicalize({})).toBe('{}');
  });

  it('preserves array order verbatim (no sorting)', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalize(['c', 'a', 'b'])).toBe('["c","a","b"]');
  });

  it('sorts object keys alphabetically (stable, ascending)', () => {
    expect(canonicalize({ b: 1, a: 2, c: 3 })).toBe('{"a":2,"b":1,"c":3}');
    expect(canonicalize({ z: 'last', a: 'first', m: 'mid' })).toBe(
      '{"a":"first","m":"mid","z":"last"}',
    );
  });

  it('omits object keys whose value is undefined (not serialized as null)', () => {
    // RFC 8785: undefined-valued keys are dropped from the output. This is
    // distinct from keys whose value is null (which are kept).
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalize({ b: undefined, a: 1 })).toBe('{"a":1}');
    expect(canonicalize({ a: null, b: undefined })).toBe('{"a":null}');
  });

  it('recursively sorts nested object keys', () => {
    const input = { outer: { z: 1, a: { y: 2, b: 3 } }, first: 'go' };
    expect(canonicalize(input)).toBe(
      '{"first":"go","outer":{"a":{"b":3,"y":2},"z":1}}',
    );
  });

  it('recursively canonicalizes arrays of objects', () => {
    const input = [{ b: 1, a: 2 }, { d: 4, c: 3 }];
    expect(canonicalize(input)).toBe('[{"a":2,"b":1},{"c":3,"d":4}]');
  });

  it('is stable: identical input produces byte-identical output', () => {
    const input = { z: [1, { y: 'a', x: 'b' }], a: null, m: true };
    const out1 = canonicalize(input);
    const out2 = canonicalize(input);
    const out3 = canonicalize({ a: null, m: true, z: [1, { x: 'b', y: 'a' }] });
    expect(out1).toBe(out2);
    expect(out1).toBe(out3);
  });

  it('produces different output for semantically different inputs', () => {
    // Object order in source must NOT affect output (keys always sorted).
    const left = canonicalize({ a: 1, b: 2 });
    const right = canonicalize({ b: 2, a: 1 });
    expect(left).toBe(right);

    // But null vs missing-key are semantically distinct in canonical form.
    expect(canonicalize({ a: null })).toBe('{"a":null}');
    expect(canonicalize({ a: undefined })).toBe('{}');
    expect(canonicalize({ a: null })).not.toBe(canonicalize({ a: undefined }));
  });

  it('returns null for unsupported types at the top level', () => {
    // Functions and symbols have no JSON representation; the canonical form
    // falls back to null. (This is a defensive contract — call sites should
    // not pass these, but the behavior must stay pinned.)
    expect(canonicalize(() => 1)).toBe('null');
    expect(canonicalize(Symbol('x'))).toBe('null');
  });
});
