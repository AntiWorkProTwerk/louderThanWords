import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync('public/data/water/manifest.json', 'utf8'));
const collection = JSON.parse(
  readFileSync(`public/data/water/releases/${manifest.release}/data.json`, 'utf8'),
);
test('water history separates testing from contamination and follows exact EPA identifiers on one map', async ({
  page,
}) => {
  const errors: string[] = [],
    requests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/water\/releases\/[^/]+\/systems\//.test(r.url())) requests.push(r.url());
  });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/water/');
  await expect(page.locator('.coverage summary')).toContainText('1,449 systems');
  await expect(page.locator('.water-card')).toHaveCount(24);
  await expect(page.locator('.water-card').first()).toBeEnabled();
  expect(requests).toHaveLength(0);
  await expect(page.locator('[data-record-sites]')).toHaveAttribute('data-record-sites', '0');
  await expect(page.locator('.map-evidence-key')).toContainText('state-label anchors');
  await page.evaluate(() => {
    (window as any).__waterMap = document.querySelector('.maplibregl-canvas');
  });
  await page.screenshot({ path: 'test-results/water-desktop.png' });
  await page.getByLabel('Find a water system, county or PWS ID').fill('TX1012680');
  await page.getByRole('button', { name: 'Search water records', exact: true }).click();
  await expect(page.locator('.water-card')).toHaveCount(1);
  await page.locator('.water-card').click();
  await expect(page.locator('.water-timeline>li')).toHaveCount(3);
  await expect(page.locator('.water-detail h3')).toHaveText('EQUISTAR CHEMICALS LA PORTE COMPLEX');
  await page.getByLabel('Water record category', { exact: true }).selectOption('monitoring');
  await expect(page.locator('.water-timeline>li')).toHaveCount(1);
  await expect(page.locator('.record-caution')).toContainText(
    'does not mean that contaminant was detected',
  );
  await page.locator('.source-toggle').click();
  await expect(page.locator('.raw-rows')).toBeVisible();
  await page.locator('.raw-rows summary').first().click();
  await expect(page.locator('.raw-rows')).toContainText('VIOLATION_ID');
  await page.locator('.water-detail').screenshot({ path: 'test-results/water-detail-desktop.png' });
  await page
    .getByRole('link', {
      name: 'Open matching EPA facility: EQUISTAR CHEMICALS-LAPORTE →',
      exact: true,
    })
    .click();
  await expect(page.locator('.echo-detail')).toContainText('FRS ID 110034641635');
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__waterMap,
    ),
  ).toBe(true);
  await page
    .getByRole('link', { name: 'Look up this exact ID in Water Records →', exact: true })
    .click();
  await expect(page.locator('.water-detail')).toContainText('PWS ID TX1012680');
  expect(errors).toEqual([]);
});
test('phone water evidence retries and keeps historical measurements, treatment and empty coverage distinct', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let failed = false;
  await page.route('**/water/releases/*/systems/tx1013562.json', async (route) => {
    if (!failed) {
      failed = true;
      await route.abort();
    } else await route.continue();
  });
  await page.goto('/records/water/?system=TX1013562&kind=contaminant');
  await page.getByRole('button', { name: 'Expand evidence panel' }).click();
  await expect(page.locator('.water-detail [role=alert]')).toContainText('could not load');
  await page.getByRole('button', { name: 'Retry water evidence' }).click();
  await expect(page.locator('.water-timeline>li').first()).toBeVisible();
  await expect(page.locator('.measurement').first()).toContainText('not a current sample');
  await expect(page.locator('.safety-note')).toContainText(
    'cannot tell you whether your water is safe today',
  );
  await page.locator('.water-detail h3').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/water-phone.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Close system ×' }).click();
  await page.getByLabel('Explore a state', { exact: true }).selectOption('NY');
  await expect(page.locator('.water-card')).toHaveCount(0);
  await expect(page.locator('.empty')).toContainText('not the entire state or nation');
});
test('late water detail responses cannot replace a new selection and zero-record systems are not marked safe', async ({
  page,
}) => {
  const first = collection.systems[0],
    second = collection.systems[1];
  let release!: () => void,
    started = false;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/water/releases/*/systems/${first.id.toLowerCase()}.json`, async (route) => {
    started = true;
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await page.goto('/records/water/');
    await page.locator('.water-card').filter({ hasText: first.id }).click();
    await expect.poll(() => started).toBe(true);
    await page.locator('.water-card').filter({ hasText: second.id }).click();
    await expect(page.locator('.water-detail h3')).toHaveText(second.name);
    await expect(page.locator('.water-detail .connections')).toBeVisible();
    release();
    await page.waitForTimeout(150);
    await expect(page.locator('.water-detail h3')).toHaveText(second.name);
    await expect(page.locator('.water-detail [role=alert]')).toHaveCount(0);
  } finally {
    release();
  }
  await page.goto('/records/water/?system=CA0710003');
  await expect(page.locator('.water-detail .empty')).toContainText('not a clean bill of health');
});
