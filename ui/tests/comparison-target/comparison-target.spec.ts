import { test, expect } from '../fixtures';
import * as data from '../mocks/data';

const target = { project: 'beta-project', experiment: 'exp-002', set: 'set-a' };

test.describe('Comparison target override', () => {
  test.beforeEach(async ({ mockedPage: page }) => {
    await page.route('**/api/projects/*/experiments/*/sets', (route) =>
      route.fulfill({ json: ['baseline', 'set-a', 'set-b'] }),
    );
    await page.route('**/api/projects/*/experiments/*/compare?**', (route) => {
      const params = new URL(route.request().url()).searchParams;
      if (!params.has('compare-project')) return route.fulfill({ json: data.comparison });
      return route.fulfill({
        json: {
          ...data.comparison,
          comparison_target: {
            ...target,
            result: {
              ...data.baselineResult,
              metrics: {
                ...data.baselineResult.metrics,
                accuracy: { ...data.baselineResult.metrics.accuracy, value: 0.5, normalized: 0.5 },
              },
            },
          },
          sets: data.comparison.sets.map((item) => ({
            ...item,
            result: {
              ...item.result,
              metrics: Object.fromEntries(
                Object.entries(item.result.metrics).map(([name, metric]) =>
                  [name, Object.fromEntries(Object.entries(metric).filter(([key]) => !['p_value', 'ci_lower', 'ci_upper'].includes(key)))],
                ),
              ),
            },
          })),
        },
      });
    });
    await page.route('**/api/projects/*/experiments/*/sets/*/compare-by-ref?**', (route) =>
      route.fulfill({
        json: {
          ...data.comparisonByRef,
          comparison_target: { ...target, results: { 'ref-1': data.baselineResult } },
        },
      }),
    );
    await page.goto('/?project=alpha-project&experiment=exp-001');
    await expect(page.locator('table')).toBeVisible();
  });

  test('modal warns for another project and selection persists in config', async ({ mockedPage: page }) => {
    const baselineHeader = page.locator('table thead th').filter({ hasText: 'Experiment Baseline' });
    await expect(baselineHeader).toHaveClass(/default-baseline/);
    await expect(baselineHeader).toHaveCSS('background-color', 'rgb(36, 51, 38)');
    await expect(baselineHeader).toHaveCSS('border-top-color', 'rgb(81, 140, 93)');
    await expect(baselineHeader.locator('.title')).toHaveCSS('color', 'rgb(184, 231, 189)');
    await expect(baselineHeader.getByRole('button', { name: 'select', exact: true }))
      .toHaveCSS('border-top-color', 'rgb(128, 201, 144)');
    await expect(page.getByText('Compare against', { exact: true })).toHaveCount(0);
    await expect(baselineHeader.getByText('set: baseline')).toBeVisible();
    await expect(baselineHeader.getByText(/^project:/)).toHaveCount(0);
    await expect(baselineHeader.getByText('experiment: exp-001')).toBeVisible();
    await expect(page.locator('table thead th').filter({ hasText: 'Project Baseline' })
      .getByText('experiment: exp-baseline')).toBeVisible();
    await baselineHeader.locator('.title').getByRole('button', { name: 'select', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Choose comparison target' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Project').selectOption(target.project);
    await expect(dialog.getByRole('alert')).toContainText('ground truth, metrics, and metric definitions may differ');
    await dialog.getByLabel('Experiment').selectOption(target.experiment);
    await dialog.getByLabel('Set').selectOption(target.set);

    const request = page.waitForRequest((req) =>
      req.url().includes('/compare?') && req.url().includes('compare-project=beta-project'));
    await dialog.getByRole('button', { name: 'Compare', exact: true }).click();
    const params = new URL((await request).url()).searchParams;
    expect(params.get('compare-experiment')).toBe(target.experiment);
    expect(params.get('compare-set')).toBe(target.set);
    await expect(page.locator('table').getByText('Comparison Target', { exact: true })).toBeVisible();
    await expect(page.locator('table').getByText('Experiment Baseline', { exact: true })).toHaveCount(0);
    const targetHeader = page.locator('table thead th').filter({ hasText: 'Comparison Target' });
    await expect(targetHeader).toHaveClass(/active-target/);
    await expect(targetHeader).toHaveCSS('background-color', 'rgb(48, 43, 31)');
    await expect(targetHeader).toHaveCSS('border-top-color', 'rgb(183, 133, 54)');
    await expect(targetHeader.locator('.title')).toHaveCSS('color', 'rgb(255, 210, 127)');
    await expect(targetHeader.getByRole('button', { name: 'reset', exact: true }))
      .toHaveCSS('border-top-color', 'rgb(229, 181, 94)');
    await expect(targetHeader.getByText('project: beta-project')).toBeVisible();
    await expect(targetHeader.getByText('experiment: exp-002')).toBeVisible();
    await expect(targetHeader.getByText('set: set-a')).toBeVisible();
    await expect(targetHeader.locator('.title').getByRole('button', { name: 'reset', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'select', exact: true })).toHaveCount(0);
    const accuracyRow = page.locator('table tbody tr').filter({ has: page.locator('td.label', { hasText: 'accuracy' }) });
    await expect(accuracyRow.locator('td').nth(4).locator('.diff')).toContainText('+0.370');
    await expect(accuracyRow.locator('td').nth(4)).toContainText('+74%');
    await expect(page.getByRole('button', { name: 'compute statistics' })).toBeDisabled();
    await expect(page.getByRole('alert').filter({ hasText: 'Cross-project comparison' })).toHaveCount(0);
    const config = JSON.parse(atob(new URL(page.url()).searchParams.get('config')!));
    expect(config.comparison_target).toEqual(target);
    await expect(page.locator('table .pvalue')).toHaveCount(0);
  });

  test('override carries into set and chart, then resets to original comparison', async ({ mockedPage: page }) => {
    const config = btoa(JSON.stringify({ comparison_target: target }));
    await page.goto(`/?project=alpha-project&experiment=exp-001&config=${config}`);
    await expect(page.locator('table').getByText('Comparison Target', { exact: true })).toBeVisible();

    const byRef = page.waitForRequest((req) => req.url().includes('compare-by-ref?'));
    await page.locator('table').getByRole('button', { name: 'set:' }).first().click();
    expect(new URL((await byRef).url()).searchParams.get('compare-project')).toBe(target.project);
    const status = page.locator('.comparison-override');
    await expect(status).toHaveAttribute('role', 'status');
    await expect(status).toContainText('Comparison override active');
    await expect(status).toContainText('Comparing against: beta-project / exp-002 / set-a');
    await expect(page.locator('.comparison-override + table')).toBeVisible();
    await expect(page.getByText('Comparison Target / set-a')).toHaveCount(1);
    await expect(page.getByText(/Experiment Baseline \//)).toHaveCount(0);
    await expect(page.getByRole('alert').filter({ hasText: 'Cross-project comparison' })).toHaveCount(0);
    const details = page.waitForRequest((req) =>
      req.url().includes('/api/projects/beta-project/experiments/exp-002/sets/set-a?metric-project=alpha-project'));
    await page.getByRole('button', { name: 'toggle comparison target iterations' }).click();
    await details;

    await page.getByRole('button', { name: /back/ }).first().click();
    await page.getByRole('button', { name: 'charts' }).click();
    await expect(page.getByText('Comparing against: beta-project / exp-002 / set-a')).toBeVisible();
    await expect(page.locator('.chart-container tspan').filter({ hasText: 'comparison-target' })).toBeVisible();
    await expect(page.locator('.chart-container tspan').filter({ hasText: 'experiment-baseli' })).toHaveCount(0);
    await expect(page.locator('.chart-container tspan[dy="0"]').filter({ hasText: /^baseline$/ })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Cross-project comparison' })).toHaveCount(0);
    await page.getByRole('button', { name: /back/ }).first().click();

    await page.locator('table thead th').filter({ hasText: 'Comparison Target' })
      .getByRole('button', { name: 'reset', exact: true }).click();
    await expect(page.locator('table').getByText('Comparison Target', { exact: true })).toHaveCount(0);
    await expect(page.locator('table').getByText('Experiment Baseline', { exact: true })).toBeVisible();
    await expect(page.locator('table thead th').filter({ hasText: 'Experiment Baseline' })
      .getByRole('button', { name: 'select', exact: true })).toBeVisible();
    await expect(page.locator('table .pvalue').first()).toBeVisible();
    const encoded = new URL(page.url()).searchParams.get('config');
    expect(encoded ? JSON.parse(atob(encoded)).comparison_target : undefined).toBeUndefined();
  });

  test('same-project selection has no cross-project warning', async ({ mockedPage: page }) => {
    await page.locator('table thead th').filter({ hasText: 'Experiment Baseline' })
      .getByRole('button', { name: 'select', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Choose comparison target' });
    await expect(dialog.getByLabel('Project')).toHaveValue('alpha-project');
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('shows the experiment even when the target comes from the current experiment', async ({ mockedPage: page }) => {
    const sameExperimentTarget = { project: 'alpha-project', experiment: 'exp-001', set: 'set-a' };
    await page.route('**/api/projects/*/experiments/*/compare?**', (route) =>
      route.fulfill({
        json: {
          ...data.comparison,
          comparison_target: { ...sameExperimentTarget, result: data.baselineResult },
        },
      }),
    );
    const config = btoa(JSON.stringify({ comparison_target: sameExperimentTarget }));
    await page.goto(`/?project=alpha-project&experiment=exp-001&config=${encodeURIComponent(config)}`);
    const header = page.locator('table thead th').filter({ hasText: 'Comparison Target' });
    await expect(header.getByText('experiment: exp-001')).toBeVisible();
    await expect(header.getByText(/^project:/)).toHaveCount(0);
    await expect(header.getByText('set: set-a')).toBeVisible();
  });

  test('meaningful tags baseline mode uses the selected target', async ({ mockedPage: page }) => {
    const config = btoa(JSON.stringify({ comparison_target: target }));
    await page.goto(`/?project=alpha-project&experiment=exp-001&config=${config}`);
    const request = page.waitForRequest((req) =>
      req.url().includes('/api/analysis/meaningful-tags') && req.method() === 'POST');
    await expect(page.locator('.meaningful-tags-row select').nth(2)).toContainText('Comparison Target');
    await page.getByRole('button', { name: 'compute', exact: true }).click();
    const body = (await request).postDataJSON();
    expect(body.comparison_target).toEqual(target);
  });

  test('hiding the project baseline leaves the comparison target visible', async ({ mockedPage: page }) => {
    const config = btoa(JSON.stringify({
      comparison_target: target,
      show_project_baseline: false,
      show_desc: true,
    }));
    await page.goto(`/?project=alpha-project&experiment=exp-001&config=${config}`);
    const table = page.locator('table');
    await expect(table.getByText('Project Baseline', { exact: true })).toHaveCount(0);
    await expect(table.getByText('Comparison Target', { exact: true })).toBeVisible();
    await expect(table.locator('.metric-description-row').first().locator('td.metric-description')).toHaveAttribute('colspan', '4');
  });

  test('invalid shared target displays an API error rather than an empty comparison', async ({ mockedPage: page }) => {
    await page.route('**/api/projects/*/experiments/*/compare?**', (route) =>
      route.fulfill({ status: 404, json: { error: 'Comparison target not found' } }),
    );
    const config = btoa(JSON.stringify({ comparison_target: target }));
    await page.goto(`/?project=alpha-project&experiment=exp-001&config=${config}`);
    await expect(page.getByText('Error loading comparison.')).toBeVisible();
    await page.getByRole('button', { name: 'reset', exact: true }).click();
    await expect(page.locator('table').getByText('Experiment Baseline', { exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('config')).toBeNull();
  });

  test('an API that ignores a shared target displays an error', async ({ mockedPage: page }) => {
    const config = btoa(JSON.stringify({ comparison_target: target }));
    await page.goto(`/?project=alpha-project&experiment=exp-001&page=set:set-a&config=${config}`);
    await expect(page.locator('table')).toBeVisible();
    await page.route('**/api/projects/*/experiments/*/sets/*/compare-by-ref?**', (route) =>
      route.fulfill({ json: data.comparisonByRef }),
    );
    await page.reload();
    await expect(page.getByText('Error loading data.')).toBeVisible();
  });

  test('override persists across experiment and project navigation until reset', async ({ mockedPage: page }) => {
    const savedTarget = () => {
      const encoded = new URL(page.url()).searchParams.get('config');
      return encoded ? JSON.parse(atob(encoded)).comparison_target : undefined;
    };
    const config = btoa(JSON.stringify({ comparison_target: target }));
    await page.goto(`/?project=alpha-project&experiment=exp-001&config=${config}`);
    await expect(page.getByRole('button', { name: 'reset', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /back/ }).first().click();
    expect(savedTarget()).toEqual(target);
    await page.reload();
    await page.locator('button.card').filter({ hasText: 'exp-002' }).click();
    await expect(page.locator('table thead th.active-target').getByText('Comparison Target')).toBeVisible();
    expect(savedTarget()).toEqual(target);
    await page.getByRole('button', { name: /back/ }).first().click();
    await page.getByRole('button', { name: /back/ }).first().click();
    expect(new URL(page.url()).searchParams.get('project')).toBeNull();
    expect(savedTarget()).toEqual(target);
    await page.reload();
    await page.getByRole('button', { name: 'gamma-project', exact: true }).click();
    expect(savedTarget()).toEqual(target);
    await page.locator('button.card').filter({ hasText: 'exp-001' }).click();
    await expect(page.locator('table thead th.active-target').getByText('Comparison Target')).toBeVisible();
    expect(savedTarget()).toEqual(target);
    await page.getByRole('button', { name: 'reset', exact: true }).click();
    await expect(page.locator('table thead th').getByText('Experiment Baseline')).toBeVisible();
    expect(savedTarget()).toBeUndefined();
  });

  test('an unmatched ref does not show a zero difference against a missing target', async ({ mockedPage: page }) => {
    await page.route('**/api/projects/*/experiments/*/sets/*/compare-by-ref?**', (route) =>
      route.fulfill({
        json: {
          ...data.comparisonByRef,
          comparison_target: { ...target, results: { 'ref-1': data.baselineResult } },
          experiment_set: {
            ...data.comparisonByRef.experiment_set,
            results: {
              ...data.comparisonByRef.experiment_set.results,
              'ref-2': { ...data.setAResult, ref: 'ref-2' },
            },
          },
        },
      }),
    );
    const config = btoa(JSON.stringify({ comparison_target: target }));
    await page.goto(`/?project=alpha-project&experiment=exp-001&page=set:set-a&config=${config}`);
    const row = page.locator('table tr.set-aggregate').filter({ has: page.getByText('ref-2', { exact: true }) });
    await expect(row).toBeVisible();
    await expect(row.locator('.diff')).toHaveCount(0);
  });
});
