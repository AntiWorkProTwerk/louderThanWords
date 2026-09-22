import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { StakeData } from '../../src/lib/civic/major-stakes';
const root = 'public/data/major-stakes/',
  manifest = JSON.parse(readFileSync(root + 'manifest.json', 'utf8'));
const data: StakeData = JSON.parse(
  readFileSync(`${root}releases/${manifest.release}/data.json`, 'utf8'),
);
const howard = data.series.find(
  (s) => s.issuerCik === '0001981792' && s.filerCik === '0001336528',
)!;
const vanguard = data.series.find(
  (s) =>
    s.issuerCik === '0001652044' && s.filerCik === '0000102909' && s.cusips.includes('02079K305'),
)!;

test('major stakes preserve original history, missing purpose and the shared map across exact-identity links', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto(`/records/major-stakes/?issuer=0001981792&series=${howard.id}`);
  await expect(page.locator('.stake-detail')).toBeVisible();
  await expect(page.locator('.timeline button')).toHaveCount(howard.filings.length);
  await expect(page.locator('.statement')).toBeVisible();
  await expect(page.locator('.stake-detail')).toContainText('begins with an amendment');
  await expect(page.locator('.map-loading')).toHaveCount(0);
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);
  await expect(page.locator('.map-evidence-key')).toContainText('not investor homes');
  await page.evaluate(() => {
    (window as any).__stakesMap = document.querySelector('.maplibregl-canvas');
  });
  await page.screenshot({ path: 'test-results/major-stakes-desktop.png' });
  await page.locator('.timeline button').filter({ hasText: 'Filed 2026-04-29' }).click();
  await expect(page.locator('.not-restated')).toContainText('does not erase');
  await page.getByRole('button', { name: /Read the earlier disclosed text/ }).click();
  await expect(page.locator('.statement')).toBeVisible();
  await page
    .getByRole('link', {
      name: 'Open this filing entity’s quarterly managed holdings →',
      exact: true,
    })
    .click();
  await expect(page.locator('.holdings-page')).toBeVisible();
  await page
    .getByRole('link', { name: 'Read this filer’s major-stake disclosures →', exact: true })
    .click();
  await expect(page.locator('.stake-card')).not.toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__stakesMap,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('phone major-stake evidence retries, explains a zero reporting position and downloads a portable comparison', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let failed = false;
  const last = vanguard.filings.at(-1)!;
  await page.route(`**/major-stakes/releases/*/filings/${last}.json`, async (route) => {
    if (!failed) {
      failed = true;
      await route.abort();
    } else await route.continue();
  });
  await page.goto(`/records/major-stakes/?series=${vanguard.id}`);
  await page.getByRole('button', { name: 'Expand evidence panel', exact: true }).click();
  await expect(page.locator('.stake-detail [role=alert]')).toContainText('could not load');
  await page.getByRole('button', { name: 'Retry filing evidence', exact: true }).click();
  await expect(page.locator('.reporter-note')).toContainText(/realignment|reorganiz/i);
  await expect(page.locator('.position-stats')).toContainText('0%');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download history comparison', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('ownership-disclosure-history.json');
  await page.locator('.source-fields>summary').click();
  await expect(page.locator('.source-fields')).toContainText('Original XML SHA-256');
  await page.locator('.stake-detail').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/major-stakes-phone.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('major-stake filters and map states preserve scope and never turn missing history into zero', async ({
  page,
}) => {
  await page.goto('/records/major-stakes/?state=MA&initial=1');
  await expect(page.locator('.stake-card')).toHaveCount(6);
  await page.getByLabel('Explore a state', { exact: true }).selectOption('TX');
  await expect(page).toHaveURL(/records\/major-stakes\//);
  await expect(page.locator('.stake-card')).toHaveCount(1);
  await page.getByLabel('Schedule type', { exact: true }).selectOption('13D');
  await expect(page.locator('.empty')).toContainText('does not mean no large shareholders');
  await page.getByRole('button', { name: 'Clear disclosure filters', exact: true }).click();
  await expect(page.locator('.stake-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Show more disclosure histories', exact: true }).click();
  await expect(page.locator('.stake-card')).toHaveCount(20);
  await page.getByLabel('Explore a state', { exact: true }).selectOption('AK');
  await expect(page.locator('.empty')).toBeVisible();
});

test('a late filing response cannot replace a newer major-stake selection', async ({ page }) => {
  const slow = howard.filings.at(-1)!,
    fast = '0001140361-26-017890';
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let started!: () => void;
  const requested = new Promise<void>((resolve) => (started = resolve));
  await page.route(`**/major-stakes/releases/*/filings/${slow}.json`, async (route) => {
    const response = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await page.goto(`/records/major-stakes/?issuer=0001981792&series=${howard.id}`);
    await requested;
    await page.locator('.timeline button').filter({ hasText: 'Filed 2026-04-29' }).click();
    await expect(page.locator('.filing-heading')).toContainText(fast);
    await expect(page.locator('.not-restated')).toBeVisible();
    release();
    await page.waitForTimeout(200);
    await expect(page.locator('.filing-heading')).toContainText(fast);
    await expect(page.locator('.not-restated')).toBeVisible();
    await expect(page.locator('.statement')).toHaveCount(0);
  } finally {
    release();
  }
});
