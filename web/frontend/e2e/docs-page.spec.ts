import { expect, test } from '@playwright/test';

test.describe('Documentation field manual', () => {
  test('renders the hero + 7 chapters + documentation navigation at desktop', async ({
    page,
  }) => {
    // Companion to the cycle 140 tablet-edge test: at default desktop
    // viewport, pin the high-level shape the user sees on first visit.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/docs');

    // Hero heading + 7 chapters + the documentation navigation landmark.
    await expect(
      page.getByRole('heading', { name: /understand the system/i }),
    ).toBeVisible();
    await expect(page.locator('.docs-field-chapter')).toHaveCount(7);

    // The "Documentation chapters" nav landmark is the per-chapter
    // anchor list — pin its 7 links so a future chapter rename /
    // reorder surfaces in CI.
    const chaptersNav = page.getByLabel('Documentation chapters');
    await expect(chaptersNav).toBeVisible();
    await expect(chaptersNav.getByRole('link')).toHaveCount(7);

    // No leftover interactive console from an old design (defensive).
    await expect(page.locator('.docs-query-console')).toHaveCount(0);
  });

  test('chapter nav links update the URL hash on click', async ({ page }) => {
    await page.goto('/docs');

    // Clicking a chapter nav link should update the URL hash so the
    // browser's deep-link + history works. The 3rd chapter link is
    // a stable target — the URL hash it produces is the contract.
    const chaptersNav = page.getByLabel('Documentation chapters');
    const thirdChapter = chaptersNav.getByRole('link').nth(2);
    const href = await thirdChapter.getAttribute('href');
    expect(href).toMatch(/^#/);

    await thirdChapter.click();
    // The URL hash now reflects the clicked chapter.
    expect(new URL(page.url()).hash).toBe(href);
  });

  test('is inspectable and keyboard-safe at the 834px tablet edge', async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/docs');
    await expect(page.getByRole('heading', { name: /understand the system/i })).toBeVisible();
    await expect(page.locator('.docs-field-chapter')).toHaveCount(7);
    await expect(page.getByRole('region', { name: /from clone to first verdict/i })).toBeVisible();
    await expect(page.locator('.docs-query-console')).toHaveCount(0);
    await expect(page.getByLabel('Documentation chapters')).toBeVisible();
    await expect(page.getByLabel('Documentation chapters').getByRole('link')).toHaveCount(7);

    const geometry = await page.evaluate(() => {
      const title = document.querySelector('.docs-field-hero h1')?.getBoundingClientRect();
      const targets = Array.from(document.querySelectorAll<HTMLElement>('main button, main a'))
        .map((target) => target.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      return {
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        titleLeft: title?.left ?? -1,
        titleRight: title?.right ?? Number.POSITIVE_INFINITY,
        smallestTarget: Math.min(...targets.map((rect) => rect.height)),
        overflowingTargets: targets.filter((rect) => rect.left < -0.5 || rect.right > window.innerWidth + 0.5).length,
        mainIds: document.querySelectorAll('#main-content').length,
        routeIds: document.querySelectorAll('#route-content').length,
      };
    });
    expect(geometry.documentWidth).toBe(geometry.viewport);
    expect(geometry.titleLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.titleRight).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.smallestTarget).toBeGreaterThanOrEqual(44);
    expect(geometry.overflowingTargets).toBe(0);
    expect(geometry.mainIds).toBe(1);
    expect(geometry.routeIds).toBe(1);

    const skip = page.locator('.skip-to-content');
    await skip.focus();
    await skip.press('Enter');
    await expect(page.locator('main#main-content')).toBeFocused();

    const pipeline = page.getByRole('group', { name: /inspect agent stage/i });
    await expect(pipeline.getByRole('button')).toHaveCount(7);
    await expect(pipeline).not.toContainText(/steelman/i);
    const verify = pipeline.getByRole('button', { name: /stage 05: verify/i });
    await verify.click();
    await expect(verify).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Selected Agent stage')).toContainText('Verification context');
    await expect(page.getByLabel('Selected Agent stage')).toContainText('bounded to two refinement passes');

    const apiGroups = page.getByRole('group', { name: /api route group/i });
    const billing = apiGroups.getByRole('button', { name: /show billing endpoints/i });
    await billing.click();
    await expect(billing).toHaveAttribute('aria-pressed', 'true');
    const apiPanel = page.locator('.docs-api-explorer__panel');
    await expect(apiPanel).toContainText('POST /api/payments/webhook');
    await expect(apiPanel).toContainText('06 endpoints');
    const panelRadii = await apiPanel.evaluate((panel) =>
      [panel, ...Array.from(panel.children)].map(
        (element) => getComputedStyle(element).borderRadius,
      ),
    );
    expect(panelRadii.every((radius) => radius === '0px')).toBe(true);

    await page.goto('/docs#security');
    const chapterNav = page.locator('.docs-field-nav');
    await expect(chapterNav.locator('a[href="#security"]')).toHaveAttribute('aria-current', 'location');
    await page.locator('#api').evaluate((section) => section.scrollIntoView({ block: 'start' }));
    await expect(chapterNav.locator('a[href="#api"]')).toHaveAttribute('aria-current', 'location');

    expect(errors).toEqual([]);
  });

  test('keeps wide technical surfaces contained and operable on a 390px phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/docs');
    await expect(page.getByRole('heading', { name: /understand the system/i })).toBeVisible();
    await expect(page.locator('.docs-query-console')).toHaveCount(0);

    const geometry = await page.evaluate(() => {
      const title = document.querySelector('.docs-field-hero h1')?.getBoundingClientRect();
      const stageButtons = Array.from(document.querySelectorAll('.docs-pipeline button'))
        .map((button) => button.getBoundingClientRect());
      const apiButtons = Array.from(document.querySelectorAll('.docs-api-explorer__tabs button'))
        .map((button) => button.getBoundingClientRect());
      const targets = Array.from(document.querySelectorAll<HTMLElement>('main button, main a'))
        .map((target) => target.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      const plan = document.querySelector<HTMLElement>('.docs-plan-ledger');
      const projectMap = document.querySelector<HTMLElement>('#architecture .docs-code-block pre');
      return {
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        titleLeft: title?.left ?? -1,
        titleRight: title?.right ?? Number.POSITIVE_INFINITY,
        smallestTarget: Math.min(...targets.map((rect) => rect.height)),
        overflowingTargets: targets.filter((rect) => rect.left < -0.5 || rect.right > window.innerWidth + 0.5).length,
        stageFirstRowAligned: Math.abs((stageButtons[0]?.top ?? 0) - (stageButtons[1]?.top ?? 1)) < 1,
        stageSecondRowBelow: (stageButtons[2]?.top ?? 0) > (stageButtons[0]?.top ?? 0),
        apiFirstRowAligned: Math.abs((apiButtons[0]?.top ?? 0) - (apiButtons[1]?.top ?? 1)) < 1,
        apiSecondRowBelow: (apiButtons[2]?.top ?? 0) > (apiButtons[0]?.top ?? 0),
        planClientWidth: plan?.clientWidth ?? 0,
        planScrollWidth: plan?.scrollWidth ?? 0,
        planTabIndex: plan?.tabIndex ?? -1,
        projectMapClientWidth: projectMap?.clientWidth ?? 0,
        projectMapScrollWidth: projectMap?.scrollWidth ?? 0,
      };
    });

    expect(geometry.documentWidth).toBe(geometry.viewport);
    expect(geometry.titleLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.titleRight).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.smallestTarget).toBeGreaterThanOrEqual(44);
    expect(geometry.overflowingTargets).toBe(0);
    expect(geometry.stageFirstRowAligned).toBe(true);
    expect(geometry.stageSecondRowBelow).toBe(true);
    expect(geometry.apiFirstRowAligned).toBe(true);
    expect(geometry.apiSecondRowBelow).toBe(true);
    expect(geometry.planScrollWidth).toBeGreaterThan(geometry.planClientWidth);
    expect(geometry.planTabIndex).toBe(0);
    expect(geometry.projectMapScrollWidth).toBeGreaterThan(geometry.projectMapClientWidth);

    const planLedger = page.getByRole('region', { name: /plan limits table/i });
    await planLedger.focus();
    await expect(planLedger).toBeFocused();
    const planScrollLeft = await planLedger.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
      return element.scrollLeft;
    });
    expect(planScrollLeft).toBeGreaterThan(0);

    const judge = page.getByRole('button', { name: /stage 07: judge/i });
    await judge.click();
    await expect(judge).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Selected Agent stage')).toContainText('Ready / revise');
    await expect(page.locator('.docs-field-chapter')).toHaveCount(7);

    expect(errors).toEqual([]);
  });
});
