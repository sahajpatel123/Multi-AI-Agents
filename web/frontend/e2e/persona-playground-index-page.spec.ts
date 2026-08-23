/**
 * Smoke-test the /persona-playground/index public page.
 * Pure presentational — no auth required.
 *
 * The Persona Playground Index surface is an alphabetical A–Z list of every
 * Arena tool, grouped by first letter, with a back-link to the visual hub.
 * It exposes a hero, a grouped section list, and a fallback CTA. We pin
 * counts + section headings so accidental removal of any block surfaces
 * in CI, and we exercise the round-trip from index → tool → back.
 *
 * Follows the cycle-294 / cycle-310 / cycle-323 pattern of light
 * presentational smoke tests for public surfaces.
 */

import { expect, test } from '@playwright/test';

test.describe('Persona Playground Index page', () => {
  test('renders the hero, grouped sections, and all 27 rows on first paint', async ({ page }) => {
    await page.goto('/persona-playground/index');

    // Hero
    await expect(
      page.getByRole('heading', {
        name: /every arena tool,\s*in one list\./i,
      }),
    ).toBeVisible();

    // Back-link to the hub is present in the hero.
    await expect(page.getByRole('link', { name: /back to the hub/i })).toBeVisible();

    // One row per playground entry (27 tools today).
    const rows = page.locator('.pidx-row');
    expect(await rows.count()).toBe(27);

    // One aria-labelled letter h2 heads each group. Letters are data-driven
    // from the tool catalog (today's names start at D), so pin the STRUCTURE
    // — a single-uppercase-letter h2 carrying a "Letter X" aria-label — not
    // any specific letter.
    const firstLetterHeading = page
      .getByRole('heading', { level: 2 })
      .filter({ hasText: /^[A-Z]$/ })
      .first();
    await expect(firstLetterHeading).toBeVisible();
    await expect(firstLetterHeading).toHaveAttribute(
      'aria-label',
      /^Letter [A-Z]$/,
    );
  });

  test('deep-links into a tool from the index', async ({ page }) => {
    await page.goto('/persona-playground/index');

    // Click the Persona Battle row (alphabetized under "P").
    await page.locator('.pidx-row__link', { hasText: 'Persona Battle' }).first().click();

    // Land on the Persona Battle page.
    await expect(page).toHaveURL(/\/persona-battle$/);
    // Persona Battle has a hero h1; just confirm we're not still on the index.
    await expect(page).not.toHaveURL(/\/persona-playground\/index$/);
  });

  test('round-trip back to the hub via the hero back-link', async ({ page }) => {
    await page.goto('/persona-playground/index');

    await page.getByRole('link', { name: /back to the hub/i }).click();

    // Soft-nav back to the hub.
    await expect(page).toHaveURL(/\/persona-playground$/);
  });
});
