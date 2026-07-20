/**
 * Smoke-test the /changelog public page.
 * Pure presentational — no auth required.
 *
 * The changelog page renders many <article> entries plus a "Latest"
 * release badge. We assert the title + the presence of the v0.7
 * release version label (a stable string that the timeline exposes
 * regardless of BEM class renames). Use waitFor so the assertion
 * survives a slow dev-server warm-up.
 */

import { expect, test } from '@playwright/test';

test.describe('Changelog page (mocked)', () => {
  test('page renders with title and the v0.7 release version label', async ({ page }) => {
    await page.goto('/changelog');
    await expect(page).toHaveTitle(/Changelog/);
    // waitFor gives the dev server a moment to hydrate; the version
    // label "v0.7" is the most recent release and lives in the timeline
    // regardless of BEM class renames.
    await expect(page.locator('text=v0.7').first()).toBeVisible({ timeout: 10_000 });
  });
});
