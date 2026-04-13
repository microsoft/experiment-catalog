import { test, expect } from '../fixtures';
import * as data from '../mocks/data';

/**
 * FreeFilter component tests.
 *
 * FreeFilter appears on the SetPage and allows free-text expression filters
 * that evaluate against result metrics.
 */
test.describe('FreeFilter', () => {
  const base = '/?project=alpha-project&experiment=exp-001&page=set:set-a';

  test.beforeEach(async ({ mockedPage: page }) => {
    await page.goto(base);
    await expect(page.getByText('SET: set-a')).toBeVisible();
  });

  test('filter textarea is visible', async ({ mockedPage: page }) => {
    const filterLabel = page.locator('label', { hasText: 'filter:' });
    await expect(filterLabel).toBeVisible();
    await expect(page.locator('textarea')).toBeVisible();
  });

  test('Apply and Clear buttons are visible', async ({ mockedPage: page }) => {
    await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear', exact: true })).toBeVisible();
  });

  test('displays filtered and total count', async ({ mockedPage: page }) => {
    // With default data there is 1 ref, so should show "1 of 1"
    await expect(page.getByText(/\d+ of \d+/)).toBeVisible();
  });

  test('applying a filter updates the filtered count', async ({ mockedPage: page }) => {
    // Enter a filter expression that should match nothing
    // [accuracy] > 100 will never be true since accuracy is 0.87
    await page.locator('textarea').fill('[accuracy] > 100');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();

    // Should show "0 of 1"
    await expect(page.getByText('0 of 1')).toBeVisible();
  });

  test('applying a matching filter keeps rows visible', async ({ mockedPage: page }) => {
    // [accuracy] > 0.5 should match the set-a result (0.87)
    await page.locator('textarea').fill('[accuracy] > 0.5');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();

    // Should still show "1 of 1"
    await expect(page.getByText('1 of 1')).toBeVisible();
  });

  test('Clear button resets the filter', async ({ mockedPage: page }) => {
    // Apply a restrictive filter
    await page.locator('textarea').fill('[accuracy] > 100');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByText('0 of 1')).toBeVisible();

    // Clear should restore all rows
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.getByText('1 of 1')).toBeVisible();

    // Textarea should be empty
    await expect(page.locator('textarea')).toHaveValue('');
  });

  test('AND/OR keywords work in filter expressions', async ({ mockedPage: page }) => {
    // [accuracy] > 0.5 AND [latency] < 500 — both should be true for set-a
    await page.locator('textarea').fill('[accuracy] > 0.5 AND [latency] < 500');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByText('1 of 1')).toBeVisible();
  });

  test('failed expression gracefully shows 0 results', async ({ mockedPage: page }) => {
    // Invalid expression — should fail gracefully (returns false for each row)
    await page.locator('textarea').fill('[nonexistent_metric] > 0');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByText('0 of 1')).toBeVisible();
  });
});
