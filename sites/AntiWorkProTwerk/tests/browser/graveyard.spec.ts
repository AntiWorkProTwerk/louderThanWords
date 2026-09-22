import { test, expect } from '@playwright/test';

test('bill evidence keeps related-law pathways, lazy details and map across product navigation', async ({
  page,
}) => {
  const errors: string[] = [],
    requests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (r.url().includes('/bills/')) requests.push(r.url());
  });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/graveyard/');
  await expect(page.locator('.coverage summary')).toContainText('173 bills');
  await expect(page.locator('.bill-card')).toHaveCount(24);
  await expect(page.locator('.bill-card').first()).toBeEnabled();
  expect(requests).toHaveLength(0);
  await page.getByLabel('Bill Congress', { exact: true }).selectOption('119');
  await page.getByLabel('Bill policy area', { exact: true }).selectOption('Immigration');
  await page.locator('.bill-card').filter({ hasText: 'H.R. 29' }).click();
  await expect(page.locator('.last-action')).toContainText('2025-02-10');
  await expect(page.locator('.bill-detail .notice')).toContainText('Contained in public law');
  await expect(page.locator('.related')).toContainText('119-s-5');
  await page.evaluate(
    () => ((window as any).__billMap = document.querySelector('.maplibregl-canvas')),
  );
  await page.getByRole('button', { name: 'Follow collected bill →' }).click();
  await expect(page.locator('.last-action')).toContainText('Became Public Law No: 119-1');
  await expect(page.locator('.amendments summary')).toContainText('Amendments');
  await page.locator('.amendments summary').click();
  await expect(page.locator('.amendments')).toContainText(
    'Submitted amendments are not necessarily offered',
  );
  await page.goBack();
  await expect(page.locator('.detail-top')).toContainText('H.R. 29');
  await page.getByRole('link', { name: 'Look up this exact bill in Vote Receipts →' }).click();
  await expect(page.locator('.vote-card').first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__billMap,
    ),
  ).toBe(true);
  await page.locator('.vote-card').first().click();
  await page.getByRole('link', { name: 'Look up this bill’s recorded progress →' }).click();
  await expect(page.locator('.last-action')).toContainText('2025-02-10');
  await page.getByLabel('Explore a state', { exact: true }).selectOption('TX');
  await expect(page.locator('.bill-detail')).toHaveCount(0);
  await expect(page).toHaveURL(/state=TX/);
  await page.getByLabel('Explore a state', { exact: true }).selectOption('');
  await page.locator('.bill-page header').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/bill-graveyard-desktop.png' });
  expect(errors).toEqual([]);
});

test('phone bill evidence supports retry, bounded details, reduced motion and no viewport overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let failed = false;
  await page.route('**/bills/119-hr-29.json', async (route) => {
    if (!failed) {
      failed = true;
      await route.abort();
    } else await route.continue();
  });
  await page.goto('/records/graveyard/?bill=119-hr-29');
  await page.getByRole('button', { name: 'Expand evidence panel' }).click();
  await expect(page.getByRole('alert')).toContainText('detailed source record could not load');
  await page.getByRole('button', { name: 'Retry bill details' }).click();
  await expect(page.locator('.history li')).toHaveCount(14);
  await page.locator('.last-action').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/bill-graveyard-phone.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Close ×', exact: true }).click();
  await page
    .getByLabel('Find a proposal, sponsor, or subject', { exact: true })
    .fill('nonexistent-bill-query-xyz');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.bill-card')).toHaveCount(0);
  await expect(page.locator('.evidence-workspace').getByRole('status')).toContainText('No bills match');
});
