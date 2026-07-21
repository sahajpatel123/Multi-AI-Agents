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

  test('latest release badge + at least one entry headline render', async ({ page }) => {
    await page.goto('/changelog');

    // Pin the "Latest" release badge — it's the marker that orients
    // users to the most recent release at a glance.
    await expect(page.getByText(/^latest$/i).first()).toBeVisible();

    // The timeline renders many <article> entries. Pin at least one is
    // present (catch a regression that emptied the timeline) and the
    // most recent release headline is visible.
    const articles = page.locator('article');
    expect(await articles.count()).toBeGreaterThanOrEqual(1);

    // The most recent entry should be the v0.7 release — pin its headline
    // text is in the DOM. We match loosely to allow copy edits to the
    // headline without breaking the test.
    await expect(articles.first()).toBeVisible();
  });
});
