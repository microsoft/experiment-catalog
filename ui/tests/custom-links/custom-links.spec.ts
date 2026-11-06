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

for (const byRef of [false, true]) {
  test(`${byRef ? 'compare-by-ref' : 'compare'} renders while link metadata is pending and loads it only once`, async ({ mockedPage: page }) => {
    let linkRequests = 0;
    let announcePending!: (route: Route) => void;
    const pending = new Promise<Route>((resolve) => { announcePending = resolve; });
    const scope = byRef ? 'set' : 'experiment';
    await page.route('**/api/settings', (route) => route.fulfill({
      json: { custom_links: [{ scope, name: 'report', url: 'https://default.example/{baseline-set}' }] },
    }));
    await page.route('**/api/projects/*/links', (route) => {
      linkRequests++;
      announcePending(route);
    });
    await page.goto(`/?project=alpha-project&experiment=exp-001${byRef ? '&page=set:set-a' : ''}`);
    const heldRoute = await pending;
    const report = page.getByRole('link', { name: 'report', exact: true });
    await expect(page.locator('table')).toBeVisible();
    await expect(report).toHaveAttribute('href', 'https://default.example/baseline');
    const reload = page.getByRole('button', {
      name: byRef ? 'set this permutation as the experiment baseline' : 'use the project baseline',
      exact: true,
    });
    await reload.click();
    await expect(page.locator('table')).toBeVisible();
    await expect(report).toHaveAttribute('href', 'https://default.example/baseline');
    expect(linkRequests).toBe(1);
    await heldRoute.fulfill({
      json: [{ scope, name: 'report', url: 'https://project.example/{baseline-set}' }],
    });
    await expect(report).toHaveAttribute('href', 'https://project.example/baseline');
    await reload.click();
    await expect(page.locator('table')).toBeVisible();
    await expect(report).toHaveAttribute('href', 'https://project.example/baseline');
    expect(linkRequests).toBe(1);
  });
}

for (const change of ['select', 'reset']) {
  test(`clears baseline links while ${change === 'select' ? 'selecting' : 'resetting'} a target, including failed comparisons`, async ({ mockedPage: page }) => {
    let hold = false;
    let fail = false;
    const heldRoutes: Route[] = [];
    let announcePending!: (route: Route) => void;
    const pending = new Promise<Route>((resolve) => { announcePending = resolve; });
    await page.route('**/api/projects/*/links', (route) => route.fulfill({
      json: [{ scope: 'experiment', name: 'report', url: 'https://tools.example/{baseline-set}' }],
    }));
    const target = { project: 'alpha-project', experiment: 'exp-001', set: 'set-b' };
    await page.route('**/api/projects/*/experiments/*/compare**', (route) => {
      if (fail) return route.fulfill({ status: 500, body: 'Comparison unavailable' });
      if (hold) {
        heldRoutes.push(route);
        announcePending(route);
        return;
      }
      const overridden = new URL(route.request().url()).searchParams.has('compare-project');
      return route.fulfill({
        json: {
          ...data.comparison,
          ...(overridden ? { comparison_target: { ...target, result: data.setBResult } } : {}),
        },
      });
    });
    const config = change === 'reset' ? `&config=${btoa(JSON.stringify({ comparison_target: target }))}` : '';
    await page.goto(`/?project=alpha-project&experiment=exp-001${config}`);
    const report = page.getByRole('link', { name: 'report', exact: true });
    await expect(report).toHaveAttribute('href', `https://tools.example/${change === 'reset' ? 'set-b' : 'baseline'}`);
    if (change === 'select') {
      await page.locator('th.default-baseline').getByRole('button', { name: 'select', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Choose comparison target' });
      await expect(dialog.getByRole('button', { name: 'Compare', exact: true })).toBeEnabled();
      hold = true;
      await dialog.getByRole('button', { name: 'Compare', exact: true }).click();
    } else {
      hold = true;
      await page.locator('th.active-target').getByRole('button', { name: 'reset', exact: true }).click();
    }
    await pending;
    await expect(report).toHaveCount(0);
    fail = true;
    await Promise.all(heldRoutes.map((route) =>
      route.fulfill({ status: 500, body: 'Comparison unavailable' })));
    await expect(page.getByText('Error loading comparison.', { exact: true })).toBeVisible();
    await expect(report).toHaveCount(0);
  });
}

test('clears set baseline links during a failed comparison reload', async ({ mockedPage: page }) => {
  await page.route('**/api/projects/*/links', (route) => route.fulfill({
    json: [{ scope: 'set', name: 'report', url: 'https://tools.example/{baseline-set}' }],
  }));
  await page.goto('/?project=alpha-project&experiment=exp-001&page=set:set-a');
  const report = page.getByRole('link', { name: 'report', exact: true });
  await expect(report).toHaveAttribute('href', 'https://tools.example/baseline');
  let announcePending!: (route: Route) => void;
  const pending = new Promise<Route>((resolve) => { announcePending = resolve; });
  await page.route('**/api/projects/*/experiments/*/sets/*/compare-by-ref**', announcePending);
  await page.getByRole('button', { name: 'set this permutation as the experiment baseline', exact: true }).click();
  const heldRoute = await pending;
  await expect(report).toHaveCount(0);
  await heldRoute.fulfill({ status: 500, body: 'Comparison unavailable' });
  await expect(page.getByText('Error loading data.', { exact: true })).toBeVisible();
  await expect(report).toHaveCount(0);
});

for (const scenario of ['table reload', 'table destruction', 'set reload']) {
  test(`ignores stale comparison completions after ${scenario}`, async ({ mockedPage: page }) => {
    const byRef = scenario === 'set reload';
    const definitions = [
      { scope: byRef ? 'set' : 'experiment', name: 'report', url: 'https://tools.example/report?baseline={baseline-set}' },
    ];
    let baselineSet = 'initial';
    let linkRequests = 0;
    let announceStale!: (route: Route) => void;
    let staleCaptured = false;
    const stalePending = new Promise<Route>((resolve) => { announceStale = resolve; });
    await page.route('**/api/projects/*/links', (route) => {
      linkRequests++;
      return route.fulfill({ json: definitions });
    });
    await page.route(
      byRef
        ? '**/api/projects/*/experiments/*/sets/*/compare-by-ref**'
        : '**/api/projects/*/experiments/*/compare**',
      (route) => {
        if (baselineSet === 'stale' && !staleCaptured) {
          staleCaptured = true;
          announceStale(route);
          return;
        }
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
    const comparison = byRef ? data.comparisonByRef : data.comparison;
    await staleRoute.fulfill({
      json: { ...comparison, experiment_baseline: { ...comparison.experiment_baseline, set: 'stale' } },
    });
    await (await staleResponse).finished();
    await page.evaluate(() => new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(report).toHaveAttribute('href', 'https://tools.example/report?baseline=current');
    await expect(page.locator('table')).toBeVisible();
    expect(linkRequests).toBe(1);
  });
}
