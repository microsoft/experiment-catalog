import { test, expect } from '../fixtures';
import * as data from '../mocks/data';

/**
 * Visual snapshot tests for ComparisonTableMetric rendering.
 *
 * These tests capture visual regressions in metric value display,
 * including arrows, colors, formatting modes, and edge cases.
 *
 * Snapshots are stored in ./metric-snapshots.spec.ts-snapshots/.
 * Run `npx playwright test --update-snapshots` to update baselines.
 */
test.describe('Metric cell visual snapshots — experiment page', () => {
  test('standard metric cells (accuracy, latency, cost)', async ({ mockedPage: page }) => {
    await page.goto('/?project=alpha-project&experiment=exp-001');
    await expect(
      page.getByRole('heading', { name: /EXPERIMENT: exp-001/ }),
    ).toBeVisible();

    // Wait for the table to fully render
    const table = page.locator('table');
    await expect(table).toBeVisible();
    await expect(table.locator('td.label', { hasText: 'accuracy' })).toBeVisible();

    // Snapshot the full comparison table
    await expect(table).toHaveScreenshot('experiment-comparison-table.png', {
      maxDiffPixelRatio: 0.01,
    });
  });
});

test.describe('Metric cell visual snapshots — set page', () => {
  test('set page comparison-by-ref table', async ({ mockedPage: page }) => {
    await page.goto('/?project=alpha-project&experiment=exp-001&page=set:set-a');
    await expect(page.getByText('SET: set-a')).toBeVisible();

    const table = page.locator('table');
    await expect(table).toBeVisible();

    await expect(table).toHaveScreenshot('set-page-comparison-table.png', {
      maxDiffPixelRatio: 0.01,
    });
  });
});

test.describe('Metric cell visual snapshots — lower-is-better', () => {
  test('lower-is-better metrics show inverted arrow colors', async ({ mockedPage: page }) => {
    // Override comparison to add lower-is-better tag to latency
    await page.route('**/api/projects/*/experiments/*/compare?**', (route) =>
      route.fulfill({ json: lowerIsBetterComparison }),
    );
    await page.route('**/api/projects/*/experiments/*/compare', (route) =>
      route.fulfill({ json: lowerIsBetterComparison }),
    );

    await page.goto('/?project=alpha-project&experiment=exp-001');
    await expect(
      page.getByRole('heading', { name: /EXPERIMENT: exp-001/ }),
    ).toBeVisible();

    const table = page.locator('table');
    await expect(table).toBeVisible();
    await expect(table.locator('td.label', { hasText: 'latency' })).toBeVisible();

    await expect(table).toHaveScreenshot('lower-is-better-table.png', {
      maxDiffPixelRatio: 0.01,
    });
  });
});

test.describe('Metric cell visual snapshots — edge cases', () => {
  test('zero baseline produces infinity percentage', async ({ mockedPage: page }) => {
    // Override comparison with zero baseline metric
    await page.route('**/api/projects/*/experiments/*/compare?**', (route) =>
      route.fulfill({ json: zeroBaselineComparison }),
    );
    await page.route('**/api/projects/*/experiments/*/compare', (route) =>
      route.fulfill({ json: zeroBaselineComparison }),
    );

    await page.goto('/?project=alpha-project&experiment=exp-001');
    await expect(
      page.getByRole('heading', { name: /EXPERIMENT: exp-001/ }),
    ).toBeVisible();

    const table = page.locator('table');
    await expect(table).toBeVisible();

    await expect(table).toHaveScreenshot('zero-baseline-table.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('cost metric with small values shows >$0.00', async ({ mockedPage: page }) => {
    await page.route('**/api/projects/*/experiments/*/compare?**', (route) =>
      route.fulfill({ json: smallCostComparison }),
    );
    await page.route('**/api/projects/*/experiments/*/compare', (route) =>
      route.fulfill({ json: smallCostComparison }),
    );

    await page.goto('/?project=alpha-project&experiment=exp-001');
    await expect(
      page.getByRole('heading', { name: /EXPERIMENT: exp-001/ }),
    ).toBeVisible();

    const table = page.locator('table');
    await expect(table).toBeVisible();

    await expect(table).toHaveScreenshot('small-cost-table.png', {
      maxDiffPixelRatio: 0.01,
    });
  });
});

// ── Helper data ──────────────────────────────────────────────────────────

function makeMetric(
  value: number,
  count = 50,
  stdDev = 0.05,
  tags: string[] = [],
  extras: { p_value?: number; ci_lower?: number; ci_upper?: number } = {},
) {
  return {
    count,
    value,
    normalized: value,
    std_dev: stdDev,
    tags,
    ...extras,
  };
}

const lowerIsBetterDefinitions: Record<string, object> = {
  ...data.metricDefinitions,
  latency: {
    name: 'latency',
    min: 0,
    max: 10000,
    aggregate_function: 'Average',
    order: 2,
    tags: ['lower-is-better'],
  },
};

const lowerIsBetterComparison = {
  ...data.comparison,
  metric_definitions: lowerIsBetterDefinitions,
};

const zeroBaselineResult = {
  ...data.baselineResult,
  metrics: {
    accuracy: makeMetric(0),
    latency: makeMetric(0),
    cost: makeMetric(0),
  },
};

const zeroBaselineComparison = {
  ...data.comparison,
  experiment_baseline: {
    ...data.comparison.experiment_baseline,
    result: zeroBaselineResult,
  },
};

const smallCostResult = {
  ...data.baselineResult,
  metrics: {
    accuracy: makeMetric(0.82),
    latency: makeMetric(450),
    cost: makeMetric(0.001),
  },
};

const smallCostComparison = {
  ...data.comparison,
  experiment_baseline: {
    ...data.comparison.experiment_baseline,
    result: smallCostResult,
  },
  sets: [
    {
      ...data.comparison.sets[0],
      result: {
        ...data.setAResult,
        metrics: {
          accuracy: makeMetric(0.87),
          latency: makeMetric(380),
          cost: makeMetric(0.002),
        },
      },
    },
    data.comparison.sets[1],
  ],
};
