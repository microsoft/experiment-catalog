import { test, expect } from '../fixtures';

test.describe('Show/hide toggles on experiment page', () => {
  test.beforeEach(async ({ mockedPage: page }) => {
    await page.goto('/?project=alpha-project&experiment=exp-001');
    await expect(
      page.getByRole('heading', { name: /EXPERIMENT: exp-001/ }),
    ).toBeVisible();
    // Wait for comparison table to load
    await expect(page.locator('table')).toBeVisible();
  });

  test('all toggles are checked by default', async ({ mockedPage: page }) => {
    const toggles = page.locator('.toggles');
    await expect(toggles.getByLabel('Actual Value')).toBeChecked();
    await expect(toggles.getByLabel('Std Dev')).toBeChecked();
    await expect(toggles.getByLabel('Count')).toBeChecked();
    await expect(toggles.getByLabel('Statistics')).toBeChecked();
  });

  test('unchecking Std Dev hides standard deviation values', async ({ mockedPage: page }) => {
    // Std dev values (e.g., "(0.050)") should be visible initially
    const table = page.locator('table');
    await expect(table.getByText('(0.050)').first()).toBeVisible();

    // Uncheck Std Dev
    await page.locator('.toggles').getByLabel('Std Dev').uncheck();

    // Std dev values should disappear
    await expect(table.getByText('(0.050)')).toHaveCount(0);
  });

  test('unchecking Count hides count values', async ({ mockedPage: page }) => {
    const table = page.locator('table');
    // Count values like "x50" should be visible
    await expect(table.getByText('x50').first()).toBeVisible();

    // Uncheck Count
    await page.locator('.toggles').getByLabel('Count').uncheck();

    // Count values should disappear
    await expect(table.getByText('x50')).toHaveCount(0);
  });

  test('unchecking Statistics hides p-values and confidence intervals', async ({ mockedPage: page }) => {
    const table = page.locator('table');
    // p-value should be visible (from set-a mock)
    await expect(table.locator('.pvalue').first()).toBeVisible();

    // Uncheck Statistics
    await page.locator('.toggles').getByLabel('Statistics').uncheck();

    // p-values should disappear
    await expect(table.locator('.pvalue')).toHaveCount(0);
  });

  test('unchecking Actual Value hides diff values', async ({ mockedPage: page }) => {
    const table = page.locator('table');
    // Actual diff values should be visible (class="actual")
    await expect(table.locator('.actual').first()).toBeVisible();

    // Uncheck Actual Value
    await page.locator('.toggles').getByLabel('Actual Value').uncheck();

    // Diff values should disappear
    await expect(table.locator('.actual')).toHaveCount(0);
  });

  test('re-checking a toggle restores the hidden values', async ({ mockedPage: page }) => {
    const table = page.locator('table');
    const toggle = page.locator('.toggles').getByLabel('Std Dev');

    await expect(table.getByText('(0.050)').first()).toBeVisible();

    // Uncheck
    await toggle.uncheck();
    await expect(table.getByText('(0.050)')).toHaveCount(0);

    // Re-check
    await toggle.check();
    await expect(table.getByText('(0.050)').first()).toBeVisible();
  });

  test('toggle state is persisted in URL config', async ({ mockedPage: page }) => {
    // Uncheck Std Dev
    await page.locator('.toggles').getByLabel('Std Dev').uncheck();

    // URL should contain a config param
    await expect(page).toHaveURL(/config=/);

    // Decode the config from URL
    const url = new URL(page.url());
    const configB64 = url.searchParams.get('config');
    expect(configB64).toBeTruthy();
    const config = JSON.parse(atob(configB64!));
    expect(config.show_std).toBe(false);
  });
});

test.describe('Statistics expand/collapse', () => {
  test('clicking Statistics label toggles details', async ({ mockedPage: page }) => {
    await page.goto('/?project=alpha-project&experiment=exp-001');
    await expect(
      page.getByRole('heading', { name: /EXPERIMENT: exp-001/ }),
    ).toBeVisible();

    // Initially collapsed — details not visible
    await expect(page.locator('.statistics-details')).not.toBeVisible();

    // Click the Statistics label
    await page.getByRole('button', { name: 'Statistics:' }).click();

    // Details should now be visible
    await expect(page.locator('.statistics-details')).toBeVisible();
    await expect(page.getByText('P-Value Calculation')).toBeVisible();

    // Click again to collapse
    await page.getByRole('button', { name: 'Statistics:' }).click();
    await expect(page.locator('.statistics-details')).not.toBeVisible();
  });
});
