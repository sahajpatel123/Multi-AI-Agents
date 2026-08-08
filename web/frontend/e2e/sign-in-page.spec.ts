/**
 * Smoke-test the /signin auth portal.
 * Pure presentational — no backend hits.
 *
 * The auth portal exposes two tabbed forms:
 *   - Sign-in tab (default): email + password → "Sign in to Arena"
 *   - Sign-up tab (?tab=signup): name + email + password + confirm
 *     → "Create free account"
 *
 * Each form has a headline + sub-headline, the "Next: <destination>"
 * line driven by `getRedirectIntent()`, and a tablist with
 * aria-selected mirroring the active form. We pin tab count,
 * headline strings, CTA text, and field counts so accidental
 * removal of any form field surfaces in CI.
 *
 * Follows the cycle-118 / cycle-134 / cycle-135 / cycle-152 /
 * cycle-153 / cycle-158 / cycle-159 pattern of light
 * presentational smoke tests for public surfaces.
 */

import { expect, test } from '@playwright/test';

test.describe('Sign-in page (mocked)', () => {
  test('render the sign-in tab by default with documented fields and CTA', async ({
    page,
  }) => {
    await page.goto('/signin');

    // Tablist with two tabs.
    const tablist = page.getByRole('tablist', { name: 'Auth mode' });
    await expect(tablist).toBeVisible();
    await expect(tablist.getByRole('tab', { name: 'Sign in' })).toBeVisible();
    await expect(tablist.getByRole('tab', { name: 'Sign up' })).toBeVisible();

    // Default tab is "Sign in" — `aria-selected="true"` on the Sign-in tab.
    await expect(tablist.getByRole('tab', { name: 'Sign in' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(tablist.getByRole('tab', { name: 'Sign up' })).toHaveAttribute(
      'aria-selected',
      'false',
    );

    // Page headline + form heading — pinned strings, not selectors.
    await expect(page.getByText(/Return to\s*the room\./i)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Sign in', level: 2 }),
    ).toBeVisible();

    // Sign-in form has exactly 2 fields (email + password). Match by
    // <label>↔<input> link via `htmlFor`/`id` so this stays stable
    // across BEM renames.
    const signinForm = page.locator('form.auth-page__form--signin');
    await expect(signinForm).toBeVisible();
    await expect(signinForm.locator('input#signin-email')).toHaveCount(1);
    await expect(signinForm.locator('input#signin-password')).toHaveCount(1);

    // CTA copy.
    await expect(
      signinForm.getByRole('button', { name: /sign in to arena/i }),
    ).toBeVisible();

    // Cross-tab link copy inside the sign-in form.
    await expect(
      signinForm.getByRole('button', { name: /create an account/i }),
    ).toBeVisible();

    // Footer band — the "3 free runs" + copyright line is the visible
    // public assertion that this is the marketing/auth-portal surface.
    await expect(page.locator('footer.auth-page__footer')).toContainText(
      '3 FREE RUNS',
    );
  });

  test('?tab=signup switches to the sign-up tab with the four-field form', async ({
    page,
  }) => {
    await page.goto('/signin?tab=signup');

    // Tab selection flipped.
    const tablist = page.getByRole('tablist', { name: 'Auth mode' });
    await expect(tablist.getByRole('tab', { name: 'Sign up' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(tablist.getByRole('tab', { name: 'Sign in' })).toHaveAttribute(
      'aria-selected',
      'false',
    );

    // Sign-up headline + form heading.
    await expect(page.getByText(/Make room for\s*better answers\./i)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Create your panel', level: 2 }),
    ).toBeVisible();

    // Sign-up form has 4 fields: name + email + password + confirm.
    const signupForm = page.locator('form.auth-page__form--signup');
    await expect(signupForm).toBeVisible();
    await expect(signupForm.locator('input#signup-name')).toHaveCount(1);
    await expect(signupForm.locator('input#signup-email')).toHaveCount(1);
    await expect(signupForm.locator('input#signup-password')).toHaveCount(1);
    await expect(signupForm.locator('input#signup-confirm')).toHaveCount(1);

    // Sign-up hint about password length.
    await expect(signupForm.getByText(/use at least 8 characters/i)).toBeVisible();

    // CTA copy.
    await expect(
      signupForm.getByRole('button', { name: /create free account/i }),
    ).toBeVisible();

    // Cross-tab link copy inside the sign-up form.
    await expect(
      signupForm.getByRole('button', { name: /^sign in$/i }),
    ).toBeVisible();
  });

  test('clicking the Sign up tab flips the active tab and shows the signup form', async ({
    page,
  }) => {
    await page.goto('/signin');

    await page.getByRole('tab', { name: 'Sign up' }).click();
    // Tab selection flipped via click — same assertions as the
    // ?tab=signup direct-link case.
    const tablist = page.getByRole('tablist', { name: 'Auth mode' });
    await expect(tablist.getByRole('tab', { name: 'Sign up' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Form swap happened — sign-up CTA visible, sign-in form gone.
    await expect(
      page.getByRole('button', { name: /create free account/i }),
    ).toBeVisible();
    await expect(page.locator('form.auth-page__form--signin')).toHaveCount(0);
  });

  test('clicking the Sign in tab from sign-up restores the sign-in form', async ({
    page,
  }) => {
    await page.goto('/signin?tab=signup');

    // Start on the sign-up tab (verified by cycle 166's earlier test).
    const tablist = page.getByRole('tablist', { name: 'Auth mode' });
    await expect(tablist.getByRole('tab', { name: 'Sign up' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Click "Sign in" — tab flips back, sign-up form removed, sign-in
    // form restored with its CTA + 2 fields. Closes the round-trip
    // started by the previous test.
    await tablist.getByRole('tab', { name: 'Sign in' }).click();
    await expect(tablist.getByRole('tab', { name: 'Sign in' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(tablist.getByRole('tab', { name: 'Sign up' })).toHaveAttribute(
      'aria-selected',
      'false',
    );

    await expect(page.locator('form.auth-page__form--signup')).toHaveCount(0);
    const signinForm = page.locator('form.auth-page__form--signin');
    await expect(signinForm).toBeVisible();
    await expect(signinForm.locator('input#signin-email')).toHaveCount(1);
    await expect(signinForm.locator('input#signin-password')).toHaveCount(1);
    await expect(
      signinForm.getByRole('button', { name: /sign in to arena/i }),
    ).toBeVisible();
  });

  test('password reveal toggle flips input type + aria-label on the sign-in form', async ({
    page,
  }) => {
    await page.goto('/signin');

    // Initial state: password input is type="password", reveal button
    // announces "Show password" (so screen readers know what the
    // affordance does).
    const passwordInput = page.locator('input#signin-password');
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await expect(
      page.getByRole('button', { name: 'Show password' }),
    ).toBeVisible();

    // Click reveal — input type flips to text so the user can see what
    // they're typing; button label flips to "Hide password" to reflect
    // the new affordance.
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await expect(
      page.getByRole('button', { name: 'Hide password' }),
    ).toBeVisible();

    // Click again — toggles back. Pin the round-trip so a regression
    // that broke toggle state surfaces here.
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await expect(
      page.getByRole('button', { name: 'Show password' }),
    ).toBeVisible();
  });

  test('auth footer band pins the four marketing-mark strings', async ({ page }) => {
    await page.goto('/signin');

    // The footer is a 4-cell marketing band that repeats on both sign-in
    // and sign-up tabs (it lives outside the form columns). Pin all
    // four strings — they are user-visible contracts (the "3 FREE RUNS"
    // cell in particular is referenced from /pricing copy).
    const footer = page.locator('footer.auth-page__footer');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('PRIVATE BY DEFAULT');
    await expect(footer).toContainText('SAVED CONTEXT');
    await expect(footer).toContainText('3 FREE RUNS');
    await expect(footer).toContainText('ARENA © 2026');

    // Switching tabs doesn't unmount the footer (it's outside both
    // form columns) — verify the strings are still pinned from the
    // sign-up state too.
    await page.getByRole('tab', { name: 'Sign up' }).click();
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('PRIVATE BY DEFAULT');
    await expect(footer).toContainText('3 FREE RUNS');
  });

  test('renders the redirect-intent destination line in both forms', async ({
    page,
  }) => {
    await page.goto('/signin');

    // The "Next: <destination>" line is read from getRedirectIntent()
    // on mount and shown in both forms. With no intent set, the
    // default is /app → "Arena" label.
    //
    // Pin: in the sign-in form, the line reads "Next: Arena".
    // This is the user-visible reassurance that "after sign-in,
    // you'll land on X".
    const signinForm = page.locator('form.auth-page__form--signin');
    await expect(signinForm.getByText(/Next:/i)).toBeVisible();
    await expect(signinForm.getByText(/^Arena$/)).toBeVisible();

    // The same line is rendered in the sign-up form (the marketing
    // pitch is consistent across both — "after you sign up, you'll
    // land on X").
    await page.getByRole('tab', { name: 'Sign up' }).click();
    const signupForm = page.locator('form.auth-page__form--signup');
    await expect(signupForm.getByText(/First stop:/i)).toBeVisible();
    await expect(signupForm.getByText(/^Arena$/)).toBeVisible();
  });

  test('renders the form-index eyebrow + label in both forms', async ({ page }) => {
    await page.goto('/signin');

    // Each form has an "ACCESS / NN" eyebrow with a "STAGE NAME" label.
    // Pin both pairs:
    //   - sign-in: "ACCESS / 01" + "IDENTITY CHECK"
    //   - sign-up: "ACCESS / 02" + "CREATE YOUR PANEL"
    const signinForm = page.locator('form.auth-page__form--signin');
    await expect(signinForm.getByText(/ACCESS\s*\/\s*01/i)).toBeVisible();
    await expect(signinForm.getByText(/IDENTITY CHECK/i)).toBeVisible();

    await page.getByRole('tab', { name: 'Sign up' }).click();
    const signupForm = page.locator('form.auth-page__form--signup');
    await expect(signupForm.getByText(/ACCESS\s*\/\s*02/i)).toBeVisible();
    await expect(signupForm.getByText(/CREATE YOUR PANEL/i)).toBeVisible();
  });
});