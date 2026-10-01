import { test, expect } from '../fixtures';

test.describe('Navigation', () => {
  test('shows projects list on initial load', async ({ mockedPage: page }) => {
    await page.goto('/');

    // Heading
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

    // All three mock projects render
    await expect(page.getByRole('button', { name: 'alpha-project', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'beta-project', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'gamma-project', exact: true })).toBeVisible();
  });

  test('clicking a project navigates to experiments list', async ({ mockedPage: page }) => {
    let detailRequests = 0;
    await page.route('**/api/projects/alpha-project', (route) => {
      detailRequests++;
      return route.fulfill({ status: 500, body: 'unexpected detail request' });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'alpha-project', exact: true }).click();

    // Should show experiments page
    await expect(
      page.getByRole('heading', { name: /Experiments in alpha-project/ }),
    ).toBeVisible();

    // Both mock experiments render
    await expect(page.locator('button.card').filter({ hasText: 'exp-001' })).toBeVisible();
    await expect(page.locator('button.card').filter({ hasText: 'exp-002' })).toBeVisible();

    // URL updates with project param
    expect(page.url()).toContain('project=alpha-project');
    expect(detailRequests).toBe(0);
  });

  test('clicking an experiment navigates to experiment page', async ({ mockedPage: page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'alpha-project', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: /Experiments in alpha-project/ }),
    ).toBeVisible();

    await page.locator('button.card').filter({ hasText: 'exp-001' }).click();

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
    await page.getByRole('button', { name: 'alpha-project', exact: true }).click();
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
    await page.getByRole('button', { name: 'alpha-project', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: /Experiments in alpha-project/ }),
    ).toBeVisible();
    await page.locator('button.card').filter({ hasText: 'exp-001' }).click();
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

  for (const { view, url, heading } of [
    { view: 'project', url: '/?project=alpha-project', heading: 'Experiments in alpha-project' },
    { view: 'experiment', url: '/?project=alpha-project&experiment=exp-001', heading: 'EXPERIMENT: exp-001' },
    { view: 'set', url: '/?project=alpha-project&experiment=exp-001&page=set:set-a', heading: 'EXPERIMENT: exp-001' },
    { view: 'chart', url: '/?project=alpha-project&experiment=exp-001&page=chart', heading: 'EXPERIMENT: exp-001' },
  ]) {
    test(`direct ${view} link fetches only the selected project`, async ({ mockedPage: page }) => {
      let listRequests = 0;
      let detailRequests = 0;
      await page.route('**/api/projects', (route) => {
        listRequests++;
        return route.fulfill({ status: 500, body: 'unexpected collection request' });
      });
      await page.route('**/api/projects/alpha-project', (route) => {
        detailRequests++;
        return route.fulfill({ json: { name: 'alpha-project', ground_truth: 'GT v2' } });
      });

      await page.goto(url);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      expect(detailRequests).toBe(1);
      expect(listRequests).toBe(0);
      if (view === 'experiment' || view === 'set') {
        await expect(page.locator('.meta-row').filter({ hasText: 'GRND TRUTH' })).toContainText('GT v2');
      }
    });
  }
});
