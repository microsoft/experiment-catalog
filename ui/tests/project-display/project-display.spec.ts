import { test, expect } from '../fixtures';

const card = (page: import('@playwright/test').Page, name: string) =>
  page.locator('.card-container').filter({
    has: page.locator('button.card').filter({ hasText: name }),
  });

test.describe('Project card display', () => {
  test.beforeEach(async ({ mockedPage: page }) => {
    let projects = [
      { name: 'alpha-project', emoji: 'flask', note: 'Current baseline', ground_truth: 'GT v2' },
      { name: 'beta-project', emoji: null, note: null, ground_truth: null },
    ];
    await page.route('**/api/projects', (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: projects });
      return route.fallback();
    });
    await page.route('**/api/projects/*/display', (route) => {
      const { emoji, note, ground_truth } = route.request().postDataJSON();
      const name = route.request().url().split('/projects/')[1].split('/')[0];
      const updated = { ...projects.find((item) => item.name === name)!, emoji, note, ground_truth };
      projects = projects.map((item) => item.name === name ? updated : item);
      return route.fulfill({ json: updated });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  });

  test('shows read-only values and keeps the edit control at the lower right', async ({ mockedPage: page }) => {
    const projectCard = card(page, 'alpha-project');
    await expect(projectCard.locator('.ground-truth-label')).toHaveText('GROUND TRUTH');
    await expect(projectCard).toContainText('GT v2');
    await expect(card(page, 'beta-project').locator('.ground-truth-label')).toHaveText('GROUND TRUTH');
    await expect(card(page, 'beta-project').locator('.unset')).toHaveText('Unknown');
    await expect(projectCard.locator('.emoji-picker > span')).toHaveText('🧪');
    await expect(projectCard).toContainText('Current baseline');
    await expect(projectCard.getByRole('textbox')).toHaveCount(0);
    await expect(projectCard.getByRole('combobox', { name: 'Emoji for alpha-project' })).toHaveValue('flask');
    await expect(card(page, 'beta-project').locator('.emoji-picker .empty')).toBeVisible();

    const bounds = await projectCard.boundingBox();
    const edit = projectCard.getByRole('button', { name: 'Edit display for alpha-project' });
    await expect(edit).toHaveClass(/btn/);
    await expect(edit).toHaveText('edit');
    const editBounds = await edit.boundingBox();
    const groundTruthBounds = await projectCard.locator('.ground-truth-row').boundingBox();
    const noteBounds = await projectCard.locator('.note').boundingBox();
    expect(editBounds!.x).toBeGreaterThan(bounds!.x + bounds!.width / 2);
    expect(editBounds!.x + editBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    expect(editBounds!.y + editBounds!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
    expect(groundTruthBounds!.y).toBeLessThan(noteBounds!.y);
  });

  test('selects and clears an emoji inline without changing ground truth or note', async ({ mockedPage: page }) => {
    const projectCard = card(page, 'alpha-project');
    const picker = projectCard.getByRole('combobox', { name: 'Emoji for alpha-project' });
    const selected = page.waitForRequest((req) =>
      req.url().endsWith('/projects/alpha-project/display') && req.method() === 'PUT');
    await picker.selectOption('robot');
    expect((await selected).postDataJSON()).toEqual({
      emoji: 'robot',
      note: 'Current baseline',
      ground_truth: 'GT v2',
    });
    await expect(projectCard.locator('.emoji-picker > span')).toHaveText('🤖');
    await expect(projectCard).toContainText('GT v2');
    await expect(projectCard).toContainText('Current baseline');

    await projectCard.getByRole('button', { name: 'Edit display for alpha-project' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit display for alpha-project' });
    await expect(dialog.getByLabel('Emoji')).toHaveValue('robot');
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    const cleared = page.waitForRequest((req) =>
      req.url().endsWith('/projects/alpha-project/display') && req.method() === 'PUT');
    await picker.selectOption('');
    expect((await cleared).postDataJSON()).toEqual({
      emoji: null,
      note: 'Current baseline',
      ground_truth: 'GT v2',
    });
    await expect(projectCard.locator('.emoji-picker .empty')).toBeVisible();
    await expect(projectCard).toContainText('GT v2');
    await expect(projectCard).toContainText('Current baseline');
    expect(page.url()).not.toContain('project=');
  });

  test('restores the inline emoji selection and shows errors after a failed save', async ({ mockedPage: page }) => {
    await page.route('**/api/projects/alpha-project/display', (route) =>
      route.fulfill({ status: 409, body: 'project metadata changed' }),
    );
    const projectCard = card(page, 'alpha-project');
    const picker = projectCard.getByRole('combobox', { name: 'Emoji for alpha-project' });
    await picker.selectOption('robot');
    await expect(projectCard.getByRole('alert')).toHaveText('HTTP 409: project metadata changed');
    await expect(picker).toHaveValue('flask');
    await expect(projectCard.locator('.emoji-picker > span')).toHaveText('🧪');
    await expect(projectCard).toContainText('GT v2');
    await expect(projectCard).toContainText('Current baseline');
  });

  test('opens the editor by keyboard without navigating, then cancels', async ({ mockedPage: page }) => {
    const edit = card(page, 'alpha-project').getByRole('button', { name: 'Edit display for alpha-project' });
    await edit.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Edit display for alpha-project' });
    await expect(dialog).toBeVisible();
    for (const label of ['Cancel', 'Save']) {
      await expect(dialog.getByRole('button', { name: label })).toHaveClass(/btn/);
    }
    await expect(dialog.getByRole('button', { name: 'Clear' })).toHaveCount(0);
    await expect(dialog.getByLabel('Emoji')).toHaveValue('flask');
    await expect(dialog.getByLabel('Ground truth')).toHaveValue('GT v2');
    await expect(dialog.getByLabel('Note')).toHaveValue('Current baseline');
    await dialog.getByLabel('Note').fill('Discard me');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(edit).toBeFocused();
    await expect(card(page, 'alpha-project')).toContainText('Current baseline');
    expect(page.url()).not.toContain('project=');
  });

  test('saves all display fields in a single request', async ({ mockedPage: page }) => {
    await card(page, 'beta-project').getByRole('button', { name: 'Edit display for beta-project' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit display for beta-project' });
    await dialog.getByLabel('Emoji').selectOption('robot');
    await dialog.getByLabel('Ground truth').fill('Dataset v3');
    await dialog.getByLabel('Note').fill('Ready for evaluation');
    const request = page.waitForRequest((req) =>
      req.url().endsWith('/projects/beta-project/display') && req.method() === 'PUT');
    await dialog.getByRole('button', { name: 'Save' }).click();
    expect((await request).postDataJSON()).toEqual({
      emoji: 'robot',
      ground_truth: 'Dataset v3',
      note: 'Ready for evaluation',
    });
    await expect(dialog).not.toBeVisible();
    await expect(card(page, 'beta-project').locator('.emoji-picker > span')).toHaveText('🤖');
    await expect(card(page, 'beta-project')).toContainText('Dataset v3');
    await expect(card(page, 'beta-project').locator('.ground-truth-row')).toContainText('Dataset v3');
    await expect(card(page, 'beta-project').locator('.unset')).toHaveCount(0);
    await expect(card(page, 'beta-project')).toContainText('Ready for evaluation');
    expect(page.url()).not.toContain('project=');
  });

  test('clears all fields through the same endpoint', async ({ mockedPage: page }) => {
    await card(page, 'alpha-project').getByRole('button', { name: 'Edit display for alpha-project' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit display for alpha-project' });
    await dialog.getByLabel('Emoji').selectOption('');
    await dialog.getByLabel('Ground truth').fill('');
    await dialog.getByLabel('Note').fill('');
    await expect(dialog.getByLabel('Emoji')).toHaveValue('');
    await expect(dialog.getByLabel('Ground truth')).toHaveValue('');
    await expect(dialog.getByLabel('Note')).toHaveValue('');
    await expect(card(page, 'alpha-project').locator('.ground-truth-row')).toContainText('GT v2');
    const request = page.waitForRequest((req) =>
      req.url().endsWith('/projects/alpha-project/display') && req.method() === 'PUT');
    await dialog.getByRole('button', { name: 'Save' }).click();
    expect((await request).postDataJSON()).toEqual({ emoji: null, ground_truth: null, note: null });
    await expect(card(page, 'alpha-project').locator('.emoji-picker .empty')).toHaveText('✦');
    await expect(card(page, 'alpha-project')).not.toContainText('GT v2');
    await expect(card(page, 'alpha-project').locator('.ground-truth-label')).toHaveText('GROUND TRUTH');
    await expect(card(page, 'alpha-project').locator('.unset')).toHaveText('Unknown');
    await expect(card(page, 'alpha-project')).not.toContainText('Current baseline');
  });

  test('limits text fields and keeps save failures visible for retry', async ({ mockedPage: page }) => {
    await page.route('**/api/projects/alpha-project/display', (route) =>
      route.fulfill({ status: 409, body: 'project metadata changed' }),
    );
    await card(page, 'alpha-project').getByRole('button', { name: 'Edit display for alpha-project' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit display for alpha-project' });
    await dialog.getByLabel('Ground truth').fill('x'.repeat(45));
    await dialog.getByLabel('Note').fill('y'.repeat(45));
    await expect(dialog.getByLabel('Ground truth')).toHaveValue('x'.repeat(40));
    await expect(dialog.getByLabel('Note')).toHaveValue('y'.repeat(40));
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('HTTP 409: project metadata changed');
    await expect(dialog).toBeVisible();
    await expect(card(page, 'alpha-project')).toContainText('GT v2');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
  });
});
