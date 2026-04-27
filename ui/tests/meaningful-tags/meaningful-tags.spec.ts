import { test, expect } from '../fixtures';
import * as data from '../mocks/data';

/**
 * MeaningfulTags component tests.
 *
 * Visible on the experiment comparison page — contains set/metric/compare
 * dropdowns, a "compute" button, and a dialog with results.
 */
test.describe('Meaningful Tags', () => {
  const base = '/?project=alpha-project&experiment=exp-001';

  test('compute button is visible on experiment page', async ({ mockedPage: page }) => {
    await page.goto(base);
    await expect(page.getByRole('button', { name: 'compute', exact: true })).toBeVisible();
  });

  test('set and metric dropdowns are populated', async ({ mockedPage: page }) => {
    await page.goto(base);
    // Wait for the metadata to load
    await expect(page.getByRole('button', { name: 'compute', exact: true })).toBeEnabled();

    // Set dropdown should contain set names from comparison
    const setSelect = page.locator('.meaningful-tags-row select').first();
    await expect(setSelect).toContainText('set-a');
    await expect(setSelect).toContainText('set-b');

    // Metric dropdown should contain metric names
    const metricSelect = page.locator('.meaningful-tags-row select').nth(1);
    await expect(metricSelect).toContainText('accuracy');
  });

  test('clicking compute opens results modal', async ({ mockedPage: page }) => {
    await page.goto(base);
    await expect(page.getByRole('button', { name: 'compute', exact: true })).toBeEnabled();

    await page.getByRole('button', { name: 'compute', exact: true }).click();

    // Modal should appear with heading
    await expect(page.getByRole('heading', { name: 'Meaningful tags' })).toBeVisible();
  });

  test('results table shows tag data', async ({ mockedPage: page }) => {
    await page.goto(base);
    await page.getByRole('button', { name: 'compute', exact: true }).click();

    // Wait for results
    await expect(page.getByRole('heading', { name: 'Meaningful tags' })).toBeVisible();

    // Table headers
    await expect(page.locator('.meaningful-tags-table th', { hasText: 'Tag' })).toBeVisible();
    await expect(page.locator('.meaningful-tags-table th', { hasText: 'Impact' })).toBeVisible();
    await expect(page.locator('.meaningful-tags-table th', { hasText: 'Diff' })).toBeVisible();
    await expect(page.locator('.meaningful-tags-table th', { hasText: 'Count' })).toBeVisible();

    // Data rows from mock
    await expect(page.locator('.meaningful-tags-table').getByText('model:gpt-4')).toBeVisible();
    await expect(page.locator('.meaningful-tags-table').getByText('prompt:v2')).toBeVisible();
    await expect(page.locator('.meaningful-tags-table').getByText('0.15')).toBeVisible();
    await expect(page.locator('.meaningful-tags-table').getByText('25')).toBeVisible();
  });

  test('close button dismisses modal', async ({ mockedPage: page }) => {
    await page.goto(base);
    await page.getByRole('button', { name: 'compute', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Meaningful tags' })).toBeVisible();

    await page.getByRole('button', { name: 'close', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Meaningful tags' })).not.toBeVisible();
  });

  test('Escape key dismisses modal', async ({ mockedPage: page }) => {
    await page.goto(base);
    await page.getByRole('button', { name: 'compute', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Meaningful tags' })).toBeVisible();

    // Press Escape on the backdrop
    await page.locator('.modal-backdrop').press('Escape');
    await expect(page.getByRole('heading', { name: 'Meaningful tags' })).not.toBeVisible();
  });

  test('empty results show no-data message', async ({ mockedPage: page }) => {
    // Override meaningful-tags to return empty
    await page.route('**/api/analysis/meaningful-tags', (route) =>
      route.fulfill({ json: { tags: [] } }),
    );

    await page.goto(base);
    await page.getByRole('button', { name: 'compute', exact: true }).click();
    await expect(page.getByText('No meaningful tags found.')).toBeVisible();
  });

  test('server error shows error in modal', async ({ mockedPage: page }) => {
    await page.route('**/api/analysis/meaningful-tags', (route) =>
      route.fulfill({ status: 500, body: 'Server Error' }),
    );

    await page.goto(base);
    await page.getByRole('button', { name: 'compute', exact: true }).click();
    await expect(page.getByText('Failed to load meaningful tags.')).toBeVisible();
  });

  test('POST body includes selected values', async ({ mockedPage: page }) => {
    const postReq = page.waitForRequest(
      (req) => req.url().includes('/api/analysis/meaningful-tags') && req.method() === 'POST',
    );

    await page.goto(base);
    await expect(page.getByRole('button', { name: 'compute', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'compute', exact: true }).click();

    const req = await postReq;
    const body = req.postDataJSON();
    expect(body.project).toBe('alpha-project');
    expect(body.experiment).toBe('exp-001');
    expect(body.set).toBeDefined();
    expect(body.metric).toBeDefined();
    expect(body.compare_to).toBe('Baseline');
  });
});
