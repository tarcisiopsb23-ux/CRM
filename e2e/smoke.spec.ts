import { test, expect } from '@playwright/test';

test('App loads without console errors', async ({ page }) => {
  // Listen for console errors
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Also listen for uncaught exceptions
  const pageErrors: Error[] = [];
  page.on('pageerror', exception => {
    pageErrors.push(exception);
  });

  // Navigate to the app
  await page.goto('/');

  // Check if we are redirected to login or dashboard
  // Assuming login page has an input for email or a button
  // Or check title
  await expect(page).toHaveTitle(/Maestr\.IA|Login/);

  // Wait a bit for potential async errors
  await page.waitForTimeout(1000);

  // Fail if there were errors
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
