/**
 * Smoke-test the /persona-mosaic-roasting-battle public page.
 * Pure presentational — no auth required.
 *
 * The Mosaic Roasting Battle surface pastes two AI outputs and
 * renders a 4-mind panel that picks A or B + explains. The page
 * exposes a hero, a 2-input textarea form, 4 sample matchups, a
 * 4-critic verdict grid, and a recent battles history. We pin
 * counts + section headings so accidental removal of any block
 * surfaces in CI.
 *
 * Follows the cycle-152 / cycle-158 / cycle-159 / cycle-176
 * pattern of light presentational smoke tests for public surfaces.
 */

import { expect, test } from '@playwright/test';

test.describe('Persona Mosaic Roasting Battle page (mocked)', () => {
  test('renders the hero, sample list, and predictor on empty inputs', async ({ page }) => {
    await page.goto('/persona-mosaic-roasting-battle');

    // Hero
    await expect(
      page.getByRole('heading', {
        name: /two mosaic roastings\.\s*four minds judge\.\s*one is sharper\./i,
      }),
    ).toBeVisible();

    // Input form — two textareas labelled A and B.
    const textareas = page.getByRole('textbox');
    expect(await textareas.count()).toBe(2);
    await expect(page.getByLabel('Mosaic Roasting A')).toBeVisible();
    await expect(page.getByLabel('Mosaic Roasting B')).toBeVisible();

    // Sample list — 4 curated matchups.
    const samples = page.locator('.pmrb-sample');
    expect(await samples.count()).toBe(4);

    // No verdict yet on empty inputs.
    await expect(page.locator('.pmrb-result')).toHaveCount(0);
  });

  test('4-mind panel renders after both inputs are filled', async ({ page }) => {
    await page.goto('/persona-mosaic-roasting-battle');

    // Type two contrasting outputs. Role-scoped locators: getByLabel
    // alone substring-matches the stats div ("Mosaic roasting battle
    // stats") and result region ("Mosaic Roasting battle result") — a
    // strict-mode violation that failed this spec on the E2E job's
    // first run.
    await page.getByRole('textbox', { name: 'Mosaic Roasting A' }).fill('It depends on the context. Many factors to consider.');
    await page.getByRole('textbox', { name: 'Mosaic Roasting B' }).fill('Take the bold path. The cost of being wrong now is lower than the cost of being late.');

    // Click "Run the battle".
    await page.getByRole('button', { name: /run the battle/i }).click();

    // Result head + 4 critics + 2 sides.
    await expect(page.locator('.pmrb-result')).toBeVisible();
    await expect(page.locator('.pmrb-result__winner-pill')).toBeVisible();
    await expect(page.locator('.pmrb-side')).toHaveCount(2);
    await expect(page.locator('.pmrb-critic')).toHaveCount(4);

    // Tally sums to 4 across A + B.
    const tally = await page.locator('.pmrb-result__tally').innerText();
    const m = tally.match(/(\d+) for A\s*·\s*(\d+) for B/);
    expect(m).not.toBeNull();
    const a = Number(m![1]);
    const b = Number(m![2]);
    expect(a + b).toBe(4);
  });

  test('arbitrary URL params replay the same battle', async ({ page }) => {
    const a = 'A clean argument with a load-bearing claim.';
    const b = 'A vague take with no evidence and no mechanism.';
    await page.goto(`/persona-mosaic-roasting-battle?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);

    // The textareas pre-fill from the query string (role-scoped — see
    // the strict-mode note in the test above).
    await expect(page.getByRole('textbox', { name: 'Mosaic Roasting A' })).toHaveValue(a);
    await expect(page.getByRole('textbox', { name: 'Mosaic Roasting B' })).toHaveValue(b);

    // Verdict appears immediately (computed on first render).
    await expect(page.locator('.pmrb-result__winner-pill')).toBeVisible();
    await expect(page.locator('.pmrb-critic')).toHaveCount(4);
  });
});
