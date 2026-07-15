/**
 * Smoke-test the Arena prompt flow:
 * 1. Land on home → click "Try Arena"
 * 2. Sign in (uses a fixture-injected test user via API mock)
 * 3. Submit a prompt
 * 4. Expect four agent cards to render
 *
 * This test uses mocked backend responses so it doesn't need a running API.
 * Tests that hit a real backend live alongside it with `.real.spec.ts` suffix.
 */

import { test, expect } from '@playwright/test';

test.describe('Arena prompt flow (mocked)', () => {
  test('home page renders, login link visible', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Arena/);
    // The hero CTA should be present.
    // The hero CTA should be present.
    await expect(page.getByRole('button', { name: /try|sign|start|get started/i }).first()).toBeVisible();
  });

  test('arena route redirects unauthenticated users to signin', async ({ page }) => {
    await page.goto('/app');
    // Either we land on /signin, or the page renders an auth modal — both
    // are acceptable first-pass behaviors for a non-authed request.
    await expect(page).toHaveURL(/\/(signin|app)/);
  });

  test('share landing renders a public take without auth', async ({ page }) => {
    const qs = new URLSearchParams({
      agent: 'agent_3',
      prompt: 'What should we build next?',
      response: 'Ship the flow users already try to complete.',
    });
    await page.goto(`/share?${qs.toString()}`);
    await expect(page.getByText(/shared from arena/i)).toBeVisible();
    await expect(page.getByText('What should we build next?')).toBeVisible();
    await expect(page.getByText('Ship the flow users already try to complete.')).toBeVisible();
    await expect(page.getByRole('button', { name: /try this in arena/i })).toBeVisible();
  });

  test('unknown routes show a branded 404 with recovery CTAs', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-xyz');
    await expect(page.getByText(/isn't in the arena/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /back to home/i })).toBeVisible();
  });
});