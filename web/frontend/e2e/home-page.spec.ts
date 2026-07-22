/**
 * Smoke-test the / landing page.
 * Pure presentational — no auth required.
 *
 * The Home page exposes the hero ("ASK ONCE. / THINK FOUR WAYS."),
 * a five-section narrative (method / audit / debate / minds /
 * agent-mode), the persona-library selector, and a closing CTA. Each
 * section has a stable anchor (`#method`, `#audit`, etc.) and the
 * hero CTA routes unauthenticated visitors through `/signin?tab=signup`
 * with the redirect intent set. We pin those anchors + headings so
 * accidental removal of any block surfaces in CI.
 *
 * Follows the cycle-118 / cycle-134 / cycle-135 / cycle-152 / cycle-153
 * pattern of light presentational smoke tests for public surfaces.
 */

import { expect, test } from '@playwright/test';

test.describe('Home page (mocked)', () => {
  test('renders the documented hero + five sections + closing CTA', async ({ page }) => {
    await page.goto('/');

    // Hero
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /ask once\.\s*think four ways\./i,
      }),
    ).toBeVisible();

    // Five narrative sections, all anchored by id so future link targets
    // remain stable regardless of BEM renames.
    // The body of HomePage scrolls each section in via IntersectionObserver
    // to drive a `vp-reveal` opacity transition — in headless browsers the
    // observer may not fire without a real scroll. scrollIntoViewIfNeeded
    // ensures the IO callback runs and the heading becomes visible.
    await page.locator('#method').scrollIntoViewIfNeeded();
    await expect(page.locator('#method')).toBeVisible();
    await page.locator('#audit').scrollIntoViewIfNeeded();
    await expect(page.locator('#audit')).toBeVisible();
    await page.locator('#debate').scrollIntoViewIfNeeded();
    await expect(page.locator('#debate')).toBeVisible();
    await page.locator('#minds').scrollIntoViewIfNeeded();
    await expect(page.locator('#minds')).toBeVisible();
    await page.locator('#agent-mode').scrollIntoViewIfNeeded();
    await expect(page.locator('#agent-mode')).toBeVisible();

    // Section-heading copy that survives any CSS refactor.
    await page
      .getByRole('heading', { name: /a verdict you can inspect\./i })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('heading', { name: /a verdict you can inspect\./i }),
    ).toBeVisible();
    await page
      .getByRole('heading', { name: /the verdict has receipts\./i })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('heading', { name: /the verdict has receipts\./i }),
    ).toBeVisible();
    await page
      .getByRole('heading', { name: /don't accept it\.\s*test it\./i })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('heading', { name: /don't accept it\.\s*test it\./i }),
    ).toBeVisible();
    await page
      .getByRole('heading', { name: /build the spectrum\./i })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('heading', { name: /build the spectrum\./i }),
    ).toBeVisible();
    await page
      .getByRole('heading', {
        name: /for questions that cannot end in one pass\./i,
      })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('heading', {
        name: /for questions that cannot end in one pass\./i,
      }),
    ).toBeVisible();

    // Closing CTA pitch is a `<small>` (not a heading) — pin by text.
    await expect(
      page.getByText(/3 runs free\s*·\s*no card required/i),
    ).toBeVisible();
  });

  test('hero CTA on an unauthenticated visit routes through sign-up', async ({ page }) => {
    await page.goto('/');

    // The hero "PUT A QUESTION IN" CTA fires `enterArena`, which routes
    // unauthenticated visitors to /signin?tab=signup with the redirect
    // intent preserved. The closing form's submit button is also wired
    // to the same handler; we click the hero button so this test isn't
    // coupled to form-internal CSS.
    await page.getByRole('button', { name: /put a question in/i }).click();
    await expect(page).toHaveURL(/\/signin\?tab=signup/);
  });

  test('persona library exposes the full 16-persona roster', async ({ page }) => {
    await page.goto('/');
    // The persona library lives inside #minds. Pin all 16 stable persona
    // names so future copy edits that drop or rename a persona surface
    // here. Names taken verbatim from HomePage.tsx's PERSONAS const.
    const expected = [
      'The Analyst',
      'The Philosopher',
      'The Pragmatist',
      'The Contrarian',
      'The Scientist',
      'The Historian',
      'The Economist',
      'The Ethicist',
      'The Stoic',
      'The Futurist',
      'The Strategist',
      'The Engineer',
      'The Optimist',
      'The Empath',
      'First Principles',
      "Devil's Advocate",
    ];
    const minds = page.locator('#minds');
    await expect(minds).toBeVisible();
    for (const name of expected) {
      await expect(
        minds.getByRole('button', { name: new RegExp(`^${escape(name)}$`, 'i') }),
      ).toBeVisible();
    }
  });

  test('live decision tape section pins the 8 product/scenario cards', async ({
    page,
  }) => {
    await page.goto('/');

    // The "LIVE DECISION TAPE / QUESTION TYPES" tape is a static
    // showcase section that renders 8 article cards (4 categories
    // × 2 groups). Pin both header strings + the card count so future
    // copy edits or refactors that drop a category surface here.
    const tape = page.locator('.vp-tape');
    await expect(tape).toBeVisible();
    await expect(tape.getByText(/live decision tape\s*\/\s*question types/i)).toBeVisible();
    await expect(tape.getByText(/four minds\s*→\s*one verdict/i)).toBeVisible();

    // The data structure is 4 categories (STRATEGY / CAREER / PRODUCT /
    // POLICY) duplicated across 2 groups, giving 8 articles total.
    expect(await tape.locator('article').count()).toBe(8);
  });

  test('closing CTA section pins the h2, form, and footer brand strings', async ({
    page,
  }) => {
    await page.goto('/');

    const close = page.locator('section.vp-close');
    await expect(close).toBeVisible();

    // h2 headline + form labels + footer marketing strings. Each is
    // user-visible brand copy that surfaces in the marketing-mark band
    // shared with /signin (cycle 170).
    await expect(
      close.getByRole('heading', { name: /what deserves more than one answer\?/i }),
    ).toBeVisible();
    await expect(close.getByLabel(/your question/i)).toBeVisible();
    await expect(close.getByRole('button', { name: /enter arena/i })).toBeVisible();

    // Footer strings — referenced from /signin too ("3 FREE RUNS").
    await expect(close).toContainText('3 RUNS FREE');
    await expect(close).toContainText('NO CARD REQUIRED');
    await expect(close).toContainText('ARENA © 2026');
    await expect(close).toContainText('MULTIPLE MINDS. ONE VERDICT.');
  });

  test('Agent Mode pipeline section pins the 7 research stages', async ({ page }) => {
    await page.goto('/');

    // The Agent Mode pipeline section is the last narrative block before
    // the closing CTA. It explains the 7-stage research pipeline that
    // /agent runs when one pass isn't enough. Pin:
    //   - section anchor (`#agent-mode`)
    //   - the section heading copy
    //   - exactly 7 stage names (verbatim from HomePage.tsx)
    //   - the CTA routes unauthenticated visitors through /signin
    const agentMode = page.locator('#agent-mode');
    await expect(agentMode).toBeVisible();
    await expect(
      agentMode.getByRole('heading', {
        name: /for questions that cannot end in one pass\./i,
      }),
    ).toBeVisible();

    // Stage names — pinned as visible text inside the pipeline grid.
    const stages = ['PLAN', 'RESEARCH', 'SOLVE', 'CRITIQUE', 'VERIFY', 'SYNTHESIZE', 'JUDGE'];
    for (const stage of stages) {
      await expect(agentMode.getByRole('heading', { name: stage })).toBeVisible();
    }

    // CTA → /signin?tab=signup (unauthenticated).
    await agentMode.getByRole('button', { name: /run an investigation/i }).click();
    await expect(page).toHaveURL(/\/signin\?tab=signup/);
  });

  test('method section pins the 3 inner promise cards', async ({ page }) => {
    await page.goto('/');

    // The method section (#method) has a sub-grid `.vp-three` with 3
    // promise cards that describe the product's core guarantees.
    // Pin the h3 copy so a future copy edit surfaces in CI.
    const method = page.locator('#method');
    const promises = method.locator('.vp-three article');
    expect(await promises.count()).toBe(3);

    await expect(
      promises.nth(0).getByRole('heading', { name: /difference is designed\./i }),
    ).toBeVisible();
    await expect(
      promises.nth(1).getByRole('heading', { name: /the score is visible\./i }),
    ).toBeVisible();
    await expect(
      promises.nth(2).getByRole('heading', { name: /the winner is not the end\./i }),
    ).toBeVisible();
  });
});

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}