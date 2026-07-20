import { expect, test, type Page } from '@playwright/test';

async function geometry(page: Page) {
  return page.evaluate(() => {
    const targetSelectors = [
      '.privacy-action',
      '.privacy-route-selector button',
      '.privacy-index nav a',
      '.privacy-provider-links a',
      '.privacy-inline-link',
      '.privacy-contact-band a',
      '.privacy-manual__footer a',
      '[data-public-prism-nav] .vp-brand',
      '[data-public-prism-nav] .vp-enter',
      '[data-public-prism-nav] .vp-menu-button',
      '.site-footer__brand',
      '.site-footer__link',
      '.site-footer__top-btn',
    ];
    const targets = targetSelectors.flatMap((selector) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)),
    );
    const targetSizes = targets
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return Math.min(rect.width, rect.height);
      })
      .filter((size) => size > 0);
    const chapterNav = document.querySelector<HTMLElement>('.privacy-index nav');
    const routeSelector = document.querySelector<HTMLElement>('.privacy-route-selector');
    const inventory = document.querySelector<HTMLElement>('.privacy-inventory__scroll');

    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      chapters: document.querySelectorAll('.privacy-chapter').length,
      routes: document.querySelectorAll('.privacy-route-selector button').length,
      postureCards: document.querySelectorAll('.privacy-posture-card').length,
      minimumTarget: Math.min(...targetSizes),
      chapterNavScrolls: Boolean(
        chapterNav && chapterNav.scrollWidth > chapterNav.clientWidth,
      ),
      routeSelectorScrolls: Boolean(
        routeSelector && routeSelector.scrollWidth > routeSelector.clientWidth,
      ),
      inventoryScrolls: Boolean(
        inventory && inventory.scrollWidth > inventory.clientWidth,
      ),
      radii: [
        '.privacy-boundary',
        '.privacy-posture-card',
        '.privacy-inspector__console',
        '.privacy-route-flow li',
        '.privacy-inventory__scroll',
        '.privacy-manual__sheet',
      ].map((selector) =>
        getComputedStyle(document.querySelector(selector) as Element).borderRadius,
      ),
    };
  });
}

async function scrollChapterToReadingLine(page: Page, id: string) {
  await page.locator(`#${id}`).evaluate((element) => {
    const top = element.getBoundingClientRect().top + window.scrollY - 150;
    window.scrollTo({ top, behavior: 'auto' });
    window.dispatchEvent(new Event('scroll'));
  });
}

test.describe('Privacy data flow field guide', () => {
  test('switches data routes with accessible native controls', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/privacy');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Privacy Policy' }),
    ).toBeVisible();
    await expect(page.locator('.privacy-chapter')).toHaveCount(10);
    await expect(page.locator('.privacy-route-selector button')).toHaveCount(5);

    const selector = page.getByRole('group', { name: 'Select a data route' });
    const billing = selector.getByRole('button', { name: /03\s*Billing/i });
    await billing.click();
    await expect(billing).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('heading', { name: 'Subscription and payment' }),
    ).toBeVisible();
    await expect(page.getByText(/Razorpay handles the payment instrument/i)).toBeVisible();

    const localWork = selector.getByRole('button', { name: /05\s*Local work/i });
    await localWork.focus();
    await page.keyboard.press('Enter');
    await expect(localWork).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Condura handoff' })).toBeVisible();
    await expect(page.getByText(/Arena is web-only/i)).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test('synchronizes chapters while preserving fixed chrome and focus contrast', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/privacy#model-providers');

    await expect(
      page.getByRole('heading', { name: 'AI model providers and request context' }),
    ).toBeVisible();
    await expect.poll(async () =>
      page.locator('#model-providers').evaluate(
        (element) => element.getBoundingClientRect().top,
      ),
    ).toBeLessThan(190);

    const navigation = page.getByRole('navigation', { name: 'Privacy chapters' });
    await expect(
      navigation.getByRole('link', { name: /Model providers/i }),
    ).toHaveAttribute('aria-current', 'location');

    await scrollChapterToReadingLine(page, 'security-retention');
    await expect(
      navigation.getByRole('link', { name: /Security \+ retention/i }),
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

    await navigation.getByRole('link', { name: /Choices \+ deletion/i }).click();
    await expect(page).toHaveURL(/#choices-deletion$/);
    await expect(
      navigation.getByRole('link', { name: /Choices \+ deletion/i }),
    ).toHaveAttribute('aria-current', 'location');

    const repository = page.locator('#choices-deletion .privacy-inline-link');
    await repository.focus();
    await expect(repository).toHaveCSS('outline-color', 'rgb(11, 12, 10)');

    expect(pageErrors).toEqual([]);
  });

  test('lands on a deep chapter even when the lazy route module is delayed', async ({
    page,
  }) => {
    let delayed = false;
    await page.route('**/src/pages/PrivacyPage.tsx*', async (route) => {
      delayed = true;
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.continue();
    });

    await page.goto('/privacy#choices-deletion');
    await expect(
      page.getByRole('heading', { name: 'Your controls and deletion requests' }),
    ).toBeVisible();
    expect(delayed).toBe(true);

    await expect.poll(async () =>
      page.locator('#choices-deletion').evaluate(
        (element) => element.getBoundingClientRect().top,
      ),
    ).toBeLessThan(190);
    const top = await page.locator('#choices-deletion').evaluate(
      (element) => element.getBoundingClientRect().top,
    );
    expect(top).toBeGreaterThanOrEqual(0);
  });

  for (const viewport of [
    { label: 'tablet', width: 834, height: 1112 },
    { label: 'mobile', width: 390, height: 844 },
  ]) {
    test(`${viewport.label} contains intentional rails and keeps controls usable`, async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));

      await page.setViewportSize(viewport);
      await page.goto('/privacy');
      await expect(page.locator('.privacy-manual__sheet')).toBeVisible();

      const result = await geometry(page);
      expect(result.documentWidth).toBe(result.viewportWidth);
      expect(result.chapters).toBe(10);
      expect(result.routes).toBe(5);
      expect(result.postureCards).toBe(4);
      expect(result.minimumTarget).toBeGreaterThanOrEqual(44);
      expect(result.chapterNavScrolls).toBe(true);
      expect(result.routeSelectorScrolls).toBe(true);
      expect(result.inventoryScrolls).toBe(true);
      expect(result.radii).toEqual(['0px', '0px', '0px', '0px', '0px', '0px']);

      const localWork = page.getByRole('button', { name: /05\s*Local work/i });
      await localWork.click();
      await expect(localWork).toHaveAttribute('aria-pressed', 'true');
      const activeRouteIsVisible = await localWork.evaluate((active) => {
        const navigation = active.closest('.privacy-route-selector')!;
        const activeRect = active.getBoundingClientRect();
        const navigationRect = navigation.getBoundingClientRect();
        return (
          activeRect.left >= navigationRect.left - 1 &&
          activeRect.right <= navigationRect.right + 1
        );
      });
      expect(activeRouteIsVisible).toBe(true);

      await scrollChapterToReadingLine(page, 'changes-contact');
      const finalChapter = page.getByRole('link', { name: /10 Changes \+ contact/i });
      await expect(finalChapter).toHaveAttribute('aria-current', 'location');
      const activeChapterIsVisible = await finalChapter.evaluate((active) => {
        const navigation = active.closest('nav')!;
        const activeRect = active.getBoundingClientRect();
        const navigationRect = navigation.getBoundingClientRect();
        return (
          activeRect.left >= navigationRect.left - 1 &&
          activeRect.right <= navigationRect.right + 1
        );
      });
      expect(activeChapterIsVisible).toBe(true);

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

  test('traps focus inside the mobile menu and restores the trigger', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/privacy');

    const trigger = page.getByRole('button', { name: 'Open menu' });
    await trigger.click();

    const dialog = page.getByRole('dialog', { name: 'Site navigation' });
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole('button', { name: 'Close menu' });
    await expect(close).toBeFocused();
    await expect(page.locator('#route-content main')).toHaveAttribute('inert', '');

    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('link', { name: /07 Changelog/i })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.locator('#route-content main')).not.toHaveAttribute('inert');
  });

  test('keeps selected and current states distinguishable in forced colors', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/privacy');

    const selectedRoute = page.getByRole('button', { name: /02\s*Conversation/i });
    await expect(selectedRoute).toHaveAttribute('aria-pressed', 'true');
    await expect(selectedRoute).toHaveCSS('outline-style', 'solid');
    await expect(selectedRoute).toHaveCSS('outline-width', '3px');

    const currentChapter = page.getByRole('link', { name: /01 Scope/i });
    await expect(currentChapter).toHaveAttribute('aria-current', 'location');
    await expect(currentChapter).toHaveCSS('text-decoration-line', 'underline');
    await expect(currentChapter).toHaveCSS('border-top-style', 'solid');
  });

  test('honors the reduced-motion preference', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/privacy');

    await expect(page.locator('.privacy-page')).not.toHaveClass(/privacy-page--motion/);
    await expect(page.locator('.privacy-hero__copy')).toHaveCSS(
      'animation-name',
      'none',
    );
  });
});
