import { test, expect } from '@playwright/test';

test('real map persists across profiles, navigation, filters, and cached detail views', async ({
  page,
}) => {
  const errors: string[] = [],
    requests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push(r.url()));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/');
  await expect(page.locator('.map-state-name')).toHaveCount(51);
  await expect(page.locator('.politician-card')).toHaveCount(4);
  await page.evaluate(() => {
    (window as any).__originalMap = document.querySelector('.maplibregl-canvas');
  });
  await page.getByRole('button', { name: 'Focus TX', exact: true }).click();
  await page.waitForTimeout(750);
  const camera = await page.getByTestId('us-map').getAttribute('data-camera');
  for (let i = 0; i < 8; i++) {
    await page.locator('[data-person=cruz]').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Explore votes' }).click();
    await expect(page.locator('.vote-list>div')).toHaveCount(3);
    await page.keyboard.press('Escape');
  }
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__originalMap,
    ),
  ).toBe(true);
  expect(await page.getByTestId('us-map').getAttribute('data-camera')).toBe(camera);
  expect(requests.filter((url) => url.endsWith('/politicians/cruz.json')).length).toBe(1);
  await page.locator('#party-filter').selectOption('D');
  await expect(page.locator('.politician-card')).toHaveCount(2);
  await page.locator('#people-search').fill('health');
  await expect(page.locator('.politician-card')).toHaveCount(2);
  await page.locator('#people-search').fill('not-a-name');
  await expect(page.getByText('No matching representatives.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.politician-card')).toHaveCount(4);
  await page.locator('#selected-state').selectOption('CA');
  await expect(page.locator('.politicians-panel>.tagline')).toContainText('California');
  await expect(page.locator('.politician-card')).toHaveCount(2);
  await page.goBack();
  await expect(page.locator('#selected-state')).toHaveValue('TX');
  expect(errors).toEqual([]);
});
test('obsolete state responses cannot replace the current selection', async ({ page }) => {
  await page.route('**/states/CA/summary.json', async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.continue().catch(() => {});
  });
  await page.goto('/');
  await expect(page.locator('.map-state-name')).toHaveCount(51);
  await page.locator('#selected-state').selectOption('CA');
  await page.locator('#selected-state').selectOption('NY');
  await expect(page.locator('.politicians-panel>.tagline')).toContainText('New York');
  await expect(page.locator('.politician-card')).toHaveCount(2);
  await page.waitForTimeout(900);
  await expect(page.locator('.role').first()).toContainText('(NY)');
});
test('saved profiles and private notes persist locally; all demo actions work', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('[data-person=castro]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('#private-note').fill('Ask about community clinics.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByText('Saved on this device.', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('.map-state-name')).toHaveCount(51);
  await page.getByRole('navigation').getByRole('button', { name: 'Saved', exact: true }).click();
  await expect(page.getByText('Ask about community clinics.')).toBeVisible();
  await page.keyboard.press('Escape');
  for (const action of ['call', 'votes', 'donors', 'compare', 'bills']) {
    await page.locator(`[data-action=${action}]`).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    if (action !== 'compare') {
      await page.locator('#person-select').selectOption('garcia');
      await expect(page.locator('.detail-body')).toBeVisible();
    }
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: /My account/ }).click();
  await expect(
    page.getByText('Online accounts and subscriptions are not connected in this demo.'),
  ).toBeVisible();
});
test('phone map and expandable bottom sheet work without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.map-state-name')).toHaveCount(51);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const collapsed = await page.locator('#politicians').boundingBox();
  await page.getByRole('button', { name: 'Expand representative panel' }).click();
  const expanded = await page.locator('#politicians').boundingBox();
  expect(expanded!.height).toBeGreaterThan(collapsed!.height);
  await page.locator('[data-person=garcia]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByRole('button', { name: 'Collapse representative panel' }).click();
  await page.getByRole('button', { name: /Take action/ }).click();
  await page.locator('[data-action=donors]').click();
  await expect(page.locator('.donor-row')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await page.locator('#mobile-state').selectOption('HI');
  await expect(page.locator('.politicians-panel>.tagline')).toContainText('Hawaii');
});
