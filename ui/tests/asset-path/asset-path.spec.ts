import { test, expect } from '../fixtures';

test('loads the spinner from the UI virtual directory', async ({ mockedPage: page }) => {
  let releaseProjects: () => void = () => {};
  const projectsHeld = new Promise<void>((resolve) => { releaseProjects = resolve; });
  const spinnerRequests: string[] = [];

  await page.route('**/api/projects', async (route) => {
    await projectsHeld;
    await route.fulfill({ json: [] });
  });
  await page.route('**/catalog/assets/**', async (route) => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace(/^\/catalog/, '');
    await route.fulfill({ response: await route.fetch({ url: url.toString() }) });
  });
  await page.route('**/spinner.gif', async (route) => {
    const url = new URL(route.request().url());
    spinnerRequests.push(url.pathname);
    if (url.pathname !== '/catalog/spinner.gif') {
      await route.fulfill({ status: 404 });
      return;
    }
    url.pathname = '/spinner.gif';
    await route.fulfill({ response: await route.fetch({ url: url.toString() }) });
  });

  try {
    await page.goto('/catalog/');
    const spinner = page.locator('img.loading').first();
    await expect(spinner).toBeVisible();
    await expect(spinner).toHaveJSProperty('complete', true);
    expect(await spinner.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(spinnerRequests).toContain('/catalog/spinner.gif');
    expect(spinnerRequests).not.toContain('/spinner.gif');
  } finally {
    releaseProjects();
  }
});
