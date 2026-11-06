import type { Route } from '@playwright/test';
import { test, expect } from '../fixtures';
import * as data from '../mocks/data';

for (const byRef of [false, true]) {
  for (const failure of ['http', 'network']) {
    test(`${byRef ? 'compare-by-ref' : 'compare'} retains defaults and comparison data after ${failure} link failures`, async ({ mockedPage: page }) => {
      await page.route('**/api/settings', (route) => route.fulfill({
        json: { custom_links: [
          { scope: byRef ? 'set' : 'experiment', name: 'default report', url: 'https://tools.example/report?baseline={baseline-set}' },
        ] },
      }));
      await page.route('**/api/projects/*/links', (route) =>
        failure === 'http'
          ? route.fulfill({ status: 500, body: 'Link metadata unavailable' })
          : route.abort('failed'));
      await page.goto(`/?project=alpha-project&experiment=exp-001${byRef ? '&page=set:set-a' : ''}`);
      await expect(page.locator('table')).toBeVisible();
      await expect(page.getByRole('link', { name: 'default report', exact: true }))
        .toHaveAttribute('href', 'https://tools.example/report?baseline=baseline');
      await expect(page.getByText('Error loading comparison.', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Error loading data.', { exact: true })).toHaveCount(0);
    });
  }
}

for (const scenario of ['table reload', 'table destruction', 'set reload']) {
  test(`ignores stale link completions after ${scenario}`, async ({ mockedPage: page }) => {
    const byRef = scenario === 'set reload';
    const definitions = [
      { scope: byRef ? 'set' : 'experiment', name: 'report', url: 'https://tools.example/report?baseline={baseline-set}' },
    ];
    let baselineSet = 'initial';
    let linkRequests = 0;
    let announceStale!: (route: Route) => void;
    const stalePending = new Promise<Route>((resolve) => { announceStale = resolve; });
    await page.route('**/api/projects/*/links', (route) => {
      if (++linkRequests === 2) {
        announceStale(route);
        return;
      }
      return route.fulfill({ json: definitions });
    });
    await page.route(
      byRef
        ? '**/api/projects/*/experiments/*/sets/*/compare-by-ref**'
        : '**/api/projects/*/experiments/*/compare**',
      (route) => {
        const comparison = byRef ? data.comparisonByRef : data.comparison;
        return route.fulfill({
          json: {
            ...comparison,
            experiment_baseline: { ...comparison.experiment_baseline, set: baselineSet },
          },
        });
      },
    );
    await page.goto(`/?project=alpha-project&experiment=exp-001${byRef ? '&page=set:set-a' : ''}`);
    const report = page.getByRole('link', { name: 'report', exact: true });
    await expect(report).toHaveAttribute('href', 'https://tools.example/report?baseline=initial');
    const reload = page.getByRole('button', {
      name: byRef ? 'set this permutation as the experiment baseline' : 'use the project baseline',
      exact: true,
    });

    baselineSet = 'stale';
    await reload.click();
    const staleRoute = await stalePending;
    baselineSet = 'current';
    if (scenario === 'table destruction') {
      await page.getByLabel('Ref filter set', { exact: true }).selectOption('set-a');
      await page.getByLabel('Ref filter metric', { exact: true }).selectOption('accuracy');
      await page.getByRole('button', { name: 'Apply ref filter', exact: true }).click();
    } else {
      await reload.click();
    }
    await expect(report).toHaveAttribute('href', 'https://tools.example/report?baseline=current');

    const staleResponse = page.waitForResponse((response) => response.request() === staleRoute.request());
    await staleRoute.fulfill({ json: definitions });
    await (await staleResponse).finished();
    await page.evaluate(() => new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(report).toHaveAttribute('href', 'https://tools.example/report?baseline=current');
    await expect(page.locator('table')).toBeVisible();
  });
}
