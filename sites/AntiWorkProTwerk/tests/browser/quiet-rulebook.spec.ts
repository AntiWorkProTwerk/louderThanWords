import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('rulebook connects exact dates, lazy source passages and shared dockets while preserving the map', async ({
  page,
}) => {
  const errors: string[] = [],
    texts: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (r.url().includes('/data/rules/texts/')) texts.push(r.url());
  });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/trials/');
  await expect(page.locator('.map-state-name')).toHaveCount(51, { timeout: 60000 });
  await page.evaluate(() => {
    (window as any).__rulesMap = document.querySelector('.maplibregl-canvas');
  });
  await page.getByRole('button', { name: /Explore data/ }).click();
  await page.getByRole('dialog').locator('.catalog-card').filter({hasText:'Quiet rulebook'}).click();
  await expect(page.locator('.rule-card')).toHaveCount(8);
  expect(texts).toEqual([]);
  await page.getByLabel('Geographic context · not a rule filter').selectOption('CA');
  await expect(page.locator('.rule-card')).toHaveCount(8);
  await page.getByRole('searchbox', { name: 'Search records' }).fill('2025-11437');
  await expect(page.locator('.rule-card')).toHaveCount(1);
  await page.locator('.rule-card').click();
  await expect(page.locator('.rule-dates')).toContainText('August 19, 2025');
  await expect(page.locator('.rule-date-grid')).toContainText('Not supplied');
  await expect(page.locator('.rule-passage')).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Official GovInfo PDF ↗' })).toHaveAttribute(
    'href',
    'https://www.govinfo.gov/content/pkg/FR-2025-06-23/pdf/2025-11437.pdf',
  );
  await page.getByLabel('Source section', { exact: true }).selectOption('supplement');
  await expect(page.locator('.rule-passages')).toContainText('battery');
  await expect(page.locator('.rule-connections')).toContainText('2070-AK83');
  await page.locator('.rule-connections>button').filter({ hasText: '2024-12-17' }).click();
  await expect(page.locator('.rule-detail>.eyebrow')).toContainText('2024-29274');
  await expect(page.locator('.rule-passage.amendment').first()).toBeVisible();
  expect(await page.locator('.rule-passage').count()).toBeLessThanOrEqual(40);
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__rulesMap,
    ),
  ).toBe(true);
  await page.locator('.rule-detail').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/quiet-rulebook-desktop.png' });
  await page.reload();
  await expect(page.locator('.rule-detail>.eyebrow')).toContainText('2024-29274');
  expect(errors).toEqual([]);
});

test('phone topics persist locally and a later snapshot produces an unread topic update', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/records/rules/');
  await page.getByRole('button', { name: 'Expand evidence panel' }).click();
  await page.getByRole('button', { name: 'Following', exact: true }).click();
  await page.getByRole('button', { name: '+ Environmental protection', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '✓ Environmental protection', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(
    page.getByRole('button', { name: '✓ Environmental protection', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Updates (0)', exact: true })).toBeVisible();
  const manifest = JSON.parse(await readFile('public/data/rules/manifest.json', 'utf8'));
  const payload = JSON.parse(
    await readFile(`public/data/rules/releases/${manifest.release}/data.json`, 'utf8'),
  );
  const doc = payload.documents.find((d: any) => d.topics.includes('Environmental protection'));
  doc.dates += ' Browser-test changed date statement.';
  const dataHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    release = `rr-${dataHash.slice(0, 24)}`;
  await page.route('**/data/rules/manifest.json', (route) =>
    route.fulfill({ json: { ...manifest, dataHash, release } }),
  );
  await page.route(`**/data/rules/releases/${release}/data.json`, (route) =>
    route.fulfill({ json: payload }),
  );
  await page.getByRole('button', { name: 'Expand evidence panel' }).click();
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Updates (1)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Updates (1)', exact: true }).click();
  await expect(page.locator('.rule-card')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/quiet-rulebook-phone.png', fullPage: true });
  await page.getByRole('button', { name: 'Mark updates read', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No unread updates.' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export topics', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('quiet-rulebook-topics.json');
  await page
    .getByLabel('Import topics')
    .setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{}'),
    });
  await expect(page.locator('.evidence-workspace').getByRole('status')).toContainText('Existing topics were kept');
});
