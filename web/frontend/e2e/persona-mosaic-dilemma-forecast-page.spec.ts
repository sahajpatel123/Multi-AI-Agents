/**
 * Smoke-test the /persona-mosaic-dilemma-forecast public page.
 * Pure presentational — no auth required.
 *
 * The Mosaic Dilemma Forecast surface pastes two dilemma
 * framings and renders an 8-mind panel that picks A or B +
 * explains. The page exposes a hero, a 2-input textarea form,
 * 4 sample matchups, an 8-critic verdict grid, and a recent
 * forecasts history. We pin counts + section headings so
 * accidental removal of any block surfaces in CI.
 *
 * Follows the cycle-152 / cycle-158 / cycle-159 / cycle-176
 * / cycle-294 pattern of light presentational smoke tests for
 * public surfaces.
 */

import { expect, test } from '@playwright/test';

test.describe('Persona Mosaic Dilemma Forecast page (mocked)', () => {
  test('renders the hero, sample list, and predictor on empty inputs', async ({ page }) => {
    await page.goto('/persona-mosaic-dilemma-forecast');

    // Hero
    await expect(
      page.getByRole('heading', {
        name: /two dilemma framings\.\s*eight minds judge\.\s*one is sharper\./i,
      }),
    ).toBeVisible();

    // Input form — two textareas labelled A and B.
    const textareas = page.getByRole('textbox');
    expect(await textareas.count()).toBe(2);
    await expect(page.getByLabel('Dilemma A')).toBeVisible();
    await expect(page.getByLabel('Dilemma B')).toBeVisible();

    // Sample list — 4 curated matchups.
    const samples = page.locator('.pmdf-sample');
    expect(await samples.count()).toBe(4);

    // No verdict yet on empty inputs.
    await expect(page.locator('.pmdf-result')).toHaveCount(0);
  });

  test('8-mind panel renders after both inputs are filled', async ({ page }) => {
    await page.goto('/persona-mosaic-dilemma-forecast');

    // Type two contrasting dilemma framings.
    await page.getByLabel('Dilemma A').fill('Should I take the safe job or the risky startup?');
    await page.getByLabel('Dilemma B').fill('Should I stay in my current role or pursue a new opportunity?');

    // Click "Forecast the sharper".
    await page.getByRole('button', { name: /forecast the sharper/i }).click();

    // Result head + 8 critics + 2 sides.
    await expect(page.locator('.pmdf-result')).toBeVisible();
    await expect(page.locator('.pmdf-result__winner-pill')).toBeVisible();
    await expect(page.locator('.pmdf-side')).toHaveCount(2);
    await expect(page.locator('.pmdf-critic')).toHaveCount(8);

    // Tally sums to 8 across A + B.
    const tally = await page.locator('.pmdf-result__tally').innerText();
    const m = tally.match(/(\d+) for A\s*·\s*(\d+) for B/);
    expect(m).not.toBeNull();
    const a = Number(m![1]);
    const b = Number(m![2]);
    expect(a + b).toBe(8);
  });

  test('arbitrary URL params replay the same forecast', async ({ page }) => {
    const a = 'Take the safe job.';
    const b = 'Take the risky startup.';
    await page.goto(`/persona-mosaic-dilemma-forecast?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);

    // The textareas pre-fill from the query string.
    await expect(page.getByLabel('Dilemma A')).toHaveValue(a);
    await expect(page.getByLabel('Dilemma B')).toHaveValue(b);

    // Verdict appears immediately (computed on first render).
    await expect(page.locator('.pmdf-result__winner-pill')).toBeVisible();
    await expect(page.locator('.pmdf-critic')).toHaveCount(8);
  });
});
