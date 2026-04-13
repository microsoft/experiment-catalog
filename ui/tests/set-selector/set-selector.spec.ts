import { test, expect } from '../fixtures';
import * as data from '../mocks/data';

/**
 * SetSelector dropdown tests.
 *
 * The SetSelector appears in set column headers on the experiment comparison page.
 * It allows switching between different sets in each column.
 */
test.describe('SetSelector dropdown', () => {
  const base = '/?project=alpha-project&experiment=exp-001';

  test.beforeEach(async ({ mockedPage: page }) => {
    await page.goto(base);
    await expect(
      page.getByRole('heading', { name: /EXPERIMENT: exp-001/ }),
    ).toBeVisible();
  });

  test('set buttons are visible as dropdown headers', async ({ mockedPage: page }) => {
    // Set selector buttons for set-a and set-b should be visible
    await expect(page.getByRole('button', { name: 'set-a' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'set-b' })).toBeVisible();
  });

  test('clicking set button opens dropdown menu', async ({ mockedPage: page }) => {
    const setAButton = page.getByRole('button', { name: 'set-a' });
    await setAButton.click();

    // Dropdown should show with a list of available sets
    const dropdown = page.locator('.dropdown-menu');
    await expect(dropdown).toBeVisible();

    // Should contain the "None" option and set names
    await expect(dropdown.getByText('None')).toBeVisible();
  });

  test('selecting a different set updates the column', async ({ mockedPage: page }) => {
    // Open the first set selector (set-a)
    await page.getByRole('button', { name: 'set-a' }).click();

    // Select set-b from the dropdown
    const dropdown = page.locator('.dropdown-menu');
    await expect(dropdown).toBeVisible();
    await dropdown.locator('.dropdown-button', { hasText: 'set-b' }).click();

    // The dropdown should close
    await expect(dropdown).not.toBeVisible();
  });

  test('selecting None clears the column', async ({ mockedPage: page }) => {
    await page.getByRole('button', { name: 'set-a' }).click();
    const dropdown = page.locator('.dropdown-menu');
    await expect(dropdown).toBeVisible();

    // Click "None"
    await dropdown.locator('.dropdown-button', { hasText: 'None' }).click();
    await expect(dropdown).not.toBeVisible();

    // The button should now read "None"
    await expect(page.getByRole('button', { name: 'None' }).first()).toBeVisible();
  });

  test('click outside closes dropdown', async ({ mockedPage: page }) => {
    await page.getByRole('button', { name: 'set-a' }).click();
    const dropdown = page.locator('.dropdown-menu');
    await expect(dropdown).toBeVisible();

    // Click outside the dropdown (on the page heading)
    await page.getByRole('heading', { name: /EXPERIMENT: exp-001/ }).click();
    await expect(dropdown).not.toBeVisible();
  });

  test('currently selected set is highlighted in dropdown', async ({ mockedPage: page }) => {
    await page.getByRole('button', { name: 'set-a' }).click();
    const dropdown = page.locator('.dropdown-menu');
    await expect(dropdown).toBeVisible();

    // The selected set-a item should have the .selected class
    const selectedItem = dropdown.locator('.dropdown-button.selected');
    await expect(selectedItem).toBeVisible();
  });

  test('dropdown shows annotations on set entries', async ({ mockedPage: page }) => {
    // set-a has an annotation "Run note for set-a" in mock data
    await page.getByRole('button', { name: 'set-a' }).click();
    const dropdown = page.locator('.dropdown-menu');
    await expect(dropdown).toBeVisible();

    // The set-a entry should show its annotation text
    await expect(dropdown.getByText('Run note for set-a')).toBeVisible();
  });
});
