import { test, expect } from '../fixtures';
import * as data from '../mocks/data';

/**
 * Chart page (distribution chart) tests.
 *
 * The chart page is accessed via ?project=...&experiment=...&page=chart.
 * It fetches comparison data, the set list, and results for each set,
 * then renders a distribution chart with beeswarm + box-plot layers.
 */

// Helper: generate multiple results for a set with diverse metric values
function makeResults(
  setName: string,
  values: number[],
  annotations: Array<{ text?: string; uri?: string }> = [],
) {
  return values.map((v, i) => ({
    ref: `ref-${i}`,
    set: setName,
    ground_truth_uri: null,
    inference_uri: null,
    evaluation_uri: null,
    desc: `${setName} result ${i}`,
    is_baseline: false,
    created: '2026-01-20T09:00:00Z',
    runtime: 100,
    metrics: {
      accuracy: { count: 1, value: v, normalized: v, std_dev: 0, tags: [] },
      latency: { count: 1, value: v * 500, normalized: v * 500, std_dev: 0, tags: [] },
    },
    annotations: i === 0 ? annotations : [],
  }));
}

const setsList = ['set-a', 'set-b'];

const setAResults = makeResults('set-a', [0.8, 0.85, 0.9, 0.75, 0.88], [
  { text: 'model: gpt-4o' },
  { text: 'run day: Tue' },
]);

const setBResults = makeResults('set-b', [0.7, 0.72, 0.68, 0.74, 0.71], []);

const baselineResults = makeResults('baseline', [0.6, 0.62, 0.58, 0.65, 0.61], [
  { text: 'baseline config' },
]);

/**
 * Register chart-specific route mocks that supplement the default fixture mocks.
 */
async function mockChartRoutes(page: import('@playwright/test').Page) {
  // Sets list endpoint (not covered by default fixtures)
  await page.route('**/api/projects/*/experiments/*/sets', (route) => {
    const url = route.request().url();
    // Only handle the exact sets-list call (no trailing path segment)
    if (url.endsWith('/sets') || url.includes('/sets?')) {
      return route.fulfill({ json: setsList });
    }
    return route.fallback();
  });

  // Override set results to return rich data with annotations
  await page.route('**/api/projects/*/experiments/*/sets/*', (route) => {
    const url = route.request().url();
    if (url.includes('compare-by-ref')) return route.fallback();
    if (route.request().method() === 'PATCH') return route.fallback();

    const setName = url.split('/sets/')[1]?.split('?')[0]?.split('/')[0];
    if (setName === 'set-a') return route.fulfill({ json: setAResults });
    if (setName === 'set-b') return route.fulfill({ json: setBResults });
    if (setName === 'baseline') return route.fulfill({ json: baselineResults });
    return route.fulfill({ json: [] });
  });
}

test.describe('Chart page', () => {
  const chartUrl = '/?project=alpha-project&experiment=exp-001&page=chart';

  test.beforeEach(async ({ mockedPage: page }) => {
    await mockChartRoutes(page);
    await page.goto(chartUrl);
    // Wait for chart to load
    await expect(page.locator('.chart-container')).toBeVisible();
  });

  // ── Layout & Controls ─────────────────────────────────────────────────────

  test('displays project and experiment headings', async ({ mockedPage: page }) => {
    await expect(
      page.getByRole('heading', { name: /PROJECT: alpha-project/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /EXPERIMENT: exp-001/ }),
    ).toBeVisible();
  });

  test('shows back button', async ({ mockedPage: page }) => {
    await expect(page.locator('button.btn', { hasText: '←' })).toBeVisible();
  });

  test('chart type selector defaults to distribution', async ({ mockedPage: page }) => {
    const select = page.locator('#chart-select');
    await expect(select).toHaveValue('distribution');
  });

  test('metric selector is populated with available metrics', async ({ mockedPage: page }) => {
    const select = page.locator('#metric-select');
    await expect(select).toBeVisible();

    // Should contain both metrics from our mock data
    const options = select.locator('option');
    const texts = await options.allTextContents();
    expect(texts).toContain('accuracy');
    expect(texts).toContain('latency');
  });

  test('metric selector defaults to first metric alphabetically', async ({ mockedPage: page }) => {
    const select = page.locator('#metric-select');
    await expect(select).toHaveValue('accuracy');
  });

  // ── Chart Rendering ───────────────────────────────────────────────────────

  test('renders SVG chart with data', async ({ mockedPage: page }) => {
    const svg = page.locator('.chart-container svg');
    await expect(svg).toBeVisible();
  });

  test('renders x-axis labels for each group', async ({ mockedPage: page }) => {
    const svg = page.locator('.chart-container svg');

    // Mock has different project/experiment baselines so they show separately
    await expect(svg.locator('text', { hasText: 'project-baseline' })).toBeVisible();
    await expect(svg.locator('text', { hasText: 'experiment-baseline' })).toBeVisible();
    await expect(svg.locator('text', { hasText: 'set-a' })).toBeVisible();
    await expect(svg.locator('text', { hasText: 'set-b' })).toBeVisible();
  });

  test('renders "Permutations" x-axis label', async ({ mockedPage: page }) => {
    await expect(page.locator('.x-label', { hasText: 'Permutations' })).toBeVisible();
  });

  test('renders y-axis with numeric ticks', async ({ mockedPage: page }) => {
    const svg = page.locator('.chart-container svg');
    // Y-axis should have at least one numeric tick
    const yTicks = svg.locator('text').filter({ hasText: /^\d+(\.\d+)?$/ });
    expect(await yTicks.count()).toBeGreaterThan(0);
  });

  // ── Annotations ───────────────────────────────────────────────────────────

  test('renders annotations below x-axis labels', async ({ mockedPage: page }) => {
    const svg = page.locator('.chart-container svg');

    // set-a has annotations: "model: gpt-4o" and "run day: Tue"
    await expect(svg.locator('tspan', { hasText: 'model: gpt-4o' })).toBeVisible();
    await expect(svg.locator('tspan', { hasText: 'run day: Tue' })).toBeVisible();
  });

  test('renders multiple annotations on separate lines', async ({ mockedPage: page }) => {
    const svg = page.locator('.chart-container svg');

    // Both annotations for set-a should be tspan elements with dy for line spacing
    const annotationTspans = svg.locator('tspan[font-size="11"]');
    // set-a has 2 annotations, project-baseline has 1, experiment-baseline has 1 = 4 total
    expect(await annotationTspans.count()).toBe(4);
  });

  test('baseline annotations are rendered', async ({ mockedPage: page }) => {
    const svg = page.locator('.chart-container svg');
    await expect(svg.locator('tspan', { hasText: 'baseline config' }).first()).toBeVisible();
  });

  test('sets without annotations show only the label', async ({ mockedPage: page }) => {
    const svg = page.locator('.chart-container svg');

    // set-b has no annotations — find its text element and verify no annotation tspans
    const setBText = svg.locator('text', { hasText: 'set-b' });
    await expect(setBText).toBeVisible();
    const annotationTspans = setBText.locator('tspan[font-size="11"]');
    expect(await annotationTspans.count()).toBe(0);
  });

  // ── Metric Switching ──────────────────────────────────────────────────────

  test('switching metric updates chart data', async ({ mockedPage: page }) => {
    const svg = page.locator('.chart-container svg');

    // Switch to latency
    await page.locator('#metric-select').selectOption('latency');

    // Chart should still be visible with data
    await expect(svg).toBeVisible();
    // Circles (beeswarm dots) should be present
    const circles = svg.locator('circle');
    expect(await circles.count()).toBeGreaterThan(0);
  });

  test('annotations persist after metric switch', async ({ mockedPage: page }) => {
    const svg = page.locator('.chart-container svg');

    // Switch metric
    await page.locator('#metric-select').selectOption('latency');

    // Annotations should still show
    await expect(svg.locator('tspan', { hasText: 'model: gpt-4o' })).toBeVisible();
    await expect(svg.locator('tspan', { hasText: 'run day: Tue' })).toBeVisible();
  });

  // ── Data Points ───────────────────────────────────────────────────────────

  test('renders beeswarm dots for each data point', async ({ mockedPage: page }) => {
    const svg = page.locator('.chart-container svg');
    const circles = svg.locator('circle');
    // 5 values per set × 4 groups (proj-baseline, exp-baseline, set-a, set-b) = 20
    expect(await circles.count()).toBe(20);
  });

  test('renders box plot elements', async ({ mockedPage: page }) => {
    const svg = page.locator('.chart-container svg');
    // Box plots use rect elements for the box
    const rects = svg.locator('rect');
    expect(await rects.count()).toBeGreaterThan(0);
  });

  // ── Visual Snapshot ─────────────────────────────────────────────────────────

  test('distribution chart visual snapshot', async ({ mockedPage: page }) => {
    const chartWrapper = page.locator('.chart-wrapper');
    await expect(chartWrapper).toBeVisible();

    await expect(chartWrapper).toHaveScreenshot('distribution-chart.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  // ── Error & Empty States ──────────────────────────────────────────────────

  test('shows no-data message when metric has no values', async ({ mockedPage: page }) => {
    // Override comparison to have no baselines and override sets list
    await page.route('**/api/projects/*/experiments/*/compare**', (route) =>
      route.fulfill({
        json: {
          metric_definitions: {},
          project_baseline: {},
          experiment_baseline: {},
          sets: [],
        },
      }),
    );
    await page.route('**/api/projects/*/experiments/*/sets', (route) => {
      if (route.request().url().endsWith('/sets') || route.request().url().includes('/sets?')) {
        return route.fulfill({ json: ['empty-set'] });
      }
      return route.fallback();
    });
    await page.route('**/api/projects/*/experiments/*/sets/empty-set', (route) =>
      route.fulfill({
        json: [
          {
            ref: 'ref-1',
            set: 'empty-set',
            is_baseline: false,
            created: '2026-01-20T09:00:00Z',
            metrics: {},
            annotations: [],
          },
        ],
      }),
    );

    await page.goto(chartUrl);
    await expect(page.locator('.no-data')).toBeVisible();
  });

  test('shows error state when API fails', async ({ mockedPage: page }) => {
    await page.route('**/api/projects/*/experiments/*/compare**', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' }),
    );

    await page.goto(chartUrl);
    await expect(page.getByText('Error loading data.')).toBeVisible();
  });

  // ── Baseline Labeling ─────────────────────────────────────────────────────

  test('shows separate baseline labels when baselines differ', async ({ mockedPage: page }) => {
    const svg = page.locator('.chart-container svg');
    // Default mock has different project/experiment baselines
    await expect(svg.locator('text', { hasText: 'project-baseline' })).toBeVisible();
    await expect(svg.locator('text', { hasText: 'experiment-baseline' })).toBeVisible();
  });

  test('shows combined baseline label when project and experiment baselines match', async ({ mockedPage: page }) => {
    // Override comparison so both baselines point to same project+experiment+set
    await page.route('**/api/projects/*/experiments/*/compare**', (route) =>
      route.fulfill({
        json: {
          ...data.comparison,
          project_baseline: {
            project: 'alpha-project',
            experiment: 'exp-001',
            set: 'baseline',
          },
          experiment_baseline: {
            project: 'alpha-project',
            experiment: 'exp-001',
            set: 'baseline',
          },
        },
      }),
    );

    await page.goto(chartUrl);
    await expect(page.locator('.chart-container')).toBeVisible();

    const svg = page.locator('.chart-container svg');
    // Combined label shows as "baseline: baseline"
    await expect(svg.locator('text', { hasText: 'baseline' })).toBeVisible();
    // Should NOT show separate project-baseline / experiment-baseline
    await expect(svg.locator('text', { hasText: 'project-baseline' })).not.toBeVisible();
    await expect(svg.locator('text', { hasText: 'experiment-baseline' })).not.toBeVisible();
  });
});
