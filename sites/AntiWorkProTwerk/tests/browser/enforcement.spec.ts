import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('EPA facility timeline preserves program periods and penalties, maps real sites and connects to state context', async ({
  page,
}) => {
  const errors: string[] = [],
    details: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/echo\/releases\/[^/]+\/facilities\//.test(r.url())) details.push(r.url());
  });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/enforcement/');
  await expect(page.locator('.coverage summary')).toContainText('59 facilities');
  await expect(page.locator('.echo-card')).toHaveCount(20);
  await expect(page.locator('.echo-card').first()).toBeEnabled();
  await expect(page.locator('[data-record-sites]')).toHaveAttribute('data-record-sites', '59');
  expect(details).toHaveLength(0);
  await page.evaluate(() => {
    (window as any).__echoMap = document.querySelector('.maplibregl-canvas');
  });
  await page.locator('.enforcement-page header').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/enforcement-desktop.png' });
  await page.getByLabel('Find a facility, city or program ID').fill('Equistar');
  await page.getByRole('button', { name: 'Search facilities', exact: true }).click();
  await expect(page.locator('.echo-card')).toHaveCount(1);
  await expect(page.locator('[data-record-sites]')).toHaveAttribute('data-record-sites', '1');
  const manifest = JSON.parse(readFileSync('public/data/echo/manifest.json', 'utf8'));
  const collection = JSON.parse(
    readFileSync(`public/data/echo/releases/${manifest.release}/data.json`, 'utf8'),
  );
  const facility = collection.facilities.find((f: { id: string }) => f.id === '110034641635');
  // Click the rendered point using the actual source coordinates and current map camera,
  // rather than calling the selection handler or depending on a fixed screenshot pixel.
  const point = await page.locator('[data-camera]').evaluate(
    (element, location) => {
      const [lng, lat, zoom] = JSON.parse((element as HTMLElement).dataset.camera!);
      const padding = JSON.parse((element as HTMLElement).dataset.cameraPadding!);
      const bounds = element.getBoundingClientRect(),
        world = 512 * 2 ** zoom;
      const mercatorY = (latitude: number) => {
        const sine = Math.sin((latitude * Math.PI) / 180);
        return 0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI);
      };
      return {
        x: bounds.x + (bounds.width + padding.left - padding.right) / 2 + ((location.lon - lng) / 360) * world,
        y: bounds.y + (bounds.height + padding.top - padding.bottom) / 2 + (mercatorY(location.lat) - mercatorY(lat)) * world,
      };
    },
    { lat: facility.lat, lon: facility.lon },
  );
  await page.mouse.click(point.x, point.y);
  await page.getByRole('button', { name: 'Open facility evidence', exact: true }).click();
  await expect(page.locator('.quarter').first()).toBeVisible();
  await expect(page.locator('.echo-detail')).toContainText('FRS ID 110034641635');
  await expect(page.locator('.notice')).toContainText('do not sum');
  await page.locator('.periods summary').click();
  const periods = page.locator('.periods tbody tr');
  await expect(
    periods.filter({ hasText: 'FormalActions' }).filter({ hasText: 'CWA' }).first(),
  ).toContainText('2021');
  await expect(
    periods.filter({ hasText: 'ComplianceHistory' }).filter({ hasText: 'CWA' }).first(),
  ).toContainText('2016');
  await page.getByLabel('Environmental program', { exact: true }).selectOption('CWA');
  await page
    .getByRole('button', { name: /^CWA TX0119792, / })
    .first()
    .click();
  await expect(page).toHaveURL(/source=TX0119792/);
  await expect(page.locator('.window').first()).toContainText('TX0119792');
  await expect(page.locator('.window[role=status]')).toContainText('not a determination');
  await page.getByRole('button', { name: 'Clear response window', exact: true }).click();
  await page.getByLabel('Response entry type', { exact: true }).selectOption('formal');
  await expect(page.locator('.event-list .penalty').filter({ hasText: '$92,711.00' })).toHaveCount(
    2,
  );
  await page
    .locator('.echo-detail')
    .screenshot({ path: 'test-results/enforcement-detail-desktop.png' });
  await page
    .getByRole('link', { name: 'Explore this state’s economic context →', exact: true })
    .click();
  await expect(page).toHaveURL(/records\/paycheck\/\?state=TX/);
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__echoMap,
    ),
  ).toBe(true);
  await page
    .getByRole('link', { name: 'Explore environmental enforcement in this state →', exact: true })
    .click();
  await expect(page.locator('.overview strong').first()).toHaveText('20');
  await expect(page.locator('[data-record-sites]')).toHaveAttribute('data-record-sites', '20');
  expect(errors).toEqual([]);
});

test('phone EPA evidence retries, preserves program-only identity, rejects invalid windows and explains missing coverage', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let failed = false;
  await page.route('**/echo/releases/*/facilities/cac003402119.json', async (route) => {
    if (!failed) {
      failed = true;
      await route.abort();
    } else await route.continue();
  });
  await page.goto('/records/enforcement/?facility=CAC003402119&from=2026-02-30');
  await page.getByRole('button', { name: 'Expand evidence panel' }).click();
  await expect(page.locator('.echo-detail [role=alert]')).toContainText('could not load');
  await page.getByRole('button', { name: 'Retry EPA evidence' }).click();
  await expect(page.locator('.echo-detail')).toContainText('RCRAInfo ID CAC003402119');
  await expect(page.locator('.echo-detail [role=alert]')).toContainText('date window is invalid');
  await page.getByRole('button', { name: 'Clear response window' }).click();
  await expect(page.locator('.echo-detail [role=alert]')).toHaveCount(0);
  await page.locator('.echo-detail h3').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/enforcement-phone.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Close facility ×' }).click();
  await page.getByLabel('At least two reported noncompliant quarters in one source').check();
  await expect(page.locator('.overview strong').first()).not.toHaveText('59');
  await page.getByLabel('Explore a state', { exact: true }).selectOption('NY');
  await expect(page.locator('.echo-card')).toHaveCount(0);
  await expect(page.locator('.empty')).toContainText('does not mean a state has no violations');
  await expect(page.locator('[data-record-sites]')).toHaveAttribute('data-record-sites', '0');
});

test('late EPA facility evidence cannot replace the new selection', async ({ page }) => {
  const manifest = JSON.parse(readFileSync('public/data/echo/manifest.json', 'utf8'));
  const data = JSON.parse(
    readFileSync(`public/data/echo/releases/${manifest.release}/data.json`, 'utf8'),
  );
  const [first, second] = data.facilities;
  let release!: () => void,
    started = false;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    `**/echo/releases/*/facilities/${first.id.toLowerCase()}.json`,
    async (route) => {
      started = true;
      const response = await route.fetch();
      await gate;
      await route.fulfill({ response }).catch(() => {});
    },
  );
  try {
    await page.goto('/records/enforcement/');
    await page.locator('.echo-card').filter({ hasText: first.id }).click();
    await expect.poll(() => started).toBe(true);
    await page.locator('.echo-card').filter({ hasText: second.id }).click();
    await expect(page.locator('.echo-detail h3')).toHaveText(second.name);
    await expect(page.locator('.notice')).toBeVisible();
    release();
    await page.waitForTimeout(150);
    await expect(page.locator('.echo-detail h3')).toHaveText(second.name);
    await expect(page.locator('.echo-detail [role=alert]')).toHaveCount(0);
  } finally {
    release();
  }
});
