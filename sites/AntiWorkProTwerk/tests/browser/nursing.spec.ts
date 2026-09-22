import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { nursingShard } from '../../src/lib/civic/nursing-index';

test('nursing portfolios join by disclosed ID, show real map sites and lazy evidence, and preserve the map across context links', async ({
  page,
}) => {
  const errors: string[] = [],
    requests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/\/(?:facilities|parties)-v1\//.test(r.url()) || r.url().endsWith('/parties-v1.json'))
      requests.push(r.url());
  });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/nursing/');
  await expect(page.locator('.coverage summary')).toContainText('3,008 facilities');
  await expect(page.locator('.facility-card')).toHaveCount(24);
  await expect(page.locator('.facility-card').first()).toBeEnabled();
  expect(requests).toHaveLength(0);
  await expect(page.locator('[data-record-sites]')).toHaveAttribute('data-record-sites', '3008');
  await page.evaluate(() => {
    (window as any).__nursingMap = document.querySelector('.maplibregl-canvas');
  });
  await page.locator('.owner-options button').filter({ hasText: 'PACS HOLDINGS, LLC' }).click();
  await expect(page.locator('.portfolio')).toContainText('PAC 6103289202');
  await expect(page.locator('[data-record-sites]')).toHaveAttribute('data-record-sites', '130');
  await page.getByLabel('Connect this party’s mapped facilities', { exact: true }).check();
  await expect
    .poll(async () =>
      Number(await page.locator('[data-record-links]').getAttribute('data-record-links')),
    )
    .toBeGreaterThan(100);
  await page.locator('.facility-card').first().click();
  await expect(page.locator('.associations article').first()).toBeVisible();
  await expect(page.locator('.facility-detail')).toContainText('not an acquisition date');
  await expect(page.locator('.metrics')).toContainText('All collected in region');
  await page
    .locator('.facility-detail')
    .screenshot({ path: 'test-results/nursing-detail-desktop.png' });
  await page
    .getByRole('link', { name: 'Explore this state’s wage context →', exact: true })
    .click();
  await expect(page).toHaveURL(/records\/paycheck\/\?state=/);
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__nursingMap,
    ),
  ).toBe(true);
  await page
    .getByRole('link', { name: 'Explore nursing facilities in this state →', exact: true })
    .click();
  await expect(page.locator('.coverage summary')).toContainText('3,008 facilities');
  await page.getByLabel('Explore a state', { exact: true }).selectOption('');
  await page.locator('.nursing-page header').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/nursing-desktop.png' });
  expect(errors).toEqual([]);
});

test('phone nursing evidence retries safely, searches parties and distinguishes unavailable state coverage', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let failed = false;
  await page.route('**/facilities-v1/*.json', async (route) => {
    if (!failed) {
      failed = true;
      await route.abort();
    } else await route.continue();
  });
  await page.goto('/records/nursing/');
  await page.getByRole('button', { name: 'Expand evidence panel' }).click();
  await page.locator('.facility-card').first().click();
  await expect(page.getByRole('alert')).toContainText('facility evidence could not load');
  await page.getByRole('button', { name: 'Retry facility details' }).click();
  await expect(page.locator('.associations article').first()).toBeVisible();
  await page.getByRole('button', { name: 'Close facility ×' }).click();
  await page.getByLabel('Find any disclosed person or organization', { exact: true }).fill('PACS');
  await page.getByRole('button', { name: 'Find party', exact: true }).click();
  await expect(page.locator('.search-results')).toContainText('PACS HOLDINGS');
  await page.locator('.search-results button').filter({ hasText: 'PACS HOLDINGS, LLC' }).click();
  await expect(page.locator('.portfolio')).toContainText('6103289202');
  await page.getByLabel('Disclosed relationship', { exact: true }).selectOption('management');
  await expect(page.locator('.notice[role=status]')).toContainText('No facilities match');
  await page.getByLabel('Disclosed relationship', { exact: true }).selectOption('ownership');
  await page.locator('.portfolio').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/nursing-phone.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Clear owner ×' }).click();
  await page.getByLabel('Explore a state', { exact: true }).selectOption('NY');
  await expect(page.locator('.facility-card')).toHaveCount(0);
  await expect(page.locator('.notice[role=status]')).toContainText(
    'not evidence of absence nationally',
  );
});

test('obsolete facility evidence cannot replace a newer selection', async ({ page }) => {
  const manifest = JSON.parse(readFileSync('public/data/nursing/manifest.json', 'utf8'));
  const data = JSON.parse(
    readFileSync(`public/data/nursing/releases/${manifest.release}/data.json`, 'utf8'),
  );
  const first = data.facilities[0],
    second = data.facilities.find(
      (f: { id: string }) =>
        nursingShard('facilities', f.id) !== nursingShard('facilities', first.id),
    );
  let release!: () => void,
    started = false;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/${nursingShard('facilities', first.id)}`, async (route) => {
    started = true;
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response }).catch(() => {}); // The obsolete request may already be aborted.
  });
  try {
    await page.goto('/records/nursing/');
    await page.locator('.facility-card').filter({ hasText: first.name }).click();
    await expect.poll(() => started).toBe(true);
    await page.locator('.facility-card').filter({ hasText: second.name }).click();
    await expect(page.locator('.facility-detail h3')).toHaveText(second.name);
    await expect(page.locator('.source-notes')).toBeVisible();
    release();
    await page.waitForTimeout(150);
    await expect(page.locator('.facility-detail h3')).toHaveText(second.name);
    await expect(page.locator('.facility-detail [role=alert]')).toHaveCount(0);
  } finally {
    release();
  }
});

test('unnamed disclosed parties retain exact identifiers and relationships instead of guessed names', async ({
  page,
}) => {
  await page.goto('/records/nursing/?owner=0042702490');
  await expect(page.locator('.portfolio h3')).toHaveText('Name not reported');
  await expect(page.locator('.portfolio')).toContainText('PAC 0042702490');
  await expect(page.locator('.facility-card')).toHaveCount(1);
  await expect(page.locator('.facility-card')).toContainText('555416');
});
