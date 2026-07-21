/**
 * Smoke-test the /capabilities public page.
 * Pure presentational — no auth required.
 *
 * The capabilities page exposes three topology cards (Debate / Focus / Agent),
 * a 7-stage Agent Mode pipeline, and a 6-card product surface grid. These are
 * stable, presentational anchors that survive BEM renames and reflect what
 * users actually evaluate the product on. We pin counts + section headings so
 * accidental removal of any block surfaces in CI.
 */

import { expect, test } from '@playwright/test';

test.describe('Capabilities page (mocked)', () => {
  test('page renders the documented topologies, pipeline, and surface features', async ({
    page,
  }) => {
    await page.goto('/capabilities');

    await expect(page).toHaveTitle(/Capabilities/);
    await expect(
      page.getByRole('heading', { name: /everything arena can/i, level: 1 }),
    ).toBeVisible();

    // Execution topologies — Debate, Focus, Agent Mode (3 cards).
    await expect(
      page.getByRole('heading', { name: /three ways to run a question/i }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: /debate mode/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /focus mode/i })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /agent mode/i, level: 3 }),
    ).toBeVisible();
    expect(await page.locator('.cap-topo-card').count()).toBe(3);

    // Agent Mode 7-stage pipeline.
    await expect(
      page.getByRole('heading', { name: /7-stage research matrix/i }),
    ).toBeVisible();
    expect(await page.locator('.cap-pipeline-card').count()).toBe(7);

    // Product surface — 6 feature cards.
    await expect(
      page.getByRole('heading', { name: /built for real usage, not demos/i }),
    ).toBeVisible();
    expect(await page.locator('.cap-feature-card').count()).toBe(6);

    // CTA block lands the user somewhere useful. The CTA pitch is a <p>
    // (not a heading), so match by id to avoid false negatives if the
    // element role is ever reshaped.
    await expect(page.locator('#cap-cta-heading')).toBeVisible();
  });

  test('CTA buttons route to the documented destinations', async ({ page }) => {
    await page.goto('/capabilities');

    // "Compare plans" inside the hero points at /pricing.
    await page
      .getByRole('button', { name: /compare plans/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/pricing$/);

    // "Product overview" inside the closing CTA points at /product.
    await page.goto('/capabilities');
    await page.getByRole('button', { name: /product overview/i }).click();
    await expect(page).toHaveURL(/\/product$/);
  });

  test('hero CTA on an unauthenticated visit routes through sign-up', async ({ page }) => {
    await page.goto('/capabilities');

    // The hero "Try Arena" CTA is the first one on the page; the unit test
    // confirms it navigates unauthenticated visitors to sign-up with the
    // redirect intent intact.
    await page.getByRole('button', { name: /try arena/i }).first().click();
    await expect(page).toHaveURL(/\/signin\?tab=signup/);
  });
});