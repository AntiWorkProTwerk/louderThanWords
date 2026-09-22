import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('consumer radar explains real trends, opens source records, filters and preserves the shared map', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/complaints/');
  await expect(page.locator('.complaint-coverage')).toContainText('CFPB public records');
  await expect(page.locator('.complaint-stats > div').first()).toContainText('559');
  await expect(page.locator('.complaint-periods')).toContainText('90 days');
  await expect(page.locator('.complaint-periods')).toContainText('91 days');
  await expect(page.locator('.complaint-group')).toHaveCount(2);
  await expect(page.locator('.complaint-group').first()).toContainText('26 → 34');
  await expect(page.locator('.complaint-caution').first()).toContainText(
    'allegations, not findings',
  );
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-record-sites', '0');
  await page.getByText('How the radar works—and what is missing', { exact: true }).click();
  await expect(page.locator('.complaint-method')).toContainText('not AI sentiment');
  await expect(page.locator('.complaint-method')).toContainText('August 14, 2026');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download this complete source-backed snapshot ↧' }).click();
  const snapshot = JSON.parse(await readFile((await (await downloaded).path())!, 'utf8'));
  expect(snapshot.records).toHaveLength(1230);
  expect(snapshot.coverage.map((m: any) => m.total)).toEqual([265, 203, 203, 164, 188, 207]);
  expect(snapshot.records.every((r: any) => !('zip_code' in r))).toBe(true);
  await page.getByText('How the radar works—and what is missing', { exact: true }).click();
  await page.locator('.complaint-group').first().click();
  await expect(page.locator('.complaint-card')).toHaveCount(24);
  await expect(
    page.locator('.complaint-note').filter({ hasText: 'matching public records' }),
  ).toContainText('34 matching');
  await page.getByRole('button', { name: 'Show 24 more complaints' }).click();
  await expect(page.locator('.complaint-card')).toHaveCount(34);
  await page.getByText('Three examples from this slice', { exact: true }).click();
  await expect(page.locator('.complaint-examples button')).toHaveCount(3);
  await page.locator('.complaint-examples button').first().click();
  await expect(page.locator('.complaint-detail')).toContainText('original structured categories');
  await expect(page.getByRole('link', { name: 'Open original CFPB record ↗' })).toHaveAttribute(
    'href',
    /consumerfinance\.gov.*\/detail\/\d+$/,
  );
  await page.getByRole('button', { name: 'Close record ×' }).click();
  await page.getByRole('button', { name: 'All categories', exact: true }).click();
  await expect(page).not.toHaveURL(/cluster=/);
  await expect(page.locator('.complaint-group')).toHaveCount(24);
  await page.getByRole('button', { name: 'Show 24 more categories' }).click();
  await expect(page.locator('.complaint-group')).toHaveCount(48);
  await page.getByRole('button', { name: 'Show 24 more categories' }).click();
  await expect(page.locator('.complaint-group')).toHaveCount(71);
  await page
    .getByLabel('Company within this collection', { exact: true })
    .selectOption('SOFI TECHNOLOGIES, INC.');
  await page.getByLabel('Records and map', { exact: true }).selectOption('all');
  await page.getByRole('button', { name: 'Complaint records', exact: true }).click();
  await expect(page.locator('.complaint-card').first()).toContainText('SOFI TECHNOLOGIES, INC.');
  await page.evaluate(() => {
    (window as any).__complaintMap = document.querySelector('.maplibregl-canvas');
  });
  await page.getByRole('link', { name: 'Regional context ↗' }).click();
  await expect(page.locator('.paycheck-page')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__complaintMap,
    ),
  ).toBe(true);
  await page.getByRole('link', { name: 'Consumer complaints in this geography ↗' }).click();
  await expect(page.locator('.complaints-page')).toBeVisible();
  await page.locator('.complaint-groups').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/consumer-radar-desktop.png' });
  expect(errors).toEqual([]);
});

test('phone radar supports reduced motion, state slices, empty results, capture changes and invalid periods', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/records/complaints/?state=TX&view=records&period=all');
  await page.getByRole('button', { name: 'Expand evidence panel' }).click();
  await expect(page.locator('.complaint-filter-note')).toContainText('TX');
  const labels = await page.locator('.complaint-card > span').allTextContents();
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.every((label) => label.includes('TX'))).toBe(true);
  await page.locator('.complaint-card').first().click();
  await expect(page.locator('.complaint-detail')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/consumer-radar-phone.png', fullPage: true });
  await page.getByRole('button', { name: 'Close record ×' }).click();
  await page.getByLabel('Search record fields', { exact: true }).fill('nonexistent-complaint-xyz');
  await expect(page.getByRole('heading', { name: 'No records in this slice.' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByRole('button', { name: 'Capture changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No capture changes yet.' })).toBeVisible();
  await page.goto('/records/complaints/?split=2020-01');
  await expect(page.getByRole('alert')).toContainText('Choose a split month');
});
