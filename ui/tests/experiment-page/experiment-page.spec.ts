import { test, expect } from '../fixtures';
import * as data from '../mocks/data';

test.describe('Experiment page data display', () => {
  test.beforeEach(async ({ mockedPage: page }) => {
    // Navigate directly to the experiment page
    await page.goto('/?project=alpha-project&experiment=exp-001');
    await expect(
      page.getByRole('heading', { name: /EXPERIMENT: exp-001/ }),
    ).toBeVisible();
  });

  test('shows the project ground truth after the hypothesis, or Unknown when unset', async ({ mockedPage: page }) => {
    const groundTruth = page.locator('.meta-row').filter({ hasText: 'GRND TRUTH' });
    await expect(groundTruth).toContainText('Unknown');
    await page.route('**/api/projects/alpha-project', (route) =>
      route.fulfill({
        json: { name: 'alpha-project', ground_truth: 'GT v2' },
      }),
    );
    await page.reload();
    await expect(groundTruth).toContainText('GT v2');
    await expect(groundTruth).not.toContainText('Unknown');
    const hypothesis = page.locator('.meta-row').filter({ hasText: 'Hypothesis' });
    const hypothesisBounds = await hypothesis.boundingBox();
    const groundTruthBounds = await groundTruth.boundingBox();
    const createdBounds = await page.locator('.meta-row').filter({ hasText: 'Created' }).boundingBox();
    expect(groundTruthBounds!.y).toBeGreaterThan(hypothesisBounds!.y);
    expect(groundTruthBounds!.y).toBeLessThan(createdBounds!.y);
    const hypothesisValue = await hypothesis.locator('span').nth(1).boundingBox();
    const groundTruthValue = await groundTruth.locator('span').nth(1).boundingBox();
    expect(groundTruthValue!.x).toBe(hypothesisValue!.x);
  });

  test('renders comparison table with metric rows', async ({ mockedPage: page }) => {
    // The comparison table should load and display metric labels
    const table = page.locator('table');
    await expect(table).toBeVisible();

    // Check that metric names from the mock data appear as row labels
    await expect(table.locator('td.label', { hasText: 'accuracy' })).toBeVisible();
    await expect(table.locator('td.label', { hasText: 'latency' })).toBeVisible();
    await expect(table.locator('td.label', { hasText: 'cost' })).toBeVisible();
  });

  test('shows experiment links using the active baseline but leaves set links for compare-by-ref', async ({ mockedPage: page }) => {
    await page.route('**/api/projects/alpha-project/links', (route) => route.fulfill({
      json: [
        { scope: 'experiment', name: 'report', url: 'https://tools.example/{project}/{experiment}?baseline={baseline-set}' },
        { scope: 'experiment', name: 'details', url: 'https://tools.example/details?experiment={experiment}' },
        { scope: 'set', name: 'dashboard', url: 'https://tools.example/{project}/{experiment}/{set}' },
      ],
    }));
    await page.reload();
    const linksRow = page.locator('.meta-row').filter({ has: page.getByText('Links', { exact: true }) });
    await expect(linksRow.getByRole('link', { name: 'report', exact: true }))
      .toHaveAttribute('href', 'https://tools.example/alpha-project/exp-001?baseline=baseline');
    await expect(linksRow.locator('span').last()).toHaveText('report, details');
    await expect(linksRow.getByRole('link', { name: 'report', exact: true }))
      .toHaveCSS('text-decoration-line', 'underline');
    await expect(linksRow.getByRole('link', { name: 'report', exact: true }))
      .toHaveCSS('color', await linksRow.evaluate((row) => getComputedStyle(row).color));
    await expect(page.locator('h2').getByRole('link')).toHaveCount(0);
    const createdBounds = await page.locator('.meta-row').filter({ hasText: 'Created' }).boundingBox();
    const linksBounds = await linksRow.boundingBox();
    const impactBounds = await page.locator('.meta-row').filter({ hasText: 'Tag Impact' }).boundingBox();
    expect(linksBounds!.y).toBeGreaterThanOrEqual(createdBounds!.y + createdBounds!.height);
    expect(linksBounds!.y + linksBounds!.height).toBeLessThanOrEqual(impactBounds!.y);
    await expect(page.getByRole('link', { name: /dashboard/ })).toHaveCount(0);
  });

  test('omits the Links row when no experiment links resolve', async ({ mockedPage: page }) => {
    const linksRow = page.locator('.meta-row').filter({ has: page.getByText('Links', { exact: true }) });
    await expect(page.locator('table')).toBeVisible();
    await expect(linksRow).toHaveCount(0);
    await page.route('**/api/projects/alpha-project/links', (route) => route.fulfill({
      json: [{ scope: 'experiment', name: 'unavailable', url: 'https://tools.example/{baseline-set}' }],
    }));
    await page.route('**/api/projects/*/experiments/*/compare**', (route) => route.fulfill({
      json: { ...data.comparison, project_baseline: null, experiment_baseline: null },
    }));
    await page.reload();
    await expect(page.locator('table')).toBeVisible();
    await expect(linksRow).toHaveCount(0);
  });

  test('pins metric names and checkboxes when scrolling horizontally', async ({ mockedPage: page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    const row = page.locator('tbody tr').filter({ has: page.locator('td.label', { hasText: 'accuracy' }) });
    await expect(row).toBeVisible();
    const positions = [];
    for (const x of [150, 300]) {
      await page.evaluate((offset) => window.scrollTo(offset, 0), x);
      await expect.poll(() => page.evaluate(() => window.scrollX)).toBe(x);
      positions.push(await row.evaluate((element) => Array.from(element.children).slice(0, 3).map((cell) => {
        const rect = cell.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      })));
    }
    expect(positions[1][0].left).toBeCloseTo(positions[0][0].left, 0);
    expect(positions[1][1].left).toBeCloseTo(positions[0][1].left, 0);
    expect(positions[1][0].right).toBeLessThanOrEqual(positions[1][1].left + 1);
    expect(positions[1][2].left).toBeCloseTo(positions[0][2].left - 150, 0);
    await row.locator('input[type="checkbox"]').check();
    await expect(row).toHaveClass(/highlighted/);
    await expect(row.locator('td.label')).toHaveCSS('background-color', 'rgb(51, 51, 51)');
  });

  for (const override of [false, true]) {
    test(`keeps ${override ? 'orange comparison-target' : 'green baseline'} borders behind pinned headers`, async ({ mockedPage: page }) => {
      await page.setViewportSize({ width: 800, height: 900 });
      const target = { project: 'alpha-project', experiment: 'exp-001', set: 'set-b' };
      await page.route('**/api/projects/*/experiments/*/compare**', (route) => route.fulfill({
        json: {
          ...data.comparison,
          ...(override ? { comparison_target: { ...target, result: data.setBResult } } : {}),
        },
      }));
      const config = btoa(JSON.stringify({
        show_project_baseline: false,
        ...(override ? { comparison_target: target } : {}),
      }));
      await page.goto(`/?project=alpha-project&experiment=exp-001&config=${config}`);
      const coloredHeader = page.locator(override ? 'th.active-target' : 'th.default-baseline');
      await expect(coloredHeader).toBeVisible();
      const pinnedHeader = page.locator('thead th').nth(1);
      const before = await pinnedHeader.screenshot();
      await page.evaluate(() => window.scrollTo(200, window.scrollY));
      await expect.poll(() => page.evaluate(() => window.scrollX)).toBe(200);
      const after = await pinnedHeader.screenshot();
      expect(after.equals(before)).toBe(true);
    });
  }

  test('renders Project Baseline and Experiment Baseline columns', async ({ mockedPage: page }) => {
    const table = page.locator('table');
    await expect(table).toBeVisible();

    // Column headers (use exact match to avoid matching button text like "use the project baseline")
    await expect(table.getByText('Project Baseline', { exact: true })).toBeVisible();
    await expect(page.getByText('Experiment Baseline', { exact: true })).toBeVisible();
    await expect(table.locator('thead th').filter({ hasText: 'Project Baseline' })
      .getByText('experiment: exp-baseline')).toBeVisible();
    await expect(table.locator('thead th').filter({ hasText: 'Experiment Baseline' })
      .getByText('experiment: exp-001')).toBeVisible();
  });

  test('renders set comparison columns', async ({ mockedPage: page }) => {
    const table = page.locator('table');
    await expect(table).toBeVisible();

    // The mock comparison has sets: set-a, set-b
    // These appear as buttons in the SetSelector dropdown headers
    await expect(page.getByRole('button', { name: 'set-a' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'set-b' })).toBeVisible();
  });

  test('shows permutation count from comparison data', async ({ mockedPage: page }) => {
    // The comparison table should show "of 2 permutations"
    await expect(page.getByText(/of 2 permutations/)).toBeVisible();
  });

  test('metric checkboxes can be toggled to highlight rows', async ({ mockedPage: page }) => {
    const table = page.locator('table');
    await expect(table).toBeVisible();

    // Find the accuracy row and its checkbox
    const accuracyRow = table.locator('tr', { has: page.locator('td.label', { hasText: 'accuracy' }) });
    const checkbox = accuracyRow.locator('input[type="checkbox"]');

    // Initially not highlighted
    await expect(accuracyRow).not.toHaveClass(/highlighted/);

    // Click checkbox to highlight
    await checkbox.click();
    await expect(accuracyRow).toHaveClass(/highlighted/);

    // Click again to un-highlight
    await checkbox.click();
    await expect(accuracyRow).not.toHaveClass(/highlighted/);
  });

  test('ref boundary applies explicitly, survives tag changes and reload, and clears', async ({ mockedPage: page }) => {
    const filter = page.locator('.meta-row').filter({ has: page.getByText('Ref Filter', { exact: true }) });
    const impactBounds = await page.locator('.meta-row').filter({ hasText: 'Tag Impact' }).boundingBox();
    const filterBounds = await filter.boundingBox();
    const showBounds = await page.locator('.meta-row').filter({ has: page.getByText('Show', { exact: true }) }).boundingBox();
    expect(filterBounds!.y).toBeGreaterThan(impactBounds!.y);
    expect(filterBounds!.y).toBeLessThan(showBounds!.y);

    const apply = page.getByRole('button', { name: 'Apply ref filter', exact: true });
    await expect(apply).toBeEnabled();
    const warning = page.locator('.filter-row .ref-filter-warning');
    await expect(warning).toHaveCount(0);
    await page.getByLabel('Ref filter set', { exact: true }).selectOption('set-a');
    await page.getByLabel('Ref filter metric', { exact: true }).selectOption('accuracy');
    expect(new URL(page.url()).searchParams.has('config')).toBe(false);

    const appliedRequest = page.waitForRequest((req) =>
      new URL(req.url()).pathname.endsWith('/compare') && req.url().includes('ref-set='));
    await apply.click();
    const appliedParams = new URL((await appliedRequest).url()).searchParams;
    expect(appliedParams.get('ref-set')).toBe('set-a');
    expect(appliedParams.get('ref-metric')).toBe('accuracy');
    await expect(filter).not.toContainText('Refs with');
    await expect(warning).toContainText('Ref filter active.');
    await expect(warning).toContainText('set-a');
    await expect(warning).toContainText('accuracy');
    await expect(warning).toContainText('Tag filters cannot include refs outside this boundary.');
    await expect(warning).toHaveCSS('color', 'rgb(255, 210, 127)');
    await expect(warning).toHaveCSS('background-color', 'rgb(48, 43, 31)');
    const tagBounds = await page.locator('.filter-row .checkbox-container').boundingBox();
    const warningBounds = await warning.boundingBox();
    expect(warningBounds!.y + warningBounds!.height).toBeLessThanOrEqual(tagBounds!.y);
    const filterRowBounds = await page.locator('.filter-row').boundingBox();
    expect(warningBounds!.width).toBeLessThan(filterRowBounds!.width);
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByRole('button', { name: 'compute statistics', exact: true })).toBeDisabled();

    // Draft edits must not change the applied boundary when tags are applied.
    await page.getByLabel('Ref filter set', { exact: true }).selectOption('set-b');
    await expect(page.getByLabel('Ref filter metric', { exact: true })).toHaveValue('accuracy');
    await expect(warning).toContainText('set-a');
    await page.getByText('model:gpt-4', { exact: true }).locator('..').locator('button.checkbox-wrapper').click();
    const taggedRequest = page.waitForRequest((req) => req.url().includes('/compare?') && req.url().includes('include-tags'));
    await page.getByRole('button', { name: 'apply', exact: true }).click();
    const taggedParams = new URL((await taggedRequest).url()).searchParams;
    expect(taggedParams.get('ref-set')).toBe('set-a');
    expect(taggedParams.get('ref-metric')).toBe('accuracy');
    expect(taggedParams.get('include-tags')).toBe('model:gpt-4');

    const config = JSON.parse(atob(new URL(page.url()).searchParams.get('config')!));
    expect(config.ref_filter).toEqual({
      project: 'alpha-project', experiment: 'exp-001', set: 'set-a', metric: 'accuracy',
    });
    await page.reload();
    await expect(page.getByLabel('Ref filter set', { exact: true })).toHaveValue('set-a');
    await expect(page.getByLabel('Ref filter metric', { exact: true })).toHaveValue('accuracy');
    await expect(page.locator('table')).toBeVisible();

    const clearedRequest = page.waitForRequest((req) =>
      new URL(req.url()).pathname.endsWith('/compare') &&
      req.url().includes('include-tags') && !req.url().includes('ref-set'));
    await page.getByRole('button', { name: 'Clear ref filter', exact: true }).click();
    await clearedRequest;
    await expect(page.getByRole('button', { name: 'Clear ref filter', exact: true })).toHaveCount(0);
    await expect(warning).toHaveCount(0);
    const cleared = JSON.parse(atob(new URL(page.url()).searchParams.get('config')!));
    expect(cleared.ref_filter).toBeUndefined();
    expect(cleared.tags).toContain('model:gpt-4');
    await expect(page.getByRole('button', { name: 'compute statistics', exact: true })).toBeEnabled();
  });

  test('ref filter uses Tag Impact dropdown styles, defaults and complete option lists', async ({ mockedPage: page }) => {
    await page.route('**/api/projects/*/experiments/*/compare', (route) =>
      route.fulfill({
        json: {
          ...data.comparison,
          sets: data.comparison.sets.map((entity) => entity.set === 'set-a'
            ? { ...entity, result: { ...entity.result, metrics: { accuracy: data.setAResult.metrics.accuracy } } }
            : entity),
        },
      }));
    await page.reload();
    await expect(page.getByRole('button', { name: 'Apply ref filter', exact: true })).toBeEnabled();
    const impactSelects = page.locator('.meaningful-tags-row select');
    const refSelects = page.locator('.ref-filter select');
    for (const index of [0, 1]) {
      const impactSelect = impactSelects.nth(index);
      const refSelect = refSelects.nth(index);
      expect(await refSelect.locator('option').allTextContents())
        .toEqual(await impactSelect.locator('option').allTextContents());
      await expect(refSelect).toHaveValue(await impactSelect.inputValue());
      for (const property of ['font-size', 'line-height', 'margin-left']) {
        const expected = await impactSelect.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
        await expect(refSelect).toHaveCSS(property, expected);
      }
      expect((await refSelect.boundingBox())!.height).toBe((await impactSelect.boundingBox())!.height);
    }

    await page.getByLabel('Ref filter set', { exact: true }).selectOption('set-a');
    await expect(page.getByLabel('Ref filter metric', { exact: true }).locator('option'))
      .toHaveText(['accuracy', 'latency', 'cost']);
    await page.getByLabel('Ref filter metric', { exact: true }).selectOption('latency');
    const request = page.waitForRequest((req) => req.url().includes('/compare?') && req.url().includes('ref-set='));
    await page.getByRole('button', { name: 'Apply ref filter', exact: true }).click();
    const params = new URL((await request).url()).searchParams;
    expect(params.get('ref-set')).toBe('set-a');
    expect(params.get('ref-metric')).toBe('latency');
  });

  test('ref boundary stays scoped across drilldown and chart navigation', async ({ mockedPage: page }) => {
    const refFilter = { project: 'alpha-project', experiment: 'exp-001', set: 'set-b', metric: 'accuracy' };
    const config = btoa(JSON.stringify({ ref_filter: refFilter }));
    await page.goto(`/?project=alpha-project&experiment=exp-001&config=${config}`);
    await expect(page.locator('table')).toBeVisible();
    const request = page.waitForRequest((req) => req.url().includes('/compare-by-ref?'));
    await page.locator('table').getByRole('button', { name: 'set:', exact: true }).first().click();
    const params = new URL((await request).url()).searchParams;
    expect(params.get('ref-set')).toBe('set-b');
    expect(params.get('ref-metric')).toBe('accuracy');
    const warning = page.locator('.tag-filters .ref-filter-warning');
    await expect(warning).toHaveAttribute('role', 'status');
    await expect(warning).toContainText('Ref filter active.');
    await expect(warning).toContainText('set-b');
    await expect(warning).toContainText('accuracy');
    await expect(warning).toHaveCSS('color', 'rgb(255, 210, 127)');
    await expect(warning).toHaveCSS('background-color', 'rgb(48, 43, 31)');
    await expect(warning).toHaveCSS('border-left-width', '4px');
    const warningBounds = await warning.boundingBox();
    const tagBounds = await page.locator('.tag-filters .checkbox-container').boundingBox();
    expect(warningBounds!.y + warningBounds!.height).toBeLessThanOrEqual(tagBounds!.y);
    expect(warningBounds!.width).toBeLessThan((await page.locator('.tag-filters').boundingBox())!.width);

    await page.getByRole('button', { name: 'back' }).click();
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('.filter-row .ref-filter-warning')).toBeVisible();
    await page.route('**/api/projects/*/experiments/*/sets', (route) =>
      route.fulfill({ json: ['set-a', 'set-b'] }));
    const chartRequest = page.waitForRequest((req) => req.url().includes('/compare?') && req.url().includes('ref-set='));
    await page.getByRole('button', { name: 'charts', exact: true }).click();
    const chartParams = new URL((await chartRequest).url()).searchParams;
    expect(chartParams.get('ref-set')).toBe('set-b');
    expect(chartParams.get('ref-metric')).toBe('accuracy');
    await expect(page.locator('.chart-container')).toBeVisible();
    await expect(page.locator('.ref-filter-warning')).toBeVisible();
    await page.getByRole('button', { name: 'back' }).click();
    await expect(page.locator('table')).toBeVisible();
    const restored = JSON.parse(atob(new URL(page.url()).searchParams.get('config')!));
    expect(restored.ref_filter).toEqual(refFilter);
  });
});
