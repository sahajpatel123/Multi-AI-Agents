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
    await expect(page.locator('#method')).toBeVisible();
    await expect(page.locator('#audit')).toBeVisible();
    await expect(page.locator('#debate')).toBeVisible();
    await expect(page.locator('#minds')).toBeVisible();
    await expect(page.locator('#agent-mode')).toBeVisible();

    // Section-heading copy that survives any CSS refactor.
    await expect(
      page.getByRole('heading', { name: /a verdict you can inspect\./i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /the verdict has receipts\./i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /don't accept it\.\s*test it\./i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /build the spectrum\./i }),
    ).toBeVisible();
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
});

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}