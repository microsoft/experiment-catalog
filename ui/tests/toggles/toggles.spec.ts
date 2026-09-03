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

  test('toggles are ordered and use expected defaults', async ({ mockedPage: page }) => {
    const toggles = page.locator('.toggles');
    await expect(toggles.locator('label')).toHaveText([
      'Metric Desc',
      'Value',
      'Diff',
      'Coefficient of Variation',
      'Std Dev',
      'Range',
      'Win',
      'Tie',
      'Count',
      'Statistics',
    ]);
    await expect(toggles.getByLabel('Metric Desc')).not.toBeChecked();
    await expect(toggles.getByLabel('Value', { exact: true })).toBeChecked();
    await expect(toggles.getByLabel('Diff', { exact: true })).toBeChecked();
    await expect(toggles.getByLabel('Coefficient of Variation')).toBeChecked();
    await expect(toggles.getByLabel('Std Dev')).toBeChecked();
    await expect(toggles.getByLabel('Range')).not.toBeChecked();
    await expect(toggles.getByLabel('Count')).toBeChecked();
    await expect(toggles.getByLabel('Win')).toBeChecked();
    await expect(toggles.getByLabel('Tie')).not.toBeChecked();
    await expect(toggles.getByLabel('Statistics')).toBeChecked();
  });

  test('checking Metric Desc shows italic descriptions below metric rows', async ({ mockedPage: page }) => {
    const table = page.locator('table');
    await expect(table.locator('.metric-description-row')).toHaveCount(0);

    await page.locator('.toggles').getByLabel('Metric Desc').check();

    const descriptions = table.locator('.metric-description-row');
    await expect(descriptions).toHaveCount(3);
    await expect(descriptions.first().locator('em')).toHaveText(
      'Fraction of evaluated answers that are correct.',
    );
  });

  test('unchecking Std Dev hides standard deviation values', async ({ mockedPage: page }) => {
    const table = page.locator('table');
    await expect(table.getByText(/cv\s+5\.7%,\s*dev\s+0\.050/).first()).toBeVisible();

    await page.locator('.toggles').getByLabel('Std Dev').uncheck();

    await expect(table.getByText(/cv\s+5\.7%,\s*dev\s+0\.050/)).toHaveCount(0);
    await expect(table.getByText(/\(cv\s+5\.7%,\s*win\s+12\)/i).first()).toBeVisible();
  });

  test('unchecking Coefficient of Variation hides CV values', async ({ mockedPage: page }) => {
    const table = page.locator('table');
    await expect(table.getByText(/cv\s+5\.7%,\s*dev\s+0\.050/).first()).toBeVisible();

    await page.locator('.toggles').getByLabel('Coefficient of Variation').uncheck();

    await expect(table.getByText(/cv /)).toHaveCount(0);
    await expect(table.getByText(/\(dev\s+0\.050,\s*win\s+12\)/i).first()).toBeVisible();
  });

  test('checking Range shows range values after standard deviation', async ({ mockedPage: page }) => {
    const table = page.locator('table');
    await expect(table.getByText(/rng 0\.820-0\.920/)).toHaveCount(0);

    await page.locator('.toggles').getByLabel('Range').check();

    await expect(table.getByText(/cv\s+5\.7%,\s*dev\s+0\.050,\s*rng\s+0\.820-0\.920/).first()).toBeVisible();
  });

  test('unchecking Count hides count values', async ({ mockedPage: page }) => {
    const table = page.locator('table');
    // Count values like "x50" should be visible
    await expect(table.getByText('x50').first()).toBeVisible();

    // Uncheck Count
    await page.locator('.toggles').getByLabel('Count').uncheck();

    // Count values should disappear
    await expect(table.getByText('x50')).toHaveCount(0);
    await expect(table.getByText('(20 refs)')).toHaveCount(0);
  });

  test('Win is shown by default and Tie is optional', async ({ mockedPage: page }) => {
    const table = page.locator('table');
    await expect(table.getByText(/win\s+12/i).first()).toBeVisible();
    await expect(table.getByText(/\(win\s+8\)/i).first()).toBeVisible();
    await expect(table.getByText(/tie\s+3/i)).toHaveCount(0);

    await page.locator('.toggles').getByLabel('Tie').check();
    await expect(table.getByText(/tie\s+3/i).first()).toBeVisible();

    await page.locator('.toggles').getByLabel('Win').uncheck();
    await expect(table.getByText(/win\s+12/i)).toHaveCount(0);
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

  test('unchecking Value hides metric values', async ({ mockedPage: page }) => {
    const table = page.locator('table');
    await expect(table.locator('.value').first()).toBeVisible();
    await expect(table.locator('.diff').first()).toBeVisible();

    await page.locator('.toggles').getByLabel('Value', { exact: true }).uncheck();

    await expect(table.locator('.value')).toHaveCount(0);
    await expect(table.locator('.diff').first()).toBeVisible();
  });

  test('unchecking Diff hides difference values and indicators', async ({ mockedPage: page }) => {
    const table = page.locator('table');
    await expect(table.locator('.value').first()).toBeVisible();
    await expect(table.locator('.diff').first()).toBeVisible();
    await expect(table.locator('svg').first()).toBeVisible();
    await expect(table.locator('.difp-green, .difp-red').first()).toBeVisible();

    await page.locator('.toggles').getByLabel('Diff', { exact: true }).uncheck();

    await expect(table.locator('.value').first()).toBeVisible();
    await expect(table.locator('.diff')).toHaveCount(0);
    await expect(table.locator('svg')).toHaveCount(0);
    await expect(table.locator('.difp-green, .difp-red')).toHaveCount(0);
  });

  test('diff values always include an explicit sign', async ({ mockedPage: page }) => {
    const table = page.locator('table');
    const diffs = table.locator('.diff');

    await expect(diffs.first()).toHaveText(/^\s*[+-]/);
    await expect(diffs.nth(1)).toHaveText(/^\s*\+0(?:\.0+)?\s*$/);
  });

  test('re-checking a toggle restores the hidden values', async ({ mockedPage: page }) => {
    const table = page.locator('table');
    const toggle = page.locator('.toggles').getByLabel('Std Dev');

    await expect(table.getByText(/cv\s+5\.7%,\s*dev\s+0\.050/).first()).toBeVisible();

    await toggle.uncheck();
    await expect(table.getByText(/cv\s+5\.7%,\s*dev\s+0\.050/)).toHaveCount(0);

    await toggle.check();
    await expect(table.getByText(/cv\s+5\.7%,\s*dev\s+0\.050/).first()).toBeVisible();
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

  test('Range toggle state is persisted in URL config', async ({ mockedPage: page }) => {
    await page.locator('.toggles').getByLabel('Range').check();

    await expect(page).toHaveURL(/config=/);

    const url = new URL(page.url());
    const configB64 = url.searchParams.get('config');
    expect(configB64).toBeTruthy();
    const config = JSON.parse(atob(configB64!));
    expect(config.show_range).toBe(true);
  });

  test('Metric Desc toggle state is persisted in URL config', async ({ mockedPage: page }) => {
    await page.locator('.toggles').getByLabel('Metric Desc').check();

    const url = new URL(page.url());
    const config = JSON.parse(atob(url.searchParams.get('config')!));
    expect(config.show_desc).toBe(true);
  });

  test('Value and Diff toggle states are persisted independently', async ({ mockedPage: page }) => {
    const toggles = page.locator('.toggles');
    await toggles.getByLabel('Value', { exact: true }).uncheck();
    await toggles.getByLabel('Diff', { exact: true }).uncheck();

    const url = new URL(page.url());
    const configB64 = url.searchParams.get('config');
    expect(configB64).toBeTruthy();
    const config = JSON.parse(atob(configB64!));
    expect(config.show_val).toBe(false);
    expect(config.show_diff).toBe(false);
  });

  test('Win and Tie toggle states are persisted independently', async ({ mockedPage: page }) => {
    const toggles = page.locator('.toggles');
    await toggles.getByLabel('Win').uncheck();
    await toggles.getByLabel('Tie').check();

    const url = new URL(page.url());
    const config = JSON.parse(atob(url.searchParams.get('config')!));
    expect(config.show_win).toBe(false);
    expect(config.show_tie).toBe(true);
  });
});

test.describe('Statistics expand/collapse', () => {
  test('clicking Details summary toggles statistics content', async ({ mockedPage: page }) => {
    await page.goto('/?project=alpha-project&experiment=exp-001');
    await expect(
      page.getByRole('heading', { name: /EXPERIMENT: exp-001/ }),
    ).toBeVisible();

    // Initially collapsed — statistics subsections not visible
    await expect(page.locator('.statistics-subsections')).not.toBeVisible();

    // Click the Details summary to expand
    await page.locator('details.reference-info summary').click();

    // Statistics content should now be visible
    await expect(page.locator('.statistics-subsections')).toBeVisible();
    await expect(page.getByText('P-Value Calculation')).toBeVisible();

    // Click again to collapse
    await page.locator('details.reference-info summary').click();
    await expect(page.locator('.statistics-subsections')).not.toBeVisible();
  });
});
