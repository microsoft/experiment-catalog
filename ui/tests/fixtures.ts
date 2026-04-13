import { test as base, type Page } from '@playwright/test';
import * as data from './mocks/data';

/**
 * Register all default API route mocks on a page.
 *
 * Individual tests can override specific routes after calling this.
 */
export async function mockAllRoutes(page: Page) {
  // Auth
  await page.route('**/auth/status', (route) =>
    route.fulfill({ json: data.authNotRequired }),
  );

  // Projects
  await page.route('**/api/projects', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 200, body: 'OK' });
    }
    return route.fulfill({ json: data.projectsList });
  });

  // Experiments list (must come before the single-experiment pattern)
  await page.route(
    '**/api/projects/*/experiments',
    (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 200, body: 'OK' });
      }
      return route.fulfill({ json: data.experimentsList });
    },
  );

  // Single experiment
  await page.route('**/api/projects/*/experiments/*', (route) => {
    const url = route.request().url();
    // Skip sub-routes like /compare, /sets, /baseline, /results
    const afterExperiments = url.split('/experiments/')[1] ?? '';
    if (afterExperiments.includes('/')) {
      // Let more specific routes handle these
      return route.fallback();
    }
    return route.fulfill({ json: data.singleExperiment });
  });

  // Comparison (aggregate)
  await page.route('**/api/projects/*/experiments/*/compare?**', (route) =>
    route.fulfill({ json: data.comparison }),
  );
  await page.route('**/api/projects/*/experiments/*/compare', (route) =>
    route.fulfill({ json: data.comparison }),
  );

  // Compare by ref
  await page.route(
    '**/api/projects/*/experiments/*/sets/*/compare-by-ref**',
    (route) => route.fulfill({ json: data.comparisonByRef }),
  );

  // Set iterations
  await page.route('**/api/projects/*/experiments/*/sets/*', (route) => {
    const url = route.request().url();
    if (url.includes('compare-by-ref')) {
      return route.fallback();
    }
    // Let PATCH requests fall through to the baseline PATCH handler
    if (route.request().method() === 'PATCH') {
      return route.fallback();
    }
    // Return baseline iterations for the baseline set, otherwise set iterations
    const setName = url.split('/sets/')[1]?.split('?')[0]?.split('/')[0];
    if (setName === 'baseline') {
      return route.fulfill({ json: data.baselineIterations });
    }
    return route.fulfill({ json: data.setIterations });
  });

  // Baseline PATCH endpoints
  await page.route('**/api/projects/*/experiments/*/baseline', (route) => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({ status: 200, body: 'OK' });
    }
    return route.fallback();
  });
  await page.route(
    '**/api/projects/*/experiments/*/sets/*/baseline',
    (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({ status: 200, body: 'OK' });
      }
      return route.fallback();
    },
  );

  // Tags
  await page.route('**/api/projects/*/tags', (route) =>
    route.fulfill({ json: data.tagsList }),
  );

  // Analysis
  await page.route('**/api/analysis/statistics', (route) =>
    route.fulfill({ status: 200, body: 'OK' }),
  );
  await page.route('**/api/analysis/meaningful-tags', (route) =>
    route.fulfill({ json: data.meaningfulTagsResponse }),
  );

  // Add results (annotations)
  await page.route('**/api/projects/*/experiments/*/results', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 200, body: 'OK' });
    }
    return route.fallback();
  });
}

/**
 * Extended test fixture that automatically mocks all API routes.
 */
export const test = base.extend<{ mockedPage: Page }>({
  mockedPage: async ({ page }, use) => {
    await mockAllRoutes(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';
