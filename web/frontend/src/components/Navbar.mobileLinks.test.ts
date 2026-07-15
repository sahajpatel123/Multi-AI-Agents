import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Structural guard: authenticated mobile drawer must not list Arena/Agent twice.
 * Primary destinations come from the path map; the auth branch is account-only.
 */
describe('Navbar mobile auth links (source structure)', () => {
  it('does not re-emit Arena/Agent navigate after the primary map', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'Navbar.tsx'), 'utf8');
    // Slice from the mobile path map through the end of the auth account branch.
    const start = src.indexOf("label: 'Arena', path: '/app'");
    const end = src.indexOf('Sign out');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const slice = src.slice(start, end);
    // One product destination each in the map…
    expect(slice.split("path: '/app'").length - 1).toBe(1);
    expect(slice.split("path: '/agent'").length - 1).toBe(1);
    // …and no second navigate('/app') / navigate('/agent') in the account branch.
    // (Watchlist path stays in the map only.)
    const afterMap = slice.slice(slice.indexOf(').map((item)'));
    expect(afterMap).not.toMatch(/navigate\('\/app'\)/);
    expect(afterMap).not.toMatch(/navigate\('\/agent'\)/);
    expect(afterMap).toMatch(/My Panel/);
    expect(afterMap).toMatch(/Subscription/);
  });
});
