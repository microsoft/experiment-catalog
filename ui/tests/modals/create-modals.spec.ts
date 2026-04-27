import { test, expect } from '../fixtures';
import * as data from '../mocks/data';

test.describe('Create Project modal', () => {
  test.beforeEach(async ({ mockedPage: page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  });

  test('opens modal when clicking create project', async ({ mockedPage: page }) => {
    await page.getByRole('button', { name: '+ create project' }).click();
    await expect(page.getByRole('heading', { name: 'Create Project' })).toBeVisible();
  });

  test('submit is disabled when name is empty', async ({ mockedPage: page }) => {
    await page.getByRole('button', { name: '+ create project' }).click();
    const submitBtn = page.getByRole('button', { name: 'Create Project', exact: true });
    await expect(submitBtn).toBeDisabled();
  });

  test('submit is enabled after typing a name', async ({ mockedPage: page }) => {
    await page.getByRole('button', { name: '+ create project' }).click();
    await page.locator('#project-name').fill('new-project');
    const submitBtn = page.getByRole('button', { name: 'Create Project', exact: true });
    await expect(submitBtn).toBeEnabled();
  });

  test('successful submit closes modal and refreshes list', async ({ mockedPage: page }) => {
    // Track POST request
    const postRequest = page.waitForRequest(
      (req) => req.url().includes('/api/projects') && req.method() === 'POST',
    );

    await page.getByRole('button', { name: '+ create project' }).click();
    await page.locator('#project-name').fill('new-project');
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();

    const req = await postRequest;
    const body = req.postDataJSON();
    expect(body.name).toBe('new-project');

    // Modal should close
    await expect(page.getByRole('heading', { name: 'Create Project' })).not.toBeVisible();
  });

  test('server error displays error message', async ({ mockedPage: page }) => {
    // Override POST to return error
    await page.route('**/api/projects', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 400, body: 'Project name already exists' });
      }
      return route.fulfill({ json: data.projectsList });
    });

    await page.getByRole('button', { name: '+ create project' }).click();
    await page.locator('#project-name').fill('duplicate-project');
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();

    await expect(page.locator('.error-message')).toBeVisible();
    await expect(page.locator('.error-message')).toContainText('Project name already exists');
  });

  test('cancel button closes modal', async ({ mockedPage: page }) => {
    await page.getByRole('button', { name: '+ create project' }).click();
    await expect(page.getByRole('heading', { name: 'Create Project' })).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Create Project' })).not.toBeVisible();
  });

  test('Escape key closes modal', async ({ mockedPage: page }) => {
    await page.getByRole('button', { name: '+ create project' }).click();
    await expect(page.getByRole('heading', { name: 'Create Project' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Create Project' })).not.toBeVisible();
  });

  test('form resets after cancel', async ({ mockedPage: page }) => {
    await page.getByRole('button', { name: '+ create project' }).click();
    await page.locator('#project-name').fill('test-name');
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Re-open modal — input should be empty
    await page.getByRole('button', { name: '+ create project' }).click();
    await expect(page.locator('#project-name')).toHaveValue('');
  });
});

test.describe('Create Experiment modal', () => {
  test.beforeEach(async ({ mockedPage: page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'alpha-project' }).click();
    await expect(
      page.getByRole('heading', { name: /Experiments in alpha-project/ }),
    ).toBeVisible();
  });

  test('opens modal with project name in title', async ({ mockedPage: page }) => {
    await page.getByRole('button', { name: '+ create experiment' }).click();
    await expect(
      page.getByRole('heading', { name: 'Create Experiment in alpha-project' }),
    ).toBeVisible();
  });

  test('submit disabled when name or hypothesis is empty', async ({ mockedPage: page }) => {
    await page.getByRole('button', { name: '+ create experiment' }).click();
    const submitBtn = page.getByRole('button', { name: 'Create Experiment', exact: true });

    // Both empty
    await expect(submitBtn).toBeDisabled();

    // Only name filled
    await page.locator('#experiment-name').fill('exp-test');
    await expect(submitBtn).toBeDisabled();

    // Clear name, fill hypothesis
    await page.locator('#experiment-name').clear();
    await page.locator('#hypothesis').fill('We believe that...');
    await expect(submitBtn).toBeDisabled();
  });

  test('submit enabled when both fields are filled', async ({ mockedPage: page }) => {
    await page.getByRole('button', { name: '+ create experiment' }).click();
    await page.locator('#experiment-name').fill('exp-test');
    await page.locator('#hypothesis').fill('We believe that...');
    const submitBtn = page.getByRole('button', { name: 'Create Experiment', exact: true });
    await expect(submitBtn).toBeEnabled();
  });

  test('successful submit sends correct POST body', async ({ mockedPage: page }) => {
    const postRequest = page.waitForRequest(
      (req) =>
        req.url().includes('/api/projects/alpha-project/experiments') &&
        req.method() === 'POST',
    );

    await page.getByRole('button', { name: '+ create experiment' }).click();
    await page.locator('#experiment-name').fill('exp-new');
    await page.locator('#hypothesis').fill('Testing improves quality');
    await page.getByRole('button', { name: 'Create Experiment', exact: true }).click();

    const req = await postRequest;
    const body = req.postDataJSON();
    expect(body.name).toBe('exp-new');
    expect(body.hypothesis).toBe('Testing improves quality');

    // Modal should close
    await expect(
      page.getByRole('heading', { name: /Create Experiment/ }),
    ).not.toBeVisible();
  });

  test('server error displays in modal', async ({ mockedPage: page }) => {
    await page.route('**/api/projects/*/experiments', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 400, body: 'Experiment name invalid' });
      }
      return route.fulfill({ json: data.experimentsList });
    });

    await page.getByRole('button', { name: '+ create experiment' }).click();
    await page.locator('#experiment-name').fill('bad name!');
    await page.locator('#hypothesis').fill('Some hypothesis');
    await page.getByRole('button', { name: 'Create Experiment', exact: true }).click();

    await expect(page.locator('.error-message')).toContainText('Experiment name invalid');
  });

  test('cancel resets form', async ({ mockedPage: page }) => {
    await page.getByRole('button', { name: '+ create experiment' }).click();
    await page.locator('#experiment-name').fill('will-be-cleared');
    await page.locator('#hypothesis').fill('disappears');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: '+ create experiment' }).click();
    await expect(page.locator('#experiment-name')).toHaveValue('');
    await expect(page.locator('#hypothesis')).toHaveValue('');
  });
});
