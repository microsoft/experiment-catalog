import { test, expect } from '../fixtures';
import { experimentsList } from '../mocks/data';

const card = (page: import('@playwright/test').Page, name: string) =>
  page.locator('.card-container').filter({
    has: page.locator('button.card').filter({ hasText: name }),
  });

test.describe('Experiment card display', () => {
  test.beforeEach(async ({ mockedPage: page }) => {
    let experiments = [
      { ...experimentsList[0], emoji: 'rocket', note: 'Promising candidate' },
      { ...experimentsList[1] },
      {
        ...experimentsList[1],
        name: 'exp-long',
        hypothesis: 'A much longer hypothesis that wraps onto several lines because it compares multiple candidate approaches and describes why the expected improvement should occur.',
      },
    ];
    await page.route('**/api/projects/alpha-project/experiments', (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: experiments });
      return route.fallback();
    });
    await page.route('**/api/projects/alpha-project/experiments/*/display', (route) => {
      const { emoji, note } = route.request().postDataJSON();
      const name = route.request().url().split('/experiments/')[1].split('/')[0];
      const updated = { ...experiments.find((item) => item.name === name)!, emoji, note };
      experiments = experiments.map((item) => item.name === name ? updated : item);
      return route.fulfill({ json: updated });
    });
    await page.goto('/?project=alpha-project');
    await expect(page.getByRole('heading', { name: 'Experiments in alpha-project' })).toBeVisible();
  });

  test('shows the note read-only, with a faint empty emoji and a lower-right edit button', async ({ mockedPage: page }) => {
    const experimentCard = card(page, 'exp-001');
    await expect(experimentCard.locator('.emoji-picker > span')).toHaveText('🚀');
    await expect(experimentCard.locator('.note')).toHaveText('Promising candidate');
    await expect(experimentCard.getByRole('textbox')).toHaveCount(0);
    await expect(card(page, 'exp-002').locator('.emoji-picker .empty')).toBeVisible();

    const bounds = await experimentCard.boundingBox();
    const edit = experimentCard.getByRole('button', { name: 'Edit display for exp-001' });
    await expect(edit).toHaveClass(/btn/);
    await expect(edit).toHaveText('edit');
    const editBounds = await edit.boundingBox();
    const noteBounds = await experimentCard.locator('.note').boundingBox();
    expect(editBounds!.x).toBeGreaterThan(bounds!.x + bounds!.width / 2);
    expect(editBounds!.x + editBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    expect(editBounds!.y + editBounds!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
    expect(noteBounds!.y).toBeLessThanOrEqual(editBounds!.y + editBounds!.height);
  });

  test('anchors emoji and note to the bottom beside cards with longer hypotheses', async ({ mockedPage: page }) => {
    const shortCard = card(page, 'exp-001');
    const longCard = card(page, 'exp-long');
    const shortBounds = await shortCard.boundingBox();
    const longBounds = await longCard.boundingBox();
    const shortFooter = await shortCard.locator('.display-row').boundingBox();
    const longFooter = await longCard.locator('.display-row').boundingBox();
    const hypothesis = await shortCard.locator('.hypothesis').boundingBox();
    expect(shortBounds).not.toBeNull();
    expect(longBounds).not.toBeNull();
    expect(shortFooter).not.toBeNull();
    expect(longFooter).not.toBeNull();
    expect(hypothesis).not.toBeNull();
    expect(Math.abs(shortBounds!.y - longBounds!.y)).toBeLessThan(2);
    expect(longBounds!.height).toBeGreaterThan(hypothesis!.height + shortFooter!.height + 60);
    expect(Math.abs(shortFooter!.y + shortFooter!.height - longFooter!.y - longFooter!.height)).toBeLessThan(2);
    expect(shortFooter!.y).toBeGreaterThan(hypothesis!.y + hypothesis!.height + 8);
  });

  test('opens the experiment from empty card space but not from the footer', async ({ mockedPage: page }) => {
    const experimentCard = card(page, 'exp-001');
    const main = await experimentCard.locator('button.card').boundingBox();
    const hypothesis = await experimentCard.locator('.hypothesis').boundingBox();
    const footer = await experimentCard.locator('.display-row').boundingBox();
    expect(main).not.toBeNull();
    expect(hypothesis).not.toBeNull();
    expect(footer).not.toBeNull();
    expect(main!.x).toBeLessThan(hypothesis!.x);
    expect(Math.abs(main!.y + main!.height - footer!.y)).toBeLessThan(2);
    expect(main!.y + main!.height - hypothesis!.y - hypothesis!.height).toBeGreaterThan(24);

    await page.mouse.click(footer!.x + footer!.width / 2, footer!.y + footer!.height - 6);
    await expect(page.getByRole('heading', { name: 'Experiments in alpha-project' })).toBeVisible();

    await page.mouse.click(main!.x + main!.width - 8, footer!.y - 16);
    await expect(page.getByRole('heading', { name: 'EXPERIMENT: exp-001' })).toBeVisible();
  });

  test('selects and clears an emoji inline without changing the note', async ({ mockedPage: page }) => {
    const experimentCard = card(page, 'exp-001');
    const picker = experimentCard.getByRole('combobox', { name: 'Emoji for exp-001' });
    await picker.focus();
    await expect(picker).toBeFocused();
    const selected = page.waitForRequest((req) =>
      req.url().endsWith('/experiments/exp-001/display') && req.method() === 'PUT');
    await picker.selectOption('target');
    expect((await selected).postDataJSON()).toEqual({ emoji: 'target', note: 'Promising candidate' });
    await expect(experimentCard.locator('.emoji-picker > span')).toHaveText('🎯');
    await expect(experimentCard.locator('.note')).toHaveText('Promising candidate');

    await experimentCard.getByRole('button', { name: 'Edit display for exp-001' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit display for exp-001' });
    await expect(dialog.getByLabel('Emoji')).toHaveValue('target');
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    const cleared = page.waitForRequest((req) =>
      req.url().endsWith('/experiments/exp-001/display') && req.method() === 'PUT');
    await picker.selectOption('');
    expect((await cleared).postDataJSON()).toEqual({ emoji: null, note: 'Promising candidate' });
    await expect(experimentCard.locator('.emoji-picker .empty')).toBeVisible();
    await expect(experimentCard.locator('.note')).toHaveText('Promising candidate');
    expect(page.url()).not.toContain('experiment=');
  });

  test('opens the editor by keyboard and cancels without saving', async ({ mockedPage: page }) => {
    const edit = card(page, 'exp-001').getByRole('button', { name: 'Edit display for exp-001' });
    await edit.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Edit display for exp-001' });
    await expect(dialog).toBeVisible();
    for (const label of ['Cancel', 'Save']) {
      await expect(dialog.getByRole('button', { name: label })).toHaveClass(/btn/);
    }
    await expect(dialog.getByRole('button', { name: 'Clear' })).toHaveCount(0);
    await expect(dialog.getByLabel('Emoji')).toHaveValue('rocket');
    await expect(dialog.getByLabel('Note')).toHaveValue('Promising candidate');
    await dialog.getByLabel('Note').fill('Discard me');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(edit).toBeFocused();
    await expect(card(page, 'exp-001').locator('.note')).toHaveText('Promising candidate');
  });

  test('saves emoji and note together in the modal, including clearing', async ({ mockedPage: page }) => {
    await card(page, 'exp-001').getByRole('button', { name: 'Edit display for exp-001' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit display for exp-001' });
    await dialog.getByLabel('Emoji').selectOption('robot');
    await dialog.getByLabel('Note').fill('Short note');
    const submitted = page.waitForRequest((req) =>
      req.url().endsWith('/experiments/exp-001/display') && req.method() === 'PUT');
    await dialog.getByRole('button', { name: 'Save' }).click();
    expect((await submitted).postDataJSON()).toEqual({ emoji: 'robot', note: 'Short note' });
    await expect(dialog).not.toBeVisible();
    await expect(card(page, 'exp-001').locator('.emoji-picker > span')).toHaveText('🤖');
    await expect(card(page, 'exp-001').locator('.note')).toHaveText('Short note');

    await card(page, 'exp-001').getByRole('button', { name: 'Edit display for exp-001' }).click();
    const clearedDialog = page.getByRole('dialog', { name: 'Edit display for exp-001' });
    await clearedDialog.getByLabel('Emoji').selectOption('');
    await clearedDialog.getByLabel('Note').fill('');
    await expect(clearedDialog.getByLabel('Emoji')).toHaveValue('');
    await expect(clearedDialog.getByLabel('Note')).toHaveValue('');
    await expect(card(page, 'exp-001').locator('.note')).toHaveText('Short note');
    const cleared = page.waitForRequest((req) =>
      req.url().endsWith('/experiments/exp-001/display') && req.method() === 'PUT');
    await clearedDialog.getByRole('button', { name: 'Save' }).click();
    expect((await cleared).postDataJSON()).toEqual({ emoji: null, note: null });
    await expect(card(page, 'exp-001').locator('.emoji-picker .empty')).toBeVisible();
    await expect(card(page, 'exp-001').locator('.note')).toHaveCount(0);
    expect(page.url()).not.toContain('experiment=');
  });

  test('limits notes and keeps modal save errors visible for retry', async ({ mockedPage: page }) => {
    await page.route('**/api/projects/alpha-project/experiments/exp-001/display', (route) =>
      route.fulfill({ status: 404, body: 'experiment not found.' }),
    );
    await card(page, 'exp-001').getByRole('button', { name: 'Edit display for exp-001' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit display for exp-001' });
    const note = dialog.getByLabel('Note');
    await note.fill('x'.repeat(45));
    await expect(note).toHaveValue('x'.repeat(40));
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByRole('alert'))
      .toHaveText('HTTP 404: experiment not found.');
    await expect(note).toHaveValue('x'.repeat(40));
    await expect(card(page, 'exp-001').locator('.note')).toHaveText('Promising candidate');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('restores the inline emoji after a failed save', async ({ mockedPage: page }) => {
    await page.route('**/api/projects/alpha-project/experiments/exp-001/display', (route) =>
      route.fulfill({ status: 409, body: 'experiment metadata changed' }),
    );
    const experimentCard = card(page, 'exp-001');
    const picker = experimentCard.getByRole('combobox', { name: 'Emoji for exp-001' });
    await picker.selectOption('robot');
    await expect(experimentCard.getByRole('alert')).toHaveText('HTTP 409: experiment metadata changed');
    await expect(picker).toHaveValue('rocket');
    await expect(experimentCard.locator('.note')).toHaveText('Promising candidate');
  });

  test('keeps the controls inside the card with a full-length note', async ({ mockedPage: page }) => {
    const initialBounds = await card(page, 'exp-001').boundingBox();
    await card(page, 'exp-001').getByRole('button', { name: 'Edit display for exp-001' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit display for exp-001' });
    await dialog.getByLabel('Note').fill('x'.repeat(40));
    await dialog.getByRole('button', { name: 'Save' }).click();
    const bounds = await card(page, 'exp-001').boundingBox();
    const emojiBounds = await card(page, 'exp-001').locator('.emoji-picker').boundingBox();
    const noteBounds = await card(page, 'exp-001').locator('.note').boundingBox();
    const editBounds = await card(page, 'exp-001').locator('button.edit').boundingBox();
    expect(bounds).not.toBeNull();
    expect(emojiBounds).not.toBeNull();
    expect(noteBounds).not.toBeNull();
    expect(bounds!.width).toBe(initialBounds!.width);
    expect(emojiBounds!.x).toBeGreaterThanOrEqual(bounds!.x);
    expect(noteBounds!.x + noteBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    expect(noteBounds!.x + noteBounds!.width).toBeLessThanOrEqual(editBounds!.x);
  });
});
