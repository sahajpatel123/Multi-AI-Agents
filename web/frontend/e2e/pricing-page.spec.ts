/**
 * Smoke-test the /pricing public paywall.
 * Pure presentational for guests — no auth required.
 *
 * Pins the minimal paywall contract: hero, three tier cards (Plus recommended),
 * comparison matrix, FAQ, and close CTAs. Catches accidental return of the
 * old depth-instrument / ladder / agent-bridge chrome.
 */

import { expect, test } from '@playwright/test';

test.describe('Pricing page (mocked)', () => {
  test('renders the minimal paywall shape', async ({ page }) => {
    await page.goto('/pricing');

    await expect(page).toHaveTitle(/Pricing/);
    await expect(page.getByRole('heading', { name: /pay for depth/i, level: 1 })).toBeVisible();
    await expect(page.locator('main#main-content')).toBeVisible();

    await expect(page.getByRole('heading', { name: /choose a plan/i })).toBeVisible();
    expect(await page.locator('.pricing-tier-card').count()).toBe(3);
    await expect(page.locator('.pricing-tier-card--plus.is-recommended')).toBeVisible();
    await expect(page.getByText(/^recommended$/i)).toBeVisible();

    await expect(
      page.getByRole('heading', { name: /every limit, before checkout/i }),
    ).toBeVisible();
    await expect(page.locator('.pricing-matrix')).toBeVisible();

    await expect(page.getByRole('heading', { name: /before you decide/i })).toBeVisible();
    await expect(page.getByText(/which minds are included with explorer/i)).toBeVisible();

    await expect(page.getByRole('heading', { name: /ask one real question first/i })).toBeVisible();

    // Removed overbuilt chrome must stay gone.
    expect(await page.locator('.pricing-depth-instrument').count()).toBe(0);
    expect(await page.locator('.pricing-ladder').count()).toBe(0);
    expect(await page.locator('.pricing-agent-bridge').count()).toBe(0);
    expect(await page.locator('.pricing-mind-access').count()).toBe(0);
  });

  test('guest Start for free routes through sign-up', async ({ page }) => {
    await page.goto('/pricing');

    await page
      .locator('.pricing-tier-card--explorer .pricing-tier-card__cta')
      .click();
    await expect(page).toHaveURL(/\/signin\?tab=signup/);
  });

  test('billing toggle updates annual effective prices', async ({ page }) => {
    await page.goto('/pricing');

    await page.getByRole('button', { name: /^annual/i }).click();

    await expect(page.locator('.pricing-tier-card--plus .pricing-tier-card__price')).toContainText(
      '742',
    );
    await expect(page.locator('.pricing-tier-card--plus')).toContainText('₹8,899 / year');
    await expect(page.locator('.pricing-tier-card--pro .pricing-tier-card__price')).toContainText(
      '1,650',
    );
    await expect(page.locator('.pricing-tier-card--pro')).toContainText('₹19,800 / year');
  });
});
