/**
 * Smoke-test the /about public page.
 * Pure presentational — no auth required.
 */

import { expect, test } from '@playwright/test';

test.describe('About page (mocked)', () => {
  test('about page renders with documented sections', async ({ page }) => {
    await page.goto('/about');
    await expect(page).toHaveTitle(/About/);
    // Lock the public presentational shape: a top-level <main> landmark
    // and at least one "story" card (the user has been polishing the
    // about-page layout, so this catches accidental removal).
    await expect(page.locator('main')).toBeVisible();
    const storyCards = page.locator('[class*="story"]');
    expect(await storyCards.count()).toBeGreaterThanOrEqual(1);
  });

});
