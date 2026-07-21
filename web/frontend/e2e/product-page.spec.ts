/**
 * Smoke-test the /product public page.
 * Pure presentational — no auth required.
 *
 * The Product page exposes two primary mode cards (Arena + Agent),
 * a 3-showcase scroller (strategy / product / research), a 4-row
 * routing table that maps user signals to engine choices, and a
 * 6-card product-surface section. Each block has a stable heading
 * or anchored id that survives BEM renames.
 *
 * Follows the cycle-118 / cycle-134 / cycle-135 / cycle-152 /
 * cycle-153 / cycle-158 pattern of light presentational smoke
 * tests for public surfaces.
 */

import { expect, test } from '@playwright/test';

test.describe('Product page (mocked)', () => {
  test('renders the documented hero + mode cards + four sections + CTAs', async ({ page }) => {
    await page.goto('/product');

    // Hero
    await expect(
      page.getByRole('heading', { level: 1, name: /two ways to\s*think\./i }),
    ).toBeVisible();

    // Two primary mode cards (Arena + Agent) — the page's key narrative.
    await expect(
      page.getByRole('heading', { name: /^arena mode$/i, level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /^agent mode$/i, level: 2 }),
    ).toBeVisible();

    // Four anchored sections — pin section headings so any removal
    // surfaces in CI even if BEM class names churn.
    await expect(
      page.getByRole('heading', { name: /see the difference in the output\./i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /choose by the work—not the hype\./i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /the verdict is only the beginning\./i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: /choose the engine\.\s*keep the account\./i,
      }),
    ).toBeVisible();

    // Showcase scroller: 3 strategic examples (strategy / product / research).
    // Pin the showcase container is present; per-showcase heading text
    // is dynamic so we rely on the parent section anchor.
    const showcaseSection = page.locator('section').filter({
      has: page.getByRole('heading', { name: /see the difference in the output\./i }),
    });
    await expect(showcaseSection).toBeVisible();

    // 4 routing rows + 6 product-surface cards — pin by count.
    expect(
      await page.getByRole('heading', { name: /^(panel|judgment|debate|focus|memory|rooms)$/i }).count(),
    ).toBe(6);
  });

  test('primary CTAs route to the documented destinations', async ({ page }) => {
    await page.goto('/product');

    // Hero "Try a live question →" routes through /signin for guests.
    await page.getByRole('button', { name: /try a live question/i }).click();
    await expect(page).toHaveURL(/\/signin\?tab=signup/);

    // Compare-plans CTA at the bottom routes to /pricing.
    await page.goto('/product');
    await page
      .getByRole('button', { name: /compare plans/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/pricing$/);
  });

  test('four anchored section ids + EXPLORE EVERY CAPABILITY CTA', async ({ page }) => {
    await page.goto('/product');

    // Pin the 4 stable section anchors used by deep-links + analytics.
    // Refactors that drop or rename any of these break every shared
    // link to the page.
    await expect(page.locator('#product-showcase')).toBeVisible();
    await expect(page.locator('#product-routing-title')).toBeVisible();
    await expect(page.locator('#product-surface-title')).toBeVisible();
    await expect(page.locator('#product-compare-heading')).toBeVisible();

    // Closing CTA → /capabilities (public deep-link into the verified
    // capabilities surface from cycle 152's spec).
    await page
      .getByRole('button', { name: /explore every capability/i })
      .click();
    await expect(page).toHaveURL(/\/capabilities$/);
  });
});