import { expect, test } from '@playwright/test';

test.describe('Personas public studio', () => {
  test('stays complete and keyboard-safe at the 834px tablet edge', async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/personas');
    await expect(page.getByRole('heading', { name: /build useful disagreement/i })).toBeVisible();

    const geometry = await page.evaluate(() => {
      const title = document.querySelector('.personas-studio-hero h1')?.getBoundingClientRect();
      return {
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        titleLeft: title?.left ?? -1,
        titleRight: title?.right ?? Number.POSITIVE_INFINITY,
        mainIds: document.querySelectorAll('#main-content').length,
        routeIds: document.querySelectorAll('#route-content').length,
      };
    });
    expect(geometry.documentWidth).toBe(geometry.viewport);
    expect(geometry.titleLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.titleRight).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.mainIds).toBe(1);
    expect(geometry.routeIds).toBe(1);

    const skip = page.locator('.skip-to-content');
    await skip.focus();
    await skip.press('Enter');
    await expect(page.locator('main#main-content')).toBeFocused();

    await expect(page.locator('.personas-lib-card')).toHaveCount(8);
    await page.getByRole('button', { name: /show all 16 minds/i }).click();
    await expect(page.locator('.personas-lib-card')).toHaveCount(16);
    await page.getByRole('button', { name: /show fewer minds/i }).click();
    await expect(page.locator('.personas-lib-card')).toHaveCount(8);

    const trigger = page.getByRole('button', { name: /swap the analyst in slot 1/i });
    await trigger.click();
    const dialog = page.locator('.swap-modal');
    await expect(dialog).toBeVisible();
    const overlayGeometry = await page.evaluate(() => {
      const backdrop = document.querySelector('.personas-modal-backdrop')?.getBoundingClientRect();
      const modal = document.querySelector('.swap-modal')?.getBoundingClientRect();
      return {
        backdropParent: document.querySelector('.personas-modal-backdrop')?.parentElement?.tagName,
        backdropTop: backdrop?.top,
        backdropHeight: backdrop?.height,
        modalTop: modal?.top,
        modalBottom: modal?.bottom,
        viewportHeight: window.innerHeight,
        bodyOverflow: document.body.style.overflow,
      };
    });
    expect(overlayGeometry.backdropParent).toBe('BODY');
    expect(overlayGeometry.backdropTop).toBe(0);
    expect(overlayGeometry.backdropHeight).toBe(overlayGeometry.viewportHeight);
    expect(overlayGeometry.modalTop).toBeGreaterThanOrEqual(0);
    expect(overlayGeometry.modalBottom).toBeLessThanOrEqual(overlayGeometry.viewportHeight);
    expect(overlayGeometry.bodyOverflow).toBe('hidden');

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    expect(errors).toEqual([]);
  });
});
