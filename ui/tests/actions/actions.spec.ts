import { test, expect } from '../fixtures';

/**
 * Baseline and statistics action button tests.
 *
 * These tests cover the "use the project baseline", "set this experiment
 * as the project baseline", and "compute statistics" buttons on ExperimentPage,
 * plus the "set this permutation as the experiment baseline" button on SetPage.
 *
 * Each action is gated by a confirmation checkbox.
 */
test.describe('Experiment page action buttons', () => {
  const base = '/?project=alpha-project&experiment=exp-001';

  test.beforeEach(async ({ mockedPage: page }) => {
    await page.goto(base);
    await expect(
      page.getByRole('heading', { name: /EXPERIMENT: exp-001/ }),
    ).toBeVisible();
  });

  // ── Use the project baseline ─────────────────────────────────────────

  test('"use the project baseline" button is disabled by default', async ({ mockedPage: page }) => {
    const btn = page.getByRole('button', { name: 'use the project baseline' });
    await expect(btn).toBeDisabled();
  });

  test('checking confirm enables "use the project baseline"', async ({ mockedPage: page }) => {
    const checkbox = page.getByRole('checkbox', {
      name: /Confirm set as project baseline/,
    }).first();
    const btn = page.getByRole('button', { name: 'use the project baseline' });

    await checkbox.check();
    await expect(btn).toBeEnabled();

    await checkbox.uncheck();
    await expect(btn).toBeDisabled();
  });

  test('"use the project baseline" sends PATCH request', async ({ mockedPage: page }) => {
    const patchRequest = page.waitForRequest(
      (req) =>
        req.url().includes('/sets/:project/baseline') &&
        req.method() === 'PATCH',
    );

    const checkbox = page.getByRole('checkbox', {
      name: /Confirm set as project baseline/,
    }).first();
    await checkbox.check();
    await page.getByRole('button', { name: 'use the project baseline' }).click();

    const req = await patchRequest;
    expect(req.method()).toBe('PATCH');
    expect(req.url()).toContain(
      '/api/projects/alpha-project/experiments/exp-001/sets/:project/baseline',
    );
  });

  // ── Set as project baseline ──────────────────────────────────────────

  test('"set this experiment as the project baseline" is disabled by default', async ({
    mockedPage: page,
  }) => {
    const btn = page.getByRole('button', {
      name: 'set this experiment as the project baseline',
    });
    await expect(btn).toBeDisabled();
  });

  test('checking confirm enables "set as project baseline"', async ({ mockedPage: page }) => {
    // This is the second checkbox with the same aria-label pattern
    const checkboxes = page.getByRole('checkbox', {
      name: /Confirm set as project baseline/,
    });
    // Use .nth(1) for the second checkbox
    const checkbox = checkboxes.nth(1);
    const btn = page.getByRole('button', {
      name: 'set this experiment as the project baseline',
    });

    await checkbox.check();
    await expect(btn).toBeEnabled();

    await checkbox.uncheck();
    await expect(btn).toBeDisabled();
  });

  test('"set as project baseline" sends PATCH to /baseline', async ({ mockedPage: page }) => {
    const patchRequest = page.waitForRequest(
      (req) =>
        req.url().includes('/experiments/exp-001/baseline') &&
        !req.url().includes('/sets/') &&
        req.method() === 'PATCH',
    );

    const checkboxes = page.getByRole('checkbox', {
      name: /Confirm set as project baseline/,
    });
    await checkboxes.nth(1).check();
    await page
      .getByRole('button', { name: 'set this experiment as the project baseline' })
      .click();

    const req = await patchRequest;
    expect(req.method()).toBe('PATCH');
  });

  // ── Compute statistics ───────────────────────────────────────────────

  test('"compute statistics" button is disabled by default', async ({ mockedPage: page }) => {
    const btn = page.getByRole('button', {
      name: 'compute statistics for this experiment',
    });
    await expect(btn).toBeDisabled();
  });

  test('checking confirm enables "compute statistics"', async ({ mockedPage: page }) => {
    const checkbox = page.getByRole('checkbox', {
      name: /Confirm compute statistics/,
    });
    const btn = page.getByRole('button', {
      name: 'compute statistics for this experiment',
    });

    await checkbox.check();
    await expect(btn).toBeEnabled();

    await checkbox.uncheck();
    await expect(btn).toBeDisabled();
  });

  test('"compute statistics" sends POST with project and experiment', async ({
    mockedPage: page,
  }) => {
    // Dismiss the alert dialog that fires on success
    page.on('dialog', async (dialog) => {
      try { await dialog.accept(); } catch { /* page may close before accept */ }
    });

    const postRequest = page.waitForRequest(
      (req) =>
        req.url().includes('/api/analysis/statistics') &&
        req.method() === 'POST',
    );

    await page.getByRole('checkbox', { name: /Confirm compute statistics/ }).check();
    await page
      .getByRole('button', { name: 'compute statistics for this experiment' })
      .click();

    const req = await postRequest;
    const body = req.postDataJSON();
    expect(body.project).toBe('alpha-project');
    expect(body.experiment).toBe('exp-001');
  });
});

test.describe('SetPage baseline button', () => {
  const base = '/?project=alpha-project&experiment=exp-001&page=set:set-a';

  test('"set this permutation as the experiment baseline" is disabled by default', async ({
    mockedPage: page,
  }) => {
    await page.goto(base);
    await expect(page.getByText('SET: set-a')).toBeVisible();

    const btn = page.getByRole('button', {
      name: /set this permutation as the experiment baseline/,
    });
    await expect(btn).toBeDisabled();
  });

  test('sends PATCH to set baseline when confirmed and clicked', async ({ mockedPage: page }) => {
    await page.goto(base);
    await expect(page.getByText('SET: set-a')).toBeVisible();

    const patchRequest = page.waitForRequest(
      (req) =>
        req.url().includes('/sets/set-a/baseline') &&
        req.method() === 'PATCH',
    );

    await page
      .getByRole('checkbox', { name: /Confirm set as project baseline/ })
      .check();
    await page
      .getByRole('button', { name: /set this permutation as the experiment baseline/ })
      .click();

    const req = await patchRequest;
    expect(req.method()).toBe('PATCH');
    expect(req.url()).toContain(
      '/api/projects/alpha-project/experiments/exp-001/sets/set-a/baseline',
    );
  });
});
