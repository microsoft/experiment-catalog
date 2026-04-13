import { test, expect } from '../fixtures';

test.describe('Navigation', () => {
  test('shows projects list on initial load', async ({ mockedPage: page }) => {
    await page.goto('/');

    // Heading
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

    // All three mock projects render
    await expect(page.getByRole('button', { name: 'alpha-project' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'beta-project' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'gamma-project' })).toBeVisible();
  });

  test('clicking a project navigates to experiments list', async ({ mockedPage: page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'alpha-project' }).click();

    // Should show experiments page
    await expect(
      page.getByRole('heading', { name: /Experiments in alpha-project/ }),
    ).toBeVisible();

    // Both mock experiments render
    await expect(page.getByRole('button', { name: 'exp-001' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'exp-002' }).first()).toBeVisible();

    // URL updates with project param
    expect(page.url()).toContain('project=alpha-project');
  });

  test('clicking an experiment navigates to experiment page', async ({ mockedPage: page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'alpha-project' }).click();
    await expect(
      page.getByRole('heading', { name: /Experiments in alpha-project/ }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'exp-001' }).first().click();

    // Should show experiment detail page
    await expect(
      page.getByRole('heading', { name: /PROJECT: alpha-project/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /EXPERIMENT: exp-001/ }),
    ).toBeVisible();

    // URL has both params
    expect(page.url()).toContain('project=alpha-project');
    expect(page.url()).toContain('experiment=exp-001');
  });

  test('back button from experiments list returns to projects', async ({ mockedPage: page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'alpha-project' }).click();
    await expect(
      page.getByRole('heading', { name: /Experiments in alpha-project/ }),
    ).toBeVisible();

    // Click back
    await page.getByRole('button', { name: 'back' }).click();

    // Should be back to projects list
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    expect(page.url()).not.toContain('project=');
  });

  test('back button from experiment page returns to experiments list', async ({ mockedPage: page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'alpha-project' }).click();
    await expect(
      page.getByRole('heading', { name: /Experiments in alpha-project/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'exp-001' }).first().click();
    await expect(
      page.getByRole('heading', { name: /EXPERIMENT: exp-001/ }),
    ).toBeVisible();

    // Click back
    await page.getByRole('button', { name: 'back' }).click();

    // Should be back to experiments list
    await expect(
      page.getByRole('heading', { name: /Experiments in alpha-project/ }),
    ).toBeVisible();
    expect(page.url()).not.toContain('experiment=');
    expect(page.url()).toContain('project=alpha-project');
  });

  test('direct navigation via query string loads correct view', async ({ mockedPage: page }) => {
    // Navigate directly to an experiment
    await page.goto('/?project=alpha-project&experiment=exp-001');

    // Should jump straight to experiment page
    await expect(
      page.getByRole('heading', { name: /PROJECT: alpha-project/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /EXPERIMENT: exp-001/ }),
    ).toBeVisible();
  });
});
