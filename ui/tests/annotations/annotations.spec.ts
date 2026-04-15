import { test, expect } from '../fixtures';
import * as data from '../mocks/data';

/**
 * CreateAnnotationModal and annotation creation flow tests.
 *
 * The "+ annotation" button appears in ComparisonTableHeader for each set column.
 * Clicking it opens CreateAnnotationModal, which POSTs to /api/projects/.../results.
 */
test.describe('Create Annotation modal', () => {
  const base = '/?project=alpha-project&experiment=exp-001';

  test.beforeEach(async ({ mockedPage: page }) => {
    await page.goto(base);
    await expect(
      page.getByRole('heading', { name: /EXPERIMENT: exp-001/ }),
    ).toBeVisible();
  });

  test('+ annotation button is visible in set column headers', async ({ mockedPage: page }) => {
    // Each set column header should have a "+ annotation" link
    const annotationLinks = page.locator('button.add-annotation-link');
    await expect(annotationLinks.first()).toBeVisible();
  });

  test('clicking + annotation opens the modal', async ({ mockedPage: page }) => {
    // Click the first "+ annotation" button (on a set column)
    await page.locator('button.add-annotation-link').first().click();
    await expect(
      page.getByRole('heading', { name: /Add Annotation to Set/ }),
    ).toBeVisible();
  });

  test('submit is disabled when annotation text is empty', async ({ mockedPage: page }) => {
    await page.locator('button.add-annotation-link').first().click();
    await expect(
      page.getByRole('heading', { name: /Add Annotation to Set/ }),
    ).toBeVisible();

    const submitBtn = page.getByRole('button', { name: 'Add Annotation' });
    await expect(submitBtn).toBeDisabled();
  });

  test('submit is enabled after typing annotation text', async ({ mockedPage: page }) => {
    await page.locator('button.add-annotation-link').first().click();
    await page.locator('#annotation-text').fill('Test annotation');

    const submitBtn = page.getByRole('button', { name: 'Add Annotation' });
    await expect(submitBtn).toBeEnabled();
  });

  test('successful submit sends correct POST body', async ({ mockedPage: page }) => {
    const postRequest = page.waitForRequest(
      (req) =>
        req.url().includes('/results') &&
        req.method() === 'POST',
    );

    // Use the last + annotation button (on a set column, not a baseline column)
    await page.locator('button.add-annotation-link').last().click();
    await page.locator('#annotation-text').fill('Important observation');
    await page.locator('#annotation-uri').fill('https://example.com/details');
    await page.getByRole('button', { name: 'Add Annotation' }).click();

    const req = await postRequest;
    const body = req.postDataJSON();
    expect(body.annotations).toBeDefined();
    expect(body.annotations[0].text).toBe('Important observation');
    expect(body.annotations[0].uri).toBe('https://example.com/details');
  });

  test('successful submit closes modal', async ({ mockedPage: page }) => {
    await page.locator('button.add-annotation-link').first().click();
    await expect(
      page.getByRole('heading', { name: /Add Annotation to Set/ }),
    ).toBeVisible();

    await page.locator('#annotation-text').fill('Note');
    await page.getByRole('button', { name: 'Add Annotation' }).click();

    await expect(
      page.getByRole('heading', { name: /Add Annotation to Set/ }),
    ).not.toBeVisible();
  });

  test('cancel button closes modal', async ({ mockedPage: page }) => {
    await page.locator('button.add-annotation-link').first().click();
    await expect(
      page.getByRole('heading', { name: /Add Annotation to Set/ }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(
      page.getByRole('heading', { name: /Add Annotation to Set/ }),
    ).not.toBeVisible();
  });

  test('Escape key closes modal', async ({ mockedPage: page }) => {
    await page.locator('button.add-annotation-link').first().click();
    await expect(
      page.getByRole('heading', { name: /Add Annotation to Set/ }),
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('heading', { name: /Add Annotation to Set/ }),
    ).not.toBeVisible();
  });

  test('form resets after cancel', async ({ mockedPage: page }) => {
    await page.locator('button.add-annotation-link').first().click();
    await page.locator('#annotation-text').fill('Will be cleared');
    await page.locator('#annotation-uri').fill('https://example.com');
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Re-open — fields should be empty
    await page.locator('button.add-annotation-link').first().click();
    await expect(page.locator('#annotation-text')).toHaveValue('');
    await expect(page.locator('#annotation-uri')).toHaveValue('');
  });

  test('submit without URI sends annotation without uri field', async ({ mockedPage: page }) => {
    const postRequest = page.waitForRequest(
      (req) =>
        req.url().includes('/results') &&
        req.method() === 'POST',
    );

    // Use the last + annotation button (on a set column)
    await page.locator('button.add-annotation-link').last().click();
    await page.locator('#annotation-text').fill('Text-only annotation');
    await page.getByRole('button', { name: 'Add Annotation' }).click();

    const req = await postRequest;
    const body = req.postDataJSON();
    expect(body.annotations[0].text).toBe('Text-only annotation');
    expect(body.annotations[0].uri).toBeUndefined();
  });
});

test.describe('Annotations display', () => {
  test('annotation with URI renders as a link', async ({ mockedPage: page }) => {
    // SetPage has annotations on set-a aggregate row
    await page.goto('/?project=alpha-project&experiment=exp-001&page=set:set-a');
    await expect(
      page.locator('a.link', { hasText: 'Run note for set-a' }),
    ).toBeVisible();
    const link = page.locator('a.link', { hasText: 'Run note for set-a' });
    await expect(link).toHaveAttribute('href', 'https://example.com/notes');
  });

  test('annotation without URI renders as plain text', async ({ mockedPage: page }) => {
    // Override comparison data to include a text-only annotation
    await page.route('**/api/projects/*/experiments/*/sets/*/compare-by-ref**', (route) => {
      const modified = JSON.parse(JSON.stringify(data.comparisonByRef));
      modified.experiment_set.results['ref-1'].annotations = [
        { text: 'Plain text note' },
      ];
      return route.fulfill({ json: modified });
    });

    await page.goto('/?project=alpha-project&experiment=exp-001&page=set:set-a');
    await expect(page.getByText('Plain text note')).toBeVisible();
    // Should NOT be a link
    const plainAnnotation = page.locator('.annotation', { hasText: 'Plain text note' });
    await expect(plainAnnotation).toBeVisible();
    await expect(plainAnnotation.locator('a')).not.toBeVisible();
  });
});
