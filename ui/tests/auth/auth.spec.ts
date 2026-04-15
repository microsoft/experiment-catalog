import { test, expect } from '../fixtures';
import * as data from '../mocks/data';

test.describe('Authentication gating', () => {
  test('shows login screen when auth is required', async ({ page }) => {
    // Override auth route to require authentication
    await page.route('**/auth/status', (route) =>
      route.fulfill({ json: data.authRequired }),
    );

    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'Authentication Required' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();

    // Projects heading should NOT be visible
    await expect(
      page.getByRole('heading', { name: 'Projects' }),
    ).not.toBeVisible();
  });

  test('proceeds to projects list when user is authenticated', async ({ page }) => {
    // Override auth route to return authenticated user
    await page.route('**/auth/status', (route) =>
      route.fulfill({ json: data.authAuthenticated }),
    );

    // Still need the projects route
    await page.route('**/api/projects', (route) =>
      route.fulfill({ json: data.projectsList }),
    );

    await page.goto('/');

    // Should see projects, not login
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Authentication Required' }),
    ).not.toBeVisible();
  });

  test('proceeds to projects list when auth is not required', async ({ mockedPage: page }) => {
    // The default mockedPage fixture sets auth as not required
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  });
});
