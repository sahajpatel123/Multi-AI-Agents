import { expect, test, type Page } from '@playwright/test';

async function geometry(page: Page) {
  return page.evaluate(() => {
    const targetSelectors = [
      '.terms-action',
      '.terms-index nav a',
      '.terms-clause__links a',
      '.terms-sheet__end a',
    ];
    const targets = targetSelectors.flatMap((selector) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)),
    );
    const targetSizes = targets.map((element) => {
      const rect = element.getBoundingClientRect();
      return Math.min(rect.width, rect.height);
    });
    const internalNav = document.querySelector<HTMLElement>('.terms-index nav');

    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      clauses: document.querySelectorAll('.terms-clause').length,
      signals: document.querySelectorAll('.terms-signal').length,
      minimumTarget: Math.min(...targetSizes),
      internalNavScrolls: Boolean(
        internalNav && internalNav.scrollWidth > internalNav.clientWidth,
      ),
      radii: [
        '.terms-control',
        '.terms-signal',
        '.terms-sheet',
        '.terms-clause',
      ].map((selector) =>
        getComputedStyle(document.querySelector(selector) as Element).borderRadius,
      ),
    };
  });
}

async function scrollClauseToReadingLine(page: Page, id: string) {
  await page.locator(`#${id}`).evaluate((element) => {
    const top = element.getBoundingClientRect().top + window.scrollY - 150;
    window.scrollTo({ top, behavior: 'auto' });
    window.dispatchEvent(new Event('scroll'));
  });
}

test.describe('Terms agreement ledger', () => {
  test('synchronizes clauses while preserving fixed chrome and focus visibility', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/terms#billing');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Terms of Service' }),
    ).toBeVisible();
    await expect(page.locator('article.terms-clause')).toHaveCount(10);
    await expect.poll(async () =>
      page.locator('#billing').evaluate((element) => element.getBoundingClientRect().top),
    ).toBeLessThan(190);

    const clauseNavigation = page.getByRole('navigation', {
      name: 'Terms clauses',
    });
    await expect(clauseNavigation.getByRole('link', { name: /Billing/ })).toHaveAttribute(
      'aria-current',
      'location',
    );

    await scrollClauseToReadingLine(page, 'ai-output');
    await expect(
      clauseNavigation.getByRole('link', { name: /AI output/ }),
    ).toHaveAttribute('aria-current', 'location');

    const fixedChrome = await page.evaluate(() => {
      const navbar = document
        .querySelector<HTMLElement>('[data-public-prism-nav]')!
        .getBoundingClientRect();
      return {
        navbarTop: navbar.top,
        routeTransform: getComputedStyle(
          document.getElementById('route-content')!,
        ).transform,
      };
    });
    expect(Math.abs(fixedChrome.navbarTop)).toBeLessThanOrEqual(1);
    expect(fixedChrome.routeTransform).toBe('none');

    await clauseNavigation.getByRole('link', { name: /Liability/ }).click();
    await expect(page).toHaveURL(/#liability$/);
    await expect(
      clauseNavigation.getByRole('link', { name: /Liability/ }),
    ).toHaveAttribute('aria-current', 'location');

    const repository = page.getByRole('link', { name: 'GitHub repository' });
    await repository.focus();
    await expect(repository).toHaveCSS('outline-color', 'rgb(11, 12, 10)');

    expect(pageErrors).toEqual([]);
  });

  test('lands on a deep clause even when the lazy route module is delayed', async ({
    page,
  }) => {
    let delayed = false;
    await page.route('**/src/pages/TermsPage.tsx*', async (route) => {
      delayed = true;
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.continue();
    });

    await page.goto('/terms#billing');
    await expect(
      page.getByRole('heading', { level: 3, name: 'Subscriptions and billing' }),
    ).toBeVisible();
    expect(delayed).toBe(true);

    await expect.poll(async () =>
      page.locator('#billing').evaluate(
        (element) => element.getBoundingClientRect().top,
      ),
    ).toBeLessThan(190);
    const top = await page
      .locator('#billing')
      .evaluate((element) => element.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(0);
  });

  for (const viewport of [
    { label: 'tablet', width: 834, height: 1112 },
    { label: 'mobile', width: 390, height: 844 },
  ]) {
    test(`${viewport.label} keeps content contained, usable, and hard-edged`, async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));

      await page.setViewportSize(viewport);
      await page.goto('/terms');
      await expect(page.locator('.terms-sheet')).toBeVisible();

      const result = await geometry(page);
      expect(result.documentWidth).toBe(result.viewportWidth);
      expect(result.clauses).toBe(10);
      expect(result.signals).toBe(4);
      expect(result.minimumTarget).toBeGreaterThanOrEqual(44);
      expect(result.internalNavScrolls).toBe(true);
      expect(result.radii).toEqual(['0px', '0px', '0px', '0px']);

      await scrollClauseToReadingLine(page, 'liability');
      const liabilityLink = page.getByRole('link', { name: /09 Liability/ });
      await expect(liabilityLink).toHaveAttribute('aria-current', 'location');
      const activeIsVisible = await liabilityLink.evaluate((active) => {
        const navigation = active.closest('nav')!;
        const activeRect = active.getBoundingClientRect();
        const navigationRect = navigation.getBoundingClientRect();
        return (
          activeRect.left >= navigationRect.left &&
          activeRect.right <= navigationRect.right
        );
      });
      expect(activeIsVisible).toBe(true);

      const footerColors = await page.evaluate(() => ({
        top: getComputedStyle(
          document.querySelector('.site-footer__top-btn') as Element,
        ).color,
        status: getComputedStyle(
          document.querySelector('.site-footer__status-label') as Element,
        ).color,
      }));
      expect(footerColors).toEqual({
        top: 'rgb(11, 12, 10)',
        status: 'rgb(11, 12, 10)',
      });
      expect(pageErrors).toEqual([]);
    });
  }

  test('honors the reduced-motion preference', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/terms');

    await expect(page.locator('.terms-page')).not.toHaveClass(/terms-page--motion/);
    await expect(page.locator('.terms-hero__copy')).toHaveCSS('animation-name', 'none');
  });
});