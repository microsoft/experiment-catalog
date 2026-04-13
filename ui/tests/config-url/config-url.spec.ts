import { test, expect } from '../fixtures';

/**
 * Helper to base64-encode a ViewConfig object the same way the app does.
 */
function encodeConfig(config: Record<string, unknown>): string {
  return btoa(JSON.stringify(config));
}

test.describe('URL config encoding and decoding', () => {
  test('navigating with show_std=false pre-unchecks the Std Dev toggle', async ({ mockedPage: page }) => {
    const config = encodeConfig({ show_std: false });
    await page.goto(`/?project=alpha-project&experiment=exp-001&config=${config}`);
    await expect(page.getByRole('heading', { name: /EXPERIMENT: exp-001/ })).toBeVisible();

    const toggle = page.locator('.toggles').getByLabel('Std Dev');
    await expect(toggle).not.toBeChecked();

    // Other toggles should still be checked (defaults)
    await expect(page.locator('.toggles').getByLabel('Actual Value')).toBeChecked();
    await expect(page.locator('.toggles').getByLabel('Count')).toBeChecked();
    await expect(page.locator('.toggles').getByLabel('Statistics')).toBeChecked();
  });

  test('navigating with checked_metrics highlights those rows', async ({ mockedPage: page }) => {
    const config = encodeConfig({ checked_metrics: 'accuracy' });
    await page.goto(`/?project=alpha-project&experiment=exp-001&config=${config}`);
    await expect(page.locator('table')).toBeVisible();

    // The accuracy row should be highlighted
    const accuracyRow = page.locator('table tr', {
      has: page.locator('td.label', { hasText: 'accuracy' }),
    });
    await expect(accuracyRow).toHaveClass(/highlighted/);

    // The latency row should NOT be highlighted
    const latencyRow = page.locator('table tr', {
      has: page.locator('td.label', { hasText: 'latency' }),
    });
    await expect(latencyRow).not.toHaveClass(/highlighted/);
  });

  test('legacy checked param is backward-compatible', async ({ mockedPage: page }) => {
    // Old URL format used ?checked=accuracy instead of config=
    await page.goto('/?project=alpha-project&experiment=exp-001&checked=accuracy');
    await expect(page.locator('table')).toBeVisible();

    const accuracyRow = page.locator('table tr', {
      has: page.locator('td.label', { hasText: 'accuracy' }),
    });
    await expect(accuracyRow).toHaveClass(/highlighted/);
  });

  test('page=sets:set-a shows specific set columns', async ({ mockedPage: page }) => {
    await page.goto('/?project=alpha-project&experiment=exp-001&page=sets:set-a');
    await expect(page.locator('table')).toBeVisible();

    // set-a should be visible in the comparison table
    await expect(page.getByRole('button', { name: 'set-a' })).toBeVisible();
  });

  test('page=set:set-a navigates directly to SetPage', async ({ mockedPage: page }) => {
    await page.goto('/?project=alpha-project&experiment=exp-001&page=set:set-a');

    // Should see SetPage heading
    await expect(page.getByText('SET: set-a')).toBeVisible();
  });

  test('malformed config param is handled gracefully', async ({ mockedPage: page }) => {
    // Invalid base64 should not crash — falls back to empty config
    await page.goto('/?project=alpha-project&experiment=exp-001&config=NOT_VALID_BASE64!!!');
    await expect(page.getByRole('heading', { name: /EXPERIMENT: exp-001/ })).toBeVisible();

    // All toggles should be at defaults (checked)
    await expect(page.locator('.toggles').getByLabel('Std Dev')).toBeChecked();
  });

  test('multiple config values round-trip through the URL', async ({ mockedPage: page }) => {
    const config = encodeConfig({
      show_std: false,
      show_cnt: false,
      checked_metrics: 'cost',
    });
    await page.goto(`/?project=alpha-project&experiment=exp-001&config=${config}`);
    await expect(page.locator('table')).toBeVisible();

    // Std Dev and Count should be unchecked
    await expect(page.locator('.toggles').getByLabel('Std Dev')).not.toBeChecked();
    await expect(page.locator('.toggles').getByLabel('Count')).not.toBeChecked();

    // Cost row should be highlighted
    const costRow = page.locator('table tr', {
      has: page.locator('td.label', { hasText: 'cost' }),
    });
    await expect(costRow).toHaveClass(/highlighted/);
  });
});
