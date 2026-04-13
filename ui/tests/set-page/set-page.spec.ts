import { test, expect } from '../fixtures';
import * as data from '../mocks/data';

/**
 * SetPage drill-down tests.
 *
 * Reached via query-param URL: /?project=…&experiment=…&page=set:<name>
 */
test.describe('SetPage drill-down', () => {
  const base = '/?project=alpha-project&experiment=exp-001&page=set:set-a';

  test('displays project, experiment, and set headings', async ({ mockedPage: page }) => {
    await page.goto(base);
    await expect(page.getByText('PROJECT: alpha-project')).toBeVisible();
    await expect(page.getByText('EXPERIMENT: exp-001')).toBeVisible();
    await expect(page.getByText('SET: set-a')).toBeVisible();
  });

  test('back button navigates away from set page', async ({ mockedPage: page }) => {
    await page.goto(base);
    await expect(page.getByText('SET: set-a')).toBeVisible();
    await page.getByRole('button', { name: 'back' }).click();
    // The SET heading should disappear — we're on the experiment comparison page
    await expect(page.locator('h3', { hasText: 'SET: set-a' })).not.toBeVisible();
  });

  test('shows hypothesis', async ({ mockedPage: page }) => {
    await page.goto(base);
    await expect(page.getByText(data.singleExperiment.hypothesis)).toBeVisible();
  });

  test('comparison table renders with Source and Ref columns', async ({ mockedPage: page }) => {
    await page.goto(base);
    await expect(page.locator('th', { hasText: 'Source' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Ref' })).toBeVisible();
  });

  test('metric columns appear in table header', async ({ mockedPage: page }) => {
    await page.goto(base);
    for (const metricName of Object.keys(data.metricDefinitions)) {
      await expect(page.locator('thead').getByText(metricName)).toBeVisible();
    }
  });

  test('project baseline row is rendered', async ({ mockedPage: page }) => {
    await page.goto(base);
    // Rendered as "Project Baseline / <set-name>"
    await expect(page.getByText(/Project Baseline \//)).toBeVisible();
  });

  test('experiment baseline row is rendered', async ({ mockedPage: page }) => {
    await page.goto(base);
    // Rendered as "Experiment Baseline / <set-name>"
    await expect(page.getByText(/Experiment Baseline \//)).toBeVisible();
  });

  test('set aggregate row is rendered', async ({ mockedPage: page }) => {
    await page.goto(base);
    // Rendered as "Set Aggregate / <set-name>"
    await expect(page.getByText(/Set Aggregate \//)).toBeVisible();
  });

  test('toggle set iterations shows iteration rows', async ({ mockedPage: page }) => {
    await page.goto(base);
    // Iteration ref column should be hidden by default
    const refCell = page.locator('td', { hasText: data.setAResult.ref }).last();

    // Toggle open — fetches and shows
    await page.getByRole('button', { name: /toggle set iterations/ }).click();
    // Wait for the "Set / set-a" source label to appear (from iteration rows)
    await expect(page.getByText('Set / set-a')).toBeVisible();

    // Toggle closed
    await page.getByRole('button', { name: /toggle set iterations/ }).click();
    await expect(page.getByText('Set / set-a')).not.toBeVisible();
  });

  test('toggle baseline iterations shows baseline rows', async ({ mockedPage: page }) => {
    await page.goto(base);
    const toggleBtn = page.getByRole('button', { name: /toggle baseline iterations/ });

    await toggleBtn.click();
    await expect(page.getByText('Baseline / baseline', { exact: true })).toBeVisible();

    await toggleBtn.click();
    await expect(page.getByText('Baseline / baseline', { exact: true })).not.toBeVisible();
  });

  test('confirm baseline checkbox gates the baseline button', async ({ mockedPage: page }) => {
    await page.goto(base);
    const confirmCheckbox = page.getByRole('checkbox', {
      name: /Confirm set as project baseline/,
    });
    const baselineBtn = page.getByRole('button', {
      name: /set this permutation as the experiment baseline/,
    });

    // Button should be disabled initially
    await expect(baselineBtn).toBeDisabled();

    // Check the confirm checkbox
    await confirmCheckbox.check();
    await expect(baselineBtn).toBeEnabled();

    // Uncheck reverts
    await confirmCheckbox.uncheck();
    await expect(baselineBtn).toBeDisabled();
  });

  test('inference and evaluation links in iteration rows', async ({ mockedPage: page }) => {
    await page.goto(base);
    // Toggle set iterations to reveal detail rows
    await page.getByRole('button', { name: /toggle set iterations/ }).click();
    await expect(page.getByText('Set / set-a')).toBeVisible();

    // URIs are rendered as buttons: (inf) and (eval) via window.open
    await expect(page.getByRole('button', { name: '(inf)' })).toBeVisible();
    await expect(page.getByRole('button', { name: '(eval)' })).toBeVisible();
  });

  test('annotations render on the aggregate row', async ({ mockedPage: page }) => {
    await page.goto(base);
    // The mock setAResult has annotation { text: 'Run note for set-a', uri: '…' }
    // which should render as a link in the Annotations component on the aggregate row
    await expect(
      page.locator('a.link', { hasText: 'Run note for set-a' }),
    ).toBeVisible();
  });
});
