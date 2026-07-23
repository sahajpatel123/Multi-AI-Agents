import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e config.
 *
 * Tests assume the backend is running at http://localhost:8000 and the Vite
 * dev server (or built preview) at http://localhost:5173. CI starts both via
 * the GitHub Actions workflow before running tests.
 *
 * `reducedMotion: 'reduce'` opts every browser instance into the
 * `prefers-reduced-motion: reduce` media query, which the HomePage CSS
 * honours (`@media (prefers-reduced-motion:reduce) { .vp-reveal { opacity:1;
 * transform:none } }`). Without it, scroll-based reveal animations leave
 * .vp-reveal sections at opacity:0 in headless mode — Playwright then
 * times out `toBeVisible()` checks for sections that haven't scrolled
 * past the IntersectionObserver threshold.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], reducedMotion: 'reduce' },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});