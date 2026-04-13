import { test as base, expect, type Page } from '@playwright/test';
import * as data from '../mocks/data';

/**
 * Custom fixture for error tests — routes return failures.
 */
const test = base.extend<{ errorPage: Page }>({
  errorPage: async ({ page }, use) => {
    // Auth works fine
    await page.route('**/auth/status', (route) =>
      route.fulfill({ json: data.authNotRequired }),
    );
    await use(page);
  },
});

test.describe('Error states', () => {
  test('failed projects fetch shows error', async ({ errorPage: page }) => {
    await page.route('**/api/projects', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' }),
    );

    await page.goto('/');
    await expect(page.getByText('Error loading experiments.')).toBeVisible();
  });

  test('failed experiments fetch shows error', async ({ errorPage: page }) => {
    // Projects succeed
    await page.route('**/api/projects', (route) =>
      route.fulfill({ json: data.projectsList }),
    );
    // Experiments fail
    await page.route('**/api/projects/*/experiments', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' }),
    );

    await page.goto('/?project=alpha-project');
    await expect(page.getByText('Error loading experiments.')).toBeVisible();
  });

  test('failed comparison fetch shows error on experiment page', async ({
    errorPage: page,
  }) => {
    // Projects and experiments succeed
    await page.route('**/api/projects', (route) =>
      route.fulfill({ json: data.projectsList }),
    );
    await page.route('**/api/projects/*/experiments', (route) =>
      route.fulfill({ json: data.experimentsList }),
    );
    await page.route('**/api/projects/*/experiments/*', (route) => {
      const url = route.request().url();
      if (url.split('/experiments/')[1]?.includes('/')) return route.fallback();
      return route.fulfill({ json: data.singleExperiment });
    });
    await page.route('**/api/projects/*/tags', (route) =>
      route.fulfill({ json: data.tagsList }),
    );
    // Comparison fails
    await page.route('**/api/projects/*/experiments/*/compare?**', (route) =>
      route.fulfill({ status: 500, body: 'Server Error' }),
    );
    await page.route('**/api/projects/*/experiments/*/compare', (route) =>
      route.fulfill({ status: 500, body: 'Server Error' }),
    );

    await page.goto('/?project=alpha-project&experiment=exp-001');
    await expect(page.getByText('Error loading comparison.')).toBeVisible();
  });

  test('failed compare-by-ref shows error on SetPage', async ({ errorPage: page }) => {
    await page.route('**/api/projects', (route) =>
      route.fulfill({ json: data.projectsList }),
    );
    await page.route('**/api/projects/*/experiments', (route) =>
      route.fulfill({ json: data.experimentsList }),
    );
    await page.route('**/api/projects/*/experiments/*', (route) => {
      const url = route.request().url();
      if (url.split('/experiments/')[1]?.includes('/')) return route.fallback();
      return route.fulfill({ json: data.singleExperiment });
    });
    await page.route('**/api/projects/*/tags', (route) =>
      route.fulfill({ json: data.tagsList }),
    );
    // Compare-by-ref fails
    await page.route(
      '**/api/projects/*/experiments/*/sets/*/compare-by-ref**',
      (route) => route.fulfill({ status: 500, body: 'Server Error' }),
    );

    await page.goto('/?project=alpha-project&experiment=exp-001&page=set:set-a');
    await expect(page.getByText('Error loading data.')).toBeVisible();
  });
});
