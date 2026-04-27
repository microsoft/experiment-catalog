import { test, expect } from '../fixtures';

/**
 * MetricsFilter tests on the SetPage drill-down.
 *
 * The metrics filter renders checkboxes for each metric, grouped by prefix.
 * When metrics are toggled, the table columns update.
 */
test.describe('MetricsFilter on SetPage', () => {
  const base = '/?project=alpha-project&experiment=exp-001&page=set:set-a';

  test('all metrics are selected by default (≤10 metrics)', async ({ mockedPage: page }) => {
    await page.goto(base);
    await expect(page.locator('#metric-accuracy')).toBeChecked();
    await expect(page.locator('#metric-latency')).toBeChecked();
    await expect(page.locator('#metric-cost')).toBeChecked();
  });

  test('shows "metrics (3/3)" when all are selected', async ({ mockedPage: page }) => {
    await page.goto(base);
    await expect(page.getByText('metrics (3/3)')).toBeVisible();
  });

  test('unchecking a metric hides the column', async ({ mockedPage: page }) => {
    await page.goto(base);
    // Accuracy column should be visible
    await expect(page.locator('thead').getByText('accuracy')).toBeVisible();

    // Uncheck accuracy
    await page.locator('#metric-accuracy').uncheck();

    // Column disappears
    await expect(page.locator('thead').getByText('accuracy')).not.toBeVisible();

    // Count updates
    await expect(page.getByText('metrics (2/3)')).toBeVisible();
  });

  test('re-checking a metric restores the column', async ({ mockedPage: page }) => {
    await page.goto(base);
    await page.locator('#metric-latency').uncheck();
    await expect(page.locator('thead').getByText('latency')).not.toBeVisible();

    await page.locator('#metric-latency').check();
    await expect(page.locator('thead').getByText('latency')).toBeVisible();
    await expect(page.getByText('metrics (3/3)')).toBeVisible();
  });

  test('metric selection persists in URL config', async ({ mockedPage: page }) => {
    await page.goto(base);
    // Uncheck cost
    await page.locator('#metric-cost').uncheck();

    // URL should contain a config with the remaining metrics
    await page.waitForTimeout(300); // config emission debounce
    const url = page.url();
    expect(url).toContain('config=');

    // Decode the config
    const configParam = new URL(url).searchParams.get('config');
    if (configParam) {
      const config = JSON.parse(atob(configParam));
      expect(config.metrics).toBeDefined();
      expect(config.metrics).not.toContain('cost');
      expect(config.metrics).toContain('accuracy');
      expect(config.metrics).toContain('latency');
    }
  });
});
