import { test, expect } from '../fixtures';
import * as data from '../mocks/data';

test.describe('Tags filter', () => {
  test.beforeEach(async ({ mockedPage: page }) => {
    await page.goto('/?project=alpha-project&experiment=exp-001');
    await expect(
      page.getByRole('heading', { name: /EXPERIMENT: exp-001/ }),
    ).toBeVisible();
  });

  test('displays tag count from API', async ({ mockedPage: page }) => {
    // Default mock returns 3 tags
    await expect(page.getByText('tags (0/3)')).toBeVisible();
  });

  test('renders tri-state checkboxes for each tag', async ({ mockedPage: page }) => {
    await expect(page.getByText('tags (0/3)')).toBeVisible();

    // Each mock tag should have a label element (not option)
    await expect(page.locator('label').filter({ hasText: /^region:us-east$/ })).toBeVisible();
    await expect(page.locator('label').filter({ hasText: /^model:gpt-4$/ })).toBeVisible();
    await expect(page.locator('label').filter({ hasText: /^prompt:v2$/ })).toBeVisible();
  });

  test('tri-state checkbox cycles: neither → include → exclude → neither', async ({ mockedPage: page }) => {
    await expect(page.getByText('tags (0/3)')).toBeVisible();

    // Find the checkbox button for model:gpt-4 by its label
    const label = page.getByText('model:gpt-4');
    const checkbox = label.locator('..').locator('button.checkbox-wrapper');

    // Initially "neither"
    await expect(checkbox).toHaveClass(/neither/);

    // Click → include
    await checkbox.click();
    await expect(checkbox).toHaveClass(/include/);

    // Click → exclude
    await checkbox.click();
    await expect(checkbox).toHaveClass(/exclude/);

    // Click → back to neither
    await checkbox.click();
    await expect(checkbox).toHaveClass(/neither/);
  });

  test('selected count updates as tags are toggled', async ({ mockedPage: page }) => {
    await expect(page.getByText('tags (0/3)')).toBeVisible();

    // Include one tag
    const label1 = page.getByText('model:gpt-4');
    const checkbox1 = label1.locator('..').locator('button.checkbox-wrapper');
    await checkbox1.click(); // include
    await expect(page.getByText('tags (1/3)')).toBeVisible();

    // Include another
    const label2 = page.getByText('prompt:v2');
    const checkbox2 = label2.locator('..').locator('button.checkbox-wrapper');
    await checkbox2.click(); // include
    await expect(page.getByText('tags (2/3)')).toBeVisible();

    // Cycle second to exclude (still counted)
    await checkbox2.click(); // exclude
    await expect(page.getByText('tags (2/3)')).toBeVisible();

    // Cycle second to neither
    await checkbox2.click(); // neither
    await expect(page.getByText('tags (1/3)')).toBeVisible();
  });

  test('apply button sends tag filter in comparison fetch', async ({ mockedPage: page }) => {
    await expect(page.getByText('tags (0/3)')).toBeVisible();

    // Include model:gpt-4
    const label = page.getByText('model:gpt-4');
    const checkbox = label.locator('..').locator('button.checkbox-wrapper');
    await checkbox.click(); // include

    // Capture the next comparison fetch URL
    const comparisonRequest = page.waitForRequest((req) =>
      req.url().includes('/compare') && !req.url().includes('compare-by-ref'),
    );

    // Click apply
    await page.getByRole('button', { name: 'apply' }).click();

    const req = await comparisonRequest;
    expect(req.url()).toContain('include-tags=model:gpt-4');
  });

  test('include and exclude tags both sent in query string', async ({ mockedPage: page }) => {
    await expect(page.getByText('tags (0/3)')).toBeVisible();

    // Include model:gpt-4
    const gpt4Label = page.getByText('model:gpt-4');
    const gpt4Checkbox = gpt4Label.locator('..').locator('button.checkbox-wrapper');
    await gpt4Checkbox.click(); // include

    // Exclude prompt:v2 (click twice: neither → include → exclude)
    const promptLabel = page.getByText('prompt:v2');
    const promptCheckbox = promptLabel.locator('..').locator('button.checkbox-wrapper');
    await promptCheckbox.click(); // include
    await promptCheckbox.click(); // exclude

    const comparisonRequest = page.waitForRequest((req) =>
      req.url().includes('/compare') && !req.url().includes('compare-by-ref'),
    );

    await page.getByRole('button', { name: 'apply' }).click();

    const req = await comparisonRequest;
    expect(req.url()).toContain('include-tags=model:gpt-4');
    expect(req.url()).toContain('exclude-tags=prompt:v2');
  });
});
