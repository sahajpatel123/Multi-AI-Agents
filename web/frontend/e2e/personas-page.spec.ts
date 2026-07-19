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

    const council = page.locator('.personas-council');
    await expect(council).toBeVisible();
    await expect(council.getByRole('listitem')).toHaveCount(4);
    const analystLens = page.getByRole('button', { name: /inspect the analyst lens in slot 1/i });
    const philosopherLens = page.getByRole('button', { name: /inspect the philosopher lens in slot 2/i });
    await expect(analystLens).toHaveAttribute('aria-pressed', 'true');
    await philosopherLens.click();
    await expect(philosopherLens).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Inspected panel lens')).toContainText(
      'What if the question is framed incorrectly?',
    );
    await expect(page.getByRole('button', { name: /copy panel as markdown/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /download panel as markdown/i })).toBeVisible();
    const smallestPanelTarget = await page.locator('#panel-studio button').evaluateAll((buttons) =>
      Math.min(...buttons.map((button) => button.getBoundingClientRect().height)),
    );
    expect(smallestPanelTarget).toBeGreaterThanOrEqual(44);

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

  test('keeps the council compact and fully operable on a 390px phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/personas');
    const section = page.locator('#panel-studio');
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator('.personas-panel-card')).toHaveCount(4);

    const geometry = await section.evaluate((element) => {
      const lens = element.querySelector('.personas-council__lens')?.getBoundingClientRect();
      const cards = Array.from(element.querySelectorAll('.personas-panel-card'))
        .map((card) => card.getBoundingClientRect());
      const targets = Array.from(element.querySelectorAll('button'))
        .map((button) => button.getBoundingClientRect().height);
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        sectionRight: element.getBoundingClientRect().right,
        lensTop: lens?.top ?? Number.POSITIVE_INFINITY,
        firstCardTop: cards[0]?.top ?? Number.NEGATIVE_INFINITY,
        firstCardLeft: cards[0]?.left,
        secondCardLeft: cards[1]?.left,
        firstRowAligned: Math.abs((cards[0]?.top ?? 0) - (cards[1]?.top ?? 1)) < 1,
        secondRowBelow: (cards[2]?.top ?? 0) > (cards[0]?.top ?? 0),
        smallestTarget: Math.min(...targets),
      };
    });

    expect(geometry.documentWidth).toBe(geometry.viewport);
    expect(geometry.sectionRight).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.lensTop).toBeLessThan(geometry.firstCardTop);
    expect(geometry.firstRowAligned).toBe(true);
    expect(geometry.secondRowBelow).toBe(true);
    expect(geometry.secondCardLeft).toBeGreaterThan(geometry.firstCardLeft ?? 0);
    expect(geometry.smallestTarget).toBeGreaterThanOrEqual(44);

    const lensFocusOrder = [
      page.getByRole('button', { name: /inspect slot 1: the analyst/i }),
      page.getByRole('button', { name: /inspect slot 2: the philosopher/i }),
      page.getByRole('button', { name: /inspect slot 3: the pragmatist/i }),
      page.getByRole('button', { name: /inspect slot 4: the contrarian/i }),
    ];
    await lensFocusOrder[0].focus();
    await expect(lensFocusOrder[0]).toBeFocused();
    for (const nextLens of lensFocusOrder.slice(1)) {
      await page.keyboard.press('Tab');
      await expect(nextLens).toBeFocused();
    }
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /inspect the analyst lens in slot 1/i })).toBeFocused();

    await lensFocusOrder[3].click();
    await expect(page.getByLabel('Inspected panel lens')).toContainText(
      'What does the current consensus refuse to admit?',
    );
    expect(errors).toEqual([]);
  });

});
