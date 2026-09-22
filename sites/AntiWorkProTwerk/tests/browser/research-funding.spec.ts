import { test, expect } from '@playwright/test';
test('research funding compares fiscal years, maps institutions and connects exact publication evidence in both directions', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/research/');
  await expect(page.locator('.research-group')).toHaveCount(8);
  await expect(page.locator('.research-stats')).toContainText('$6,039,292');
  await expect(page.locator('.research-stats')).toContainText('+$2,108,425');
  await expect
    .poll(async () => Number(await page.getByTestId('us-map').getAttribute('data-record-sites')))
    .toBe(13);
  await page.evaluate(() => {
    (window as any).__researchMap = document.querySelector('.maplibregl-canvas');
  });
  await page.getByRole('button', { name: 'Topics', exact: true }).click();
  await expect(page.locator('.research-caution').first()).toContainText('cannot be added');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.locator('.research-card')).toHaveCount(13);
  await page.getByRole('searchbox').fill('K01HL146977');
  await expect(page.locator('.research-card')).toHaveCount(1);
  await page.locator('.research-card').click();
  await expect(page.locator('.research-detail')).toContainText('Same core project');
  await expect(page.locator('.research-links a').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/research-funding-desktop.png' });
  await page.locator('.research-links a').first().click();
  await expect(page.locator('.trial-detail')).toBeVisible();
  await page.getByText('Linked publication identifiers', { exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Connected NIH funding records' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__researchMap,
    ),
  ).toBe(true);
  await page.locator('.trial-detail a[href*="/records/research/?project="]').first().click();
  await expect(page.locator('.research-detail')).toBeVisible();
  await page.reload();
  await expect(page.locator('.research-detail')).toBeVisible();
  await page.getByRole('button', {name:'Projects',exact:true}).click();
  await page.getByRole('searchbox').fill('K01HL166436');
  await expect(page.locator('.research-card')).toHaveCount(1);
  await page.locator('.research-card').click();
  await page.getByRole('checkbox', {name:'Connect locations reported for this core project'}).check();
  await expect.poll(async()=>Number(await page.getByTestId('us-map').getAttribute('data-record-sites'))).toBe(2);
  await expect.poll(async()=>Number(await page.getByTestId('us-map').getAttribute('data-record-links'))).toBe(1);
  await expect(page.locator('.research-detail')).toContainText('not money transfers');
  expect(errors).toEqual([]);
});
test('phone funding explorer has accessible filtered records and reduced-motion detail', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/records/research/');
  await page.getByRole('button', { name: 'Expand evidence panel' }).click();
  await page.getByLabel('Selected fiscal year', { exact: true }).selectOption('2023');
  await expect(page.locator('.research-stats')).toContainText('$3,930,867');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.locator('.research-card')).toHaveCount(12);
  await page.locator('.research-card').first().click();
  await expect(page.locator('.research-detail')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/research-funding-phone.png', fullPage: true });
  await page.getByRole('button', { name: 'Close project ×' }).click();
  await page.getByRole('searchbox').fill('not-a-real-grant-zzz');
  await expect(page.getByRole('heading', { name: 'No matching applications.' })).toBeVisible();
});
