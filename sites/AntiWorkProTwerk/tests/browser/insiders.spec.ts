import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync('public/data/insiders/manifest.json', 'utf8'));
const collection = JSON.parse(
  readFileSync(`public/data/insiders/releases/${manifest.release}/data.json`, 'utf8'),
);
test('insider evidence distinguishes withholding, discloses plans and footnotes, and connects issuer-state context on one map', async ({
  page,
}) => {
  const errors: string[] = [],
    requests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/insiders\/releases\/[^/]+\/filings\//.test(r.url())) requests.push(r.url());
  });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/insiders/');
  await expect(page.locator('.coverage summary')).toContainText('305 filings');
  await expect(page.locator('.insider-card')).toHaveCount(20);
  await expect(page.locator('.insider-card').first()).toBeEnabled();
  expect(requests).toHaveLength(0);
  await expect(page.locator('.map-evidence-key')).toContainText('not trade locations');
  await expect(page.locator('[data-record-sites]')).toHaveAttribute('data-record-sites', '0');
  await page.evaluate(() => {
    (window as any).__insiderMap = document.querySelector('.maplibregl-canvas');
  });
  await page.screenshot({ path: 'test-results/insiders-desktop.png' });
  await page
    .getByLabel('Find an issuer, reporting person, CIK or accession')
    .fill('0001140361-26-025620');
  await page.getByRole('button', { name: 'Search insider records', exact: true }).click();
  await expect(page.locator('.insider-card')).toHaveCount(1);
  await page.locator('.insider-card').click();
  await expect(page.locator('.insider-detail h3')).toHaveText('Apple Inc.');
  await expect(page.locator('.plan-note')).toContainText('checkbox: reported');
  await expect(page.locator('.plan-note')).toContainText('not independent verification');
  await page.getByRole('button', { name: 'Tax / exercise payment', exact: true }).click();
  await expect(page.locator('.insider-entries>li').first()).toContainText(
    'Do not relabel this as an open-market sale',
  );
  await expect(page.locator('.linked-footnotes blockquote').first()).toBeVisible();
  await page.locator('.source-toggle').first().click();
  await expect(page.locator('.raw-row')).toContainText('TRANS_CODE');
  await expect(page.locator('.raw-row')).toContainText('NONDERIV_TRANS.tsv');
  await page.locator('.insider-detail').screenshot({ path: 'test-results/insiders-detail.png' });
  await page
    .getByRole('link', { name: 'Explore CA wage and employment context →', exact: true })
    .click();
  await expect(page.locator('.paycheck-page')).toBeVisible();
  await page
    .getByRole('link', {
      name: 'Explore insider disclosures by issuer business state →',
      exact: true,
    })
    .click();
  await expect(page.locator('.insiders-page')).toBeVisible();
  await expect(page.getByLabel('Explore a state', { exact: true })).toHaveValue('CA');
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__insiderMap,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test('phone insider amendments show holdings rather than inferred trades, retry safely, and preserve empty coverage', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let failed = false;
  await page.route('**/insiders/releases/*/filings/0000789019-26-000077.json', async (route) => {
    if (!failed) {
      failed = true;
      await route.abort();
    } else await route.continue();
  });
  await page.goto('/records/insiders/?filing=0000789019-26-000077');
  await page.getByRole('button', { name: 'Expand evidence panel' }).click();
  await expect(page.locator('.insider-detail [role=alert]')).toContainText('could not load');
  await page.getByRole('button', { name: 'Retry insider evidence' }).click();
  await expect(page.locator('.insider-entries>li')).toHaveCount(1);
  await expect(page.locator('.amendment-note')).toContainText('not another assumed trade');
  await expect(page.locator('.insider-entries .kind-badge')).toHaveText('Reported holding');
  await expect(page.locator('.section-heading h4')).toHaveText('Reported holdings are not trades');
  await page.locator('.insider-detail h3').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/insiders-phone.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Close filing ×' }).click();
  await page.getByLabel('Explore a state', { exact: true }).selectOption('AL');
  await expect(page.locator('.insider-card')).toHaveCount(0);
  await expect(page.locator('.empty')).toContainText('not a complete market-wide');
});
test('obsolete insider filing responses cannot replace a later selection', async ({ page }) => {
  const first = collection.filings[0],
    second = collection.filings[1];
  let release!: () => void,
    started = false;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/insiders/releases/*/filings/${first.accession}.json`, async (route) => {
    started = true;
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await page.goto('/records/insiders/');
    await page.locator('.insider-card').nth(0).click();
    await expect.poll(() => started).toBe(true);
    await page.locator('.insider-card').nth(1).click();
    await expect(page.locator('.insider-detail .connections')).toBeVisible();
    await expect(page.locator('.insider-detail .identity')).toContainText(second.accession);
    release();
    await page.waitForTimeout(150);
    await expect(page.locator('.insider-detail .identity')).toContainText(second.accession);
    await expect(page.locator('.insider-detail [role=alert]')).toHaveCount(0);
  } finally {
    release();
  }
});
