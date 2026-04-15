import { test, expect } from '../fixtures';

test.describe('Experiment page data display', () => {
  test.beforeEach(async ({ mockedPage: page }) => {
    // Navigate directly to the experiment page
    await page.goto('/?project=alpha-project&experiment=exp-001');
    await expect(
      page.getByRole('heading', { name: /EXPERIMENT: exp-001/ }),
    ).toBeVisible();
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
    await expect(page.getByText('Project Baseline', { exact: true })).toBeVisible();
    await expect(page.getByText('Experiment Baseline', { exact: true })).toBeVisible();
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
});
