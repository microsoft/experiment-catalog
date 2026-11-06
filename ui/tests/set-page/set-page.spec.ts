import { test, expect } from '../fixtures';
import * as data from '../mocks/data';

/**
 * SetPage drill-down tests.
 *
 * Reached via query-param URL: /?project=…&experiment=…&page=set:<name>
 */
test.describe('SetPage drill-down', () => {
  const base = '/?project=alpha-project&experiment=exp-001&page=set:set-a';

  test('merges scoped links, expands baseline values, and hides missing iteration artifacts', async ({ mockedPage: page }) => {
    await page.route('**/api/settings', (route) => route.fulfill({
      json: {
        custom_links: [
          { scope: 'ref', name: 'cow', url: 'https://default.example/{ref}' },
          { scope: 'iteration', name: 'trace', url: 'https://tools.example/trace?inf={inf}&eval={eval}&gt={gt}' },
          { scope: 'set', name: 'dashboard', url: 'https://tools.example/{project}/{experiment}/{set}' },
          { scope: 'set', name: 'details', url: 'https://tools.example/details?set={set}&baseline={baseline-project}/{baseline-experiment}/{baseline-set}' },
          { scope: 'experiment', name: 'report', url: 'https://tools.example/{experiment}?baseline={baseline-project}/{baseline-experiment}/{baseline-set}' },
        ],
      },
    }));
    await page.route('**/api/projects/alpha-project/links', (route) => route.fulfill({
      json: [{ scope: 'ref', name: 'cow', url: 'https://project.example/{project}/{experiment}/{set}/{ref}' }],
    }));
    await page.goto(base);
    const linksRow = page.locator('.meta-row').filter({ has: page.getByText('Links', { exact: true }) });
    await expect(linksRow.getByRole('link', { name: 'details', exact: true }))
      .toHaveAttribute('href', 'https://tools.example/details?set=set-a&baseline=alpha-project/exp-001/baseline');
    await expect(linksRow.getByRole('link', { name: 'dashboard', exact: true }))
      .toHaveAttribute('href', 'https://tools.example/alpha-project/exp-001/set-a');
    await expect(linksRow.locator('span').last()).toHaveText('dashboard, details');
    await expect(linksRow.getByRole('link', { name: 'dashboard', exact: true }))
      .toHaveCSS('text-decoration-line', 'underline');
    await expect(linksRow.getByRole('link', { name: 'dashboard', exact: true }))
      .toHaveCSS('color', await linksRow.evaluate((row) => getComputedStyle(row).color));
    await expect(page.getByRole('link', { name: 'report', exact: true })).toHaveCount(0);
    await expect(page.locator('h2').getByRole('link')).toHaveCount(0);
    const createdBounds = await page.locator('.meta-row').filter({ hasText: 'Created' }).boundingBox();
    const linksBounds = await linksRow.boundingBox();
    expect(linksBounds!.y).toBeGreaterThanOrEqual(createdBounds!.y + createdBounds!.height);
    await expect(page.locator('h3').getByRole('link')).toHaveCount(0);
    await expect(page.locator('tr.set-aggregate').getByRole('link', { name: '(cow)', exact: true }))
      .toHaveAttribute('href', 'https://project.example/alpha-project/exp-001/set-a/ref-1');
    await expect(page.getByRole('link', { name: '(trace)', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'toggle set iterations', exact: true }).click();
    const trace = page.getByRole('link', { name: '(trace)', exact: true });
    await expect(trace).toHaveAttribute('href',
      `https://tools.example/trace?inf=${encodeURIComponent(data.setAResult.inference_uri)}&eval=${encodeURIComponent(data.setAResult.evaluation_uri)}&gt=${encodeURIComponent(data.setAResult.ground_truth_uri)}`);
    await expect(trace).toHaveAttribute('target', '_blank');
    await expect(trace).toHaveAttribute('rel', 'noopener noreferrer');
    await page.getByRole('button', { name: 'toggle baseline iterations', exact: true }).click();
    await expect(trace).toHaveCount(1);
    await expect(page.getByRole('button', { name: '(inf)', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '(eval)', exact: true })).toBeVisible();
  });

  test('uses the active cross-project comparison for baseline placeholders and its own project links', async ({ mockedPage: page }) => {
    const target = { project: 'beta-project', experiment: 'exp-002', set: 'target-set' };
    await page.route('**/api/settings', (route) => route.fulfill({
      json: { custom_links: [
        { scope: 'ref', name: 'inspect', url: 'https://default.example/{project}/{experiment}/{set}?baseline={baseline-project}/{baseline-experiment}/{baseline-set}' },
      ] },
    }));
    await page.route('**/api/projects/beta-project/links', (route) => route.fulfill({
      json: [{ scope: 'ref', name: 'inspect', url: 'https://foreign.example/{project}/{experiment}/{set}/{ref}' }],
    }));
    await page.route('**/api/projects/*/experiments/*/sets/*/compare-by-ref**', (route) => route.fulfill({
      json: { ...data.comparisonByRef, comparison_target: { ...target, results: { 'ref-1': data.baselineResult } } },
    }));
    await page.goto(base);
    await expect(page.locator('tr.set-aggregate').getByRole('link', { name: '(inspect)', exact: true }))
      .toHaveAttribute('href', 'https://default.example/alpha-project/exp-001/set-a?baseline=beta-project/exp-002/target-set');
    await expect(page.locator('tr.project-baseline').getByRole('link', { name: '(inspect)', exact: true }))
      .toHaveAttribute('href', 'https://foreign.example/beta-project/exp-002/target-set/ref-1');
  });

  for (const scope of ['experiment', 'set']) {
    test(`omits the set LINKS row for ${scope === 'experiment' ? 'experiment-only links' : 'unavailable baseline values'}`, async ({ mockedPage: page }) => {
      await page.route('**/api/projects/alpha-project/links', (route) => route.fulfill({
        json: [{ scope, name: 'unavailable', url: 'https://tools.example/{baseline-set}' }],
      }));
      await page.route('**/api/projects/*/experiments/*/sets/*/compare-by-ref**', (route) => route.fulfill({
        json: { ...data.comparisonByRef, project_baseline: null, experiment_baseline: null },
      }));
      await page.goto(base);
      await expect(page.locator('table')).toBeVisible();
      await expect(page.locator('.meta-row').filter({ has: page.getByText('Links', { exact: true }) })).toHaveCount(0);
    });
  }

  test('pins Source and Ref without overlap when scrolling horizontally, including after expanding iterations', async ({ mockedPage: page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto(base);
    await expect(page.locator('tr.set-aggregate')).toBeVisible();
    for (const expanded of [false, true]) {
      if (expanded) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.getByRole('button', { name: 'toggle set iterations', exact: true }).click();
        await expect(page.getByText('Set / set-a', { exact: true })).toBeVisible();
      }
      const positions = [];
      for (const x of [100, 200]) {
        await page.evaluate((offset) => window.scrollTo(offset, 0), x);
        await expect.poll(() => page.evaluate(() => window.scrollX)).toBe(x);
        positions.push(await page.locator('tr.set-aggregate').evaluate((row) =>
          Array.from(row.children).slice(0, 3).map((cell) => {
            const rect = cell.getBoundingClientRect();
            return { left: rect.left, right: rect.right };
          })));
      }
      expect(positions[1][0].left).toBeCloseTo(positions[0][0].left, 0);
      expect(positions[1][1].left).toBeCloseTo(positions[0][1].left, 0);
      expect(positions[1][0].right).toBeLessThanOrEqual(positions[1][1].left + 1);
      expect(positions[1][2].left).toBeCloseTo(positions[0][2].left - 100, 0);
      const headers = await page.locator('thead th').evaluateAll((cells) =>
        cells.slice(0, 2).map((cell) => cell.getBoundingClientRect().left));
      expect(headers[0]).toBeCloseTo(positions[1][0].left, 0);
      expect(headers[1]).toBeCloseTo(positions[1][1].left, 0);
    }
  });

  test('displays project, experiment, and set headings', async ({ mockedPage: page }) => {
    await page.goto(base);
    await expect(page.getByText('PROJECT: alpha-project')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'EXPERIMENT: exp-001' })).toBeVisible();
    await expect(page.getByText('SET: set-a')).toBeVisible();
    await expect(page.locator('.meta-row').filter({ has: page.getByText('Links', { exact: true }) })).toHaveCount(0);
  });

  test('shows the project ground truth after the hypothesis, or Unknown when unset', async ({ mockedPage: page }) => {
    await page.goto(base);
    const groundTruth = page.locator('.meta-row').filter({ hasText: 'GRND TRUTH' });
    await expect(groundTruth).toContainText('Unknown');
    await page.route('**/api/projects/alpha-project', (route) =>
      route.fulfill({
        json: { name: 'alpha-project', ground_truth: 'GT v2' },
      }),
    );
    await page.reload();
    await expect(groundTruth).toContainText('GT v2');
    await expect(groundTruth).not.toContainText('Unknown');
    const hypothesis = page.locator('.meta-row').filter({ hasText: 'Hypothesis' });
    const hypothesisBounds = await hypothesis.boundingBox();
    const groundTruthBounds = await groundTruth.boundingBox();
    const createdBounds = await page.locator('.meta-row').filter({ hasText: 'Created' }).boundingBox();
    expect(groundTruthBounds!.y).toBeGreaterThan(hypothesisBounds!.y);
    expect(groundTruthBounds!.y).toBeLessThan(createdBounds!.y);
    const hypothesisValue = await hypothesis.locator('span').nth(1).boundingBox();
    const groundTruthValue = await groundTruth.locator('span').nth(1).boundingBox();
    expect(groundTruthValue!.x).toBe(hypothesisValue!.x);
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

  test('ref column grows to accommodate a long ref without overlap', async ({ mockedPage: page }) => {
    const longRef = `conv_${'a'.repeat(95)}`;
    const comparisonByLongRef = {
      ...data.comparisonByRef,
      project_baseline: {
        ...data.comparisonByRef.project_baseline,
        results: { [longRef]: { ...data.baselineResult, ref: longRef } },
      },
      experiment_baseline: {
        ...data.comparisonByRef.experiment_baseline,
        results: { [longRef]: { ...data.baselineResult, ref: longRef } },
      },
      experiment_set: {
        ...data.comparisonByRef.experiment_set,
        results: { [longRef]: { ...data.setAResult, ref: longRef } },
      },
    };

    await page.route('**/api/projects/*/experiments/*/sets/*/compare-by-ref**', (route) =>
      route.fulfill({ json: comparisonByLongRef }),
    );

    await page.goto(base);
    await expect(page.getByText(longRef).first()).toBeVisible();

    const layout = await page.locator('tr.set-aggregate').evaluate((row) => {
      const refCell = row.children[1];
      const firstMetricCell = row.children[2];
      const refText = refCell.firstChild;
      if (!refText || !firstMetricCell) {
        throw new Error('Expected ref and metric cells to render.');
      }

      const range = document.createRange();
      range.selectNodeContents(refText);
      const refTextRect = range.getBoundingClientRect();
      const metricRect = firstMetricCell.getBoundingClientRect();

      return {
        refTextRight: refTextRect.right,
        metricLeft: metricRect.left,
      };
    });

    expect(layout.refTextRight).toBeLessThanOrEqual(layout.metricLeft);
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

  test('baseline button is enabled', async ({ mockedPage: page }) => {
    await page.goto(base);
    const baselineBtn = page.getByRole('button', {
      name: /set this permutation as the experiment baseline/,
    });

    await expect(baselineBtn).toBeEnabled();
  });

  test('canceling hide does not send a request or leave the set', async ({ mockedPage: page }) => {
    let requests = 0;
    await page.route('**/sets/set-a/hidden', (route) => {
      requests++;
      return route.fulfill({ status: 200 });
    });
    await page.goto(base);
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('set-a');
      await dialog.dismiss();
    });
    await page.getByRole('button', { name: 'hide this set' }).click();
    await expect(page.getByText('SET: set-a')).toBeVisible();
    expect(requests).toBe(0);
  });

  test('confirmed hide sends a PUT and returns to the experiment', async ({ mockedPage: page }) => {
    await page.route('**/sets/set-a/hidden', (route) => route.fulfill({ status: 200 }));
    await page.goto(base);
    page.once('dialog', (dialog) => dialog.accept());
    const request = page.waitForRequest((req) =>
      req.url().endsWith('/sets/set-a/hidden') && req.method() === 'PUT');
    await page.getByRole('button', { name: 'hide this set' }).click();
    await request;
    await expect(page.locator('h3', { hasText: 'SET: set-a' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'EXPERIMENT: exp-001' })).toBeVisible();
    expect(page.url()).not.toContain('page=set:');
  });

  test('hiding an active baseline shows the conflict and keeps the set', async ({ mockedPage: page }) => {
    await page.route('**/sets/set-a/hidden', (route) =>
      route.fulfill({ status: 409, body: 'choose a different experiment baseline before hiding this set.' }),
    );
    await page.goto(base);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'hide this set' }).click();
    await expect(page.getByRole('alert'))
      .toHaveText('HTTP 409: choose a different experiment baseline before hiding this set.');
    await expect(page.getByText('SET: set-a')).toBeVisible();
  });

  test('does not offer hiding a known experiment baseline', async ({ mockedPage: page }) => {
    await page.route('**/sets/*/compare-by-ref**', (route) =>
      route.fulfill({
        json: {
          ...data.comparisonByRef,
          experiment_baseline: { ...data.comparisonByRef.experiment_baseline, set: 'set-a' },
        },
      }),
    );
    await page.goto(base);
    await expect(page.getByRole('button', { name: 'hide this set' })).toBeDisabled();
  });

  test('support resource links in iteration rows', async ({ mockedPage: page }) => {
    await page.goto(base);
    // Toggle set iterations to reveal detail rows
    await page.getByRole('button', { name: /toggle set iterations/ }).click();
    await expect(page.getByText('Set / set-a')).toBeVisible();

    // URIs are rendered as buttons via window.open
    await expect(page.getByRole('button', { name: '(gt)' })).toBeVisible();
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
