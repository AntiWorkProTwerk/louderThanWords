import { test, expect } from '@playwright/test';

test('connection lookup failure leaves the catalog usable and a new open retries', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  let failed = false;
  await page.route('**/data/connections/manifest.json', async (route) => {
    if (!failed) {
      failed = true;
      await route.abort();
    } else await route.continue();
  });
  await page.goto('/records/major-stakes/?issuer=0000789019');
  await page.getByRole('button', { name: /Explore data/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.catalog-related-status')).toContainText('could not be checked');
  await expect(dialog.locator('.catalog-card')).toHaveCount(21);
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(391);
  const scroller = await dialog.locator('.catalog-scroll').boundingBox();
  expect(scroller!.height).toBeGreaterThanOrEqual(80);
  expect(scroller!.y + scroller!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height + 1);
  await page.getByRole('button', { name: 'Close data explorer', exact: true }).click();
  await page.getByRole('button', { name: /Explore data/ }).click();
  await expect(dialog.locator('.related-links a')).toHaveCount(2);
});

test('the catalog shortcut does not stack over an existing representative dialog', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('[data-person=cruz]').click();
  await expect(page.locator('.detail-profile')).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.locator('.catalog-dialog')).toHaveCount(0);
  await expect(page.locator('.detail-profile')).toBeVisible();
});

test('data explorer searches all views, keeps the map and supports keyboard dismissal', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/connections/?company=0000789019');
  await expect(page.locator('.map-loading')).toHaveCount(0);
  await page.evaluate(
    () => ((window as any).__catalogMap = document.querySelector('.maplibregl-canvas')),
  );
  await page.getByRole('button', { name: /Explore data/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search data views' })).toBeFocused();
  await expect(dialog.locator('.catalog-card')).toHaveCount(21);
  await expect(dialog.locator('.catalog-related')).toContainText('0000789019');
  await expect(dialog.locator('.related-links a')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/catalog-desktop.png' });
  const searchBounds = await page.locator('#catalog-search').boundingBox();
  const dialogBounds = await dialog.boundingBox();
  await page.getByRole('searchbox', { name: 'Search data views' }).fill('water');
  await expect(dialog.locator('.catalog-card')).toHaveCount(2);
  expect(await dialog.boundingBox()).toEqual(dialogBounds);
  expect(await page.locator('#catalog-search').boundingBox()).toEqual(searchBounds);
  await page.getByRole('searchbox', { name: 'Search data views' }).fill('no-matching-view');
  await expect(dialog.locator('.catalog-card')).toHaveCount(0);
  expect(await dialog.boundingBox()).toEqual(dialogBounds);
  expect(await page.locator('#catalog-search').boundingBox()).toEqual(searchBounds);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Explore data/ })).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Clear data search', exact: true }).click();
  await dialog.getByRole('button', { name: 'Money & ownership', exact: true }).click();
  await expect(dialog.locator('.catalog-card')).toHaveCount(4);
  await dialog.locator('.catalog-card').filter({ hasText: 'Insider records' }).click();
  await expect(page).toHaveURL(/\/records\/insiders\/$/);
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__catalogMap,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('contextual navigation carries verified IDs and does not guess unavailable matches', async ({
  page,
}) => {
  await page.goto('/records/major-stakes/?issuer=0000789019');
  await page.getByRole('button', { name: /Explore data/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.related-links a')).toHaveCount(2);
  await dialog.locator('.related-links a').filter({ hasText: 'Insider records' }).click();
  await expect(page).toHaveURL(/insiders\/\?issuer=0000789019/);
  await page.goto('/records/major-stakes/?issuer=0001981792');
  await page.getByRole('button', { name: /Explore data/ }).click();
  await expect(dialog.locator('.catalog-related-status')).toHaveCount(0);
  await expect(dialog.locator('.catalog-related')).toHaveCount(0);
  await expect(dialog.locator('.catalog-card')).toHaveCount(21);
});

test('phone explorer shows source labels, recovers empty search and respects reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: /Explore data/ }).click();
  const dialog = page.getByRole('dialog');
  const searchBounds = await page.locator('#catalog-search').boundingBox();
  const dialogBounds = await dialog.boundingBox();
  await page.getByRole('searchbox', { name: 'Search data views' }).fill('zzzzzz');
  await expect(dialog.locator('.catalog-empty')).toContainText('not every record');
  expect(await dialog.boundingBox()).toEqual(dialogBounds);
  expect(await page.locator('#catalog-search').boundingBox()).toEqual(searchBounds);
  await dialog.getByRole('button', { name: 'Show all data views', exact: true }).click();
  await dialog.getByRole('button', { name: 'Government', exact: true }).click();
  const said = dialog.locator('.catalog-card').filter({ hasText: 'Said / Did' });
  await expect(said).toContainText('ILLUSTRATIVE DEMO');
  await expect(said).toContainText('Fictional public demo');
  await said.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/catalog-phone.png' });
  expect(await dialog.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Close data explorer', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
