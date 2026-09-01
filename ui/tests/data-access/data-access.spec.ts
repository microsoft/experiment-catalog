import { test, expect } from '../fixtures';

test.describe('Experiment data access', () => {
  test.beforeEach(async ({ mockedPage: page }) => {
    await page.goto('/?project=alpha-project&experiment=exp-001');
    await page.getByRole('button', { name: 'download' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Data and files' }),
    ).toBeVisible();
  });

  test('artifact type controls update independently', async ({ mockedPage: page }) => {
    const inference = page.getByRole('checkbox', { name: 'inference files' });
    const evaluation = page.getByRole('checkbox', { name: 'evaluation files' });
    const manifest = page.getByRole('link', { name: 'manifest' });

    await expect(inference).toBeChecked();
    await expect(evaluation).toBeChecked();

    await inference.uncheck();

    await expect(inference).not.toBeChecked();
    await expect(evaluation).toBeChecked();
    await expect(manifest).toHaveAttribute(
      'href',
      /types=evaluation&format=jsonl/,
    );
    await expect(manifest).toHaveAttribute(
      'download',
      'exp-001-evaluation-artifacts.jsonl',
    );
    const artifactSection = page.locator('section', {
      has: page.getByRole('heading', { name: 'Inference and evaluation files' }),
    });
    await artifactSection.getByText('Python example').click();
    await expect(artifactSection.locator('code')).toContainText(
      '# Selected artifact types: evaluation',
    );
    await expect(artifactSection.locator('code')).toContainText(
      'with open("exp-001-evaluation-artifacts.jsonl")',
    );

    await inference.check();
    await evaluation.uncheck();

    await expect(inference).toBeChecked();
    await expect(evaluation).not.toBeChecked();
    await expect(manifest).toHaveAttribute(
      'href',
      /types=inference&format=jsonl/,
    );
    await expect(manifest).toHaveAttribute(
      'download',
      'exp-001-inference-artifacts.jsonl',
    );
    await expect(artifactSection.locator('code')).toContainText(
      '# Selected artifact types: inference',
    );
  });
});
