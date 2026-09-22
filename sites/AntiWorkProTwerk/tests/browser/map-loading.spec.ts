import { test, expect } from '@playwright/test';

test.use({ hasTouch: true, isMobile: true });

test('slow interactive geography leaves evidence usable and offers a lightweight escape', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route('**/geography/states.geojson', async (route) => {
    // Hold only the original WebGL request; the explicit fallback can fetch states.
    if (++requests === 1) await gate;
    await route.continue().catch(() => {});
  });
  try {
    await page.goto('/records/patterns/?state=TX', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.map-loading')).toContainText('Loading state boundaries');
    await expect(page.locator('.pattern-dot')).toHaveCount(51);
    await page.getByRole('button', { name: 'Expand evidence panel', exact: true }).tap();
    await page.locator('.year-track').getByRole('button', { name: '2020', exact: true }).tap();
    await expect(page).toHaveURL(/year=2020/);
    await page.getByRole('button', { name: 'Collapse evidence panel', exact: true }).tap();
    await expect(page.locator('.evidence-workspace')).toHaveCSS('top', '380px');
    const original = page.url();
    const r = await page.getByTestId('pattern-r').innerText();
    const loader = await page.locator('.map-loading').boundingBox();
    const heading = await page.locator('.evidence-map-label').boundingBox();
    const toolbar = await page.locator('.map-toolbar').boundingBox();
    expect(loader!.y).toBeGreaterThanOrEqual(heading!.y + heading!.height);
    expect(loader!.y + loader!.height).toBeLessThanOrEqual(toolbar!.y);
    await page.screenshot({ path: 'test-results/map-loading-phone.png' });
    await page.getByRole('button', { name: 'Switch to lightweight map', exact: true }).tap();
    await expect(page.locator('[data-vector-state]')).toHaveCount(51);
    await expect(page.locator('.map-loading')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Lightweight map', exact: true })).toBeFocused();
    expect(page.url()).toBe(original);
    await expect(page.getByTestId('pattern-r')).toHaveText(r);
    expect(await page.evaluate(() => localStorage.getItem('ltw.map-renderer.v1'))).toBe('vector');
  } finally {
    release();
  }
});

test('lightweight boundary loading is honest and respects reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ltw.map-renderer.v1', 'vector'));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/geography/states.geojson', async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });
  try {
    await page.goto('/records/patterns/?state=WA', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.map-loading')).toContainText('Alaska and Hawaii insets');
    await expect(page.locator('.loading-orbit')).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.pattern-dot')).toHaveCount(51);
    await expect(page.locator('[data-vector-state]')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Switch to lightweight map', exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('.map-loading [aria-valuenow]')).toHaveCount(0);
    release();
    await expect(page.locator('[data-vector-state]')).toHaveCount(51);
    await expect(page.locator('.map-loading')).toHaveCount(0);
    await expect(page).toHaveURL(/state=WA/);
  } finally {
    release();
  }
});
