/**
 * Smoke-test the /404 catch-all page.
 * Pure presentational — no auth required.
 *
 * `main.tsx` registers `<Route path="*" element={<NotFoundPage />} />`,
 * so any unknown path renders the branded recovery surface. We pin the
 * headline copy, the requested-path code block, the recovery-actions
 * landmark, and the primary CTA's destination. Follows the cycle-118 /
 * cycle-134 / cycle-135 / cycle-152 pattern of light presentational
 * smoke tests for public surfaces.
 */

import { expect, test } from '@playwright/test';

test.describe('Not Found page (mocked)', () => {
  test('unknown route renders the branded 404 surface with the attempted path', async ({
    page,
  }) => {
    await page.goto('/this-route-definitely-does-not-exist');

    await expect(
      page.getByRole('heading', { name: /this page isn'?t in the arena/i }),
    ).toBeVisible();
    await expect(page.getByText(/404\s*·\s*lost path/i)).toBeVisible();

    // The watermark + kicker keep the "404" label visible regardless of
    // any future copy refactor on the headline.
    await expect(page.locator('.not-found-card__watermark')).toHaveText('404');

    // The attempted path is surfaced in a <code> block so users can
    // copy/paste it into a bug report. Pin the path renders for an
    // arbitrary unknown URL.
    const requested = page.locator('.not-found-path__value');
    await expect(requested).toBeVisible();
    await expect(requested).toHaveText('/this-route-definitely-does-not-exist');

    // Recovery-actions landmark + the primary CTA copy.
    await expect(
      page.getByRole('group', { name: /recovery options/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /back to home/i }),
    ).toBeVisible();
  });

  test('primary recovery CTA navigates to the documented destination', async ({ page }) => {
    await page.goto('/another-missing-page');

    // Unauthenticated visitors see "Back to home" as the primary action
    // (path "/"); the secondary "Try Arena →" routes through /signin.
    await page.getByRole('button', { name: /back to home/i }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('handles deeply-nested unknown paths without crashing', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/some/deeply/nested/missing/route/that/has/no/meaning');

    await expect(
      page.getByRole('heading', { name: /this page isn'?t in the arena/i }),
    ).toBeVisible();
    const requested = page.locator('.not-found-path__value');
    await expect(requested).toBeVisible();

    // Page must not throw — the formatAttemptedPath sanitizer caps length
    // at 120 chars, so we only assert it produced *some* non-empty text.
    const text = await requested.textContent();
    expect(text?.length ?? 0).toBeGreaterThan(0);

    expect(pageErrors).toEqual([]);
  });
});