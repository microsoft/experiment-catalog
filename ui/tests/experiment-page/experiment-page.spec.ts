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
