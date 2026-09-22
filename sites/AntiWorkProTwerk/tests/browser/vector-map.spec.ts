import { test, expect } from '@playwright/test';

test('lightweight map preserves one interactive map, previews, filters and the correlation cohort', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/records/patterns/?state=TX');
  await expect(page.locator('.map-loading')).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).__retainedMap = document.querySelector('.maplibregl-canvas');
  });
  const original = page.url(),
    correlation = await page.getByTestId('pattern-r').innerText();
  await page.getByRole('button', { name: 'Lightweight map', exact: true }).click();
  const vector = page.getByTestId('vector-map');
  await expect(vector.locator('[data-vector-state]')).toHaveCount(51);
  await expect(page.getByTestId('us-map')).toBeHidden();
  await page.getByRole('button', { name: 'Alaska', exact: true }).click();
  await expect(vector).toHaveAttribute('data-focused-state', 'AK');
  await page.getByRole('button', { name: 'Hawaii', exact: true }).click();
  await expect(vector).toHaveAttribute('data-focused-state', 'HI');
  expect(page.url()).toBe(original);
  await vector.locator('[data-vector-state=HI]').focus();
  await page.keyboard.press('Home');
  await expect(vector.locator('[data-vector-state=AL]')).toBeFocused();
  await expect(vector).toHaveAttribute('data-focused-state','AL');
  expect(page.url()).toBe(original);
  await page.getByRole('button', { name: 'Show contiguous United States', exact: true }).click();
  await expect(vector).toHaveAttribute('data-focused-state', '__all__');
  await page.getByRole('button', { name: /Inspect map/ }).click();
  const inspector = page.getByRole('dialog', { name: 'Map inspector', exact: true });
  await inspector.locator('select').selectOption('CA');
  await expect(vector).toHaveAttribute('data-preview-state', 'CA');
  await expect(vector.locator('.vector-preview')).toHaveCount(1);
  await expect(inspector.getByTestId('projection-note')).toContainText('Alaska is rescaled');
  expect(page.url()).toBe(original);
  await page.keyboard.press('Escape');
  const texas = vector.locator('[data-vector-state=TX]');
  await texas.focus();
  await page.keyboard.press('Home');
  await expect(vector.locator('[data-vector-state=AL]')).toBeFocused();
  await expect(vector.locator('[data-vector-state][tabindex="0"]')).toHaveCount(1);
  expect(page.url()).toBe(original);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/state=AL/);
  await expect(page.getByTestId('pattern-r')).toHaveText(correlation);
  await expect(page.locator('.pattern-dot')).toHaveCount(51);
  await page.getByRole('button', { name: 'Show contiguous United States', exact: true }).click();
  await expect(vector.locator('.vector-layer')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await page.screenshot({ path: 'test-results/vector-map-desktop.png' });
  await page.getByRole('button', { name: 'Lightweight map', exact: true }).click();
  await expect(vector).toHaveCount(0);
  await expect(page.getByTestId('us-map')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__retainedMap,
    ),
  ).toBe(true);
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-highlighted-state', 'AL');
  expect(errors).toEqual([]);
});

test('saved lightweight preference skips the graphics engine and survives source navigation', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('ltw.map-renderer.v1', 'vector'));
  const graphicsRequests: string[] = [];
  page.on('request', (request) => {
    if (/maplibre-gl\.js\?/.test(request.url()) || request.url().includes('worker_file'))
      graphicsRequests.push(request.url());
  });
  await page.goto('/records/patterns/');
  await expect(page.locator('[data-vector-state]')).toHaveCount(51);
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
  await page.getByRole('link', { name: 'Connections', exact: true }).click();
  await expect(page.locator('[data-vector-state]')).toHaveCount(51);
  await expect(page.getByRole('button', { name: 'Lightweight map', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.reload();
  await expect(page.locator('[data-vector-state]')).toHaveCount(51);
  expect(graphicsRequests).toEqual([]);
});

test('failed graphics initialize a working geographic fallback with state selection', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: any[]
    ) {
      if (type.startsWith('webgl')) return null;
      return (getContext as any).call(this, type, ...args);
    } as typeof getContext;
  });
  await page.goto('/records/patterns/');
  await expect(page.locator('[data-vector-state]')).toHaveCount(51);
  await expect(page.locator('.map-notice')).toContainText('graphics are unavailable');
  const california = page.locator('[data-vector-state=CA]');
  await california.focus();
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(/state=CA/);
  await expect(page.locator('.state-top h3')).toHaveText('California');
});

test('missing boundaries offer a retry without changing the selected records', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ltw.map-renderer.v1', 'vector'));
  let first = true;
  await page.route('**/geography/states.geojson', (route) => {
    if (first) {
      first = false;
      return route.fulfill({ status: 503, body: 'Unavailable' });
    }
    return route.continue();
  });
  await page.goto('/records/patterns/?state=WA');
  await expect(page.getByRole('alert')).toContainText('State boundaries could not load');
  await expect(page.locator('.pattern-dot')).toHaveCount(51);
  await page.getByRole('button', { name: 'Retry state boundaries', exact: true }).click();
  await expect(page.locator('[data-vector-state]')).toHaveCount(51);
  await expect(page).toHaveURL(/state=WA/);
});

test('lightweight facility locations retain exact identity and keyboard popup focus', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('ltw.map-renderer.v1', 'vector'));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/enforcement/?q=Equistar');
  const vector = page.getByTestId('vector-map');
  await expect(vector.locator('.vector-site')).toHaveCount(1);
  const point = vector.locator('.vector-site');
  await point.focus();
  await page.keyboard.press('Enter');
  const popup = page.getByRole('dialog', { name: 'Map location evidence', exact: true });
  await expect(
    popup.getByRole('button', { name: 'Close map location', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(page.locator('.catalog-dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(point).toBeFocused();
  await page.keyboard.press('Enter');
  await popup.getByRole('button', { name: 'Open facility evidence ↗', exact: true }).click();
  await expect(page).toHaveURL(/facility=110034641635/);
  await expect(page.locator('.echo-detail')).toContainText('FRS ID 110034641635');
  await expect(vector.locator('.vector-site')).toHaveCount(1);
});

test.describe('touch lightweight map', () => {
  test.use({ hasTouch: true, isMobile: true });
  test('phone facility evidence fits the viewport rather than clipping inside the small map', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('ltw.map-renderer.v1', 'vector'));
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/records/enforcement/?q=Equistar');
    const point = page.locator('.vector-site');
    await expect(point).toHaveCount(1);
    await point.focus();
    await page.keyboard.press('Enter');
    const popup = page.getByRole('dialog', { name: 'Map location evidence', exact: true });
    await expect(popup).toBeVisible();
    const bounds = await popup.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(321);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(569);
    await page.screenshot({ path: 'test-results/vector-facility-phone.png' });
    await popup.getByRole('button', { name: 'Open facility evidence ↗', exact: true }).click();
    await expect(page.locator('.echo-detail')).toContainText('FRS ID 110034641635');
  });
  test('phone controls fit narrow screens and respect reduced motion', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ltw.map-renderer.v1', 'vector'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/records/patterns/?state=TX');
    await expect(page.locator('[data-vector-state]')).toHaveCount(51);
    await expect(page.locator('.vector-layer')).toHaveCSS('transition-duration', '0s');
    await page.getByRole('button', { name: 'Hawaii', exact: true }).click();
    await expect(page.getByTestId('vector-map')).toHaveAttribute('data-focused-state', 'HI');
    await page.screenshot({ path: 'test-results/vector-map-phone.png' });
    await page.setViewportSize({ width: 320, height: 568 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    const toolbar = await page.locator('.map-toolbar').boundingBox();
    expect(toolbar!.x + toolbar!.width).toBeLessThanOrEqual(321);
    await page.getByRole('button', { name: /Inspect map/ }).click();
    const inspector = page.getByRole('dialog', { name: 'Map inspector', exact: true });
    await inspector.locator('select').selectOption('AK');
    await expect(page.getByTestId('vector-map')).toHaveAttribute('data-preview-state', 'AK');
    await expect(inspector.getByTestId('projection-note')).toContainText('US Census');
  });
});
