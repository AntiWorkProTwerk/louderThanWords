import { test, expect } from '@playwright/test';

test('locating a company moves the existing map without changing data filters', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/records/connections/?company=0000789019');
  await page.getByRole('button', { name: 'Expand evidence panel', exact: true }).click();
  await expect(page.locator('.map-loading')).toHaveCount(0);
  await page.evaluate(
    () => ((window as any).__locateCanvas = document.querySelector('.maplibregl-canvas')),
  );
  await page.getByRole('button', { name: /Locate on map/ }).click();
  await expect(page.getByRole('button', { name: 'Focus WA', exact: true })).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Expand evidence panel', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/connections\/\?company=0000789019$/);
  await expect(page.locator('.company-picker button')).toHaveCount(3);
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-camera', /-1[12][0-9]/);
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__locateCanvas,
    ),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/connections-locate-phone.png' });
});

test('connection state selection and keyboard links preserve exact identities', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/connections/');
  await page.getByLabel('Explore a state', { exact: true }).selectOption('WA');
  await expect(page).toHaveURL(/state=WA/);
  await expect(page.locator('.company-picker button')).toHaveCount(1);
  await expect(page.locator('.identity-node')).toContainText('CIK 0000789019');
  const major = page.locator('a.view-node').filter({ hasText: 'Major stakes' });
  await major.focus();
  await expect(major).toBeFocused();
  await expect(page.locator('.graph-lines path.lit')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/major-stakes\/\?issuer=0000789019/);
  await page.goBack();
  await expect(page.locator('.identity-node')).toContainText('CIK 0000789019');
  await page.getByLabel('Explore a state', { exact: true }).selectOption('TX');
  await expect(page.locator('.empty')).toContainText('No matching connected company');
});

test('connections show exact-ID evidence, dates and a persistent map across views', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/connections/?company=0000789019');
  await expect(page.locator('.identity-node')).toContainText('MSFT');
  await expect(page.locator('a.view-node')).toHaveCount(3);
  await expect(page.locator('.graph-lines path')).toHaveCount(3);
  await expect(page.locator('.time-row')).toHaveCount(3);
  await expect(page.locator('.graph-caption')).toContainText('same issuer ID');
  await expect(page.locator('.map-loading')).toHaveCount(0);
  await expect(page.locator('.map-evidence-key')).toContainText(
    'Connections are not proof of causation',
  );
  await page.evaluate(
    () => ((window as any).__connectionsCanvas = document.querySelector('.maplibregl-canvas')),
  );
  await page.screenshot({ path: 'test-results/connections-desktop.png' });
  await page.locator('.connection-graph').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/connections-graph-desktop.png' });
  await page.locator('a.view-node').filter({ hasText: 'Insider records' }).click();
  await expect(page).toHaveURL(/records\/insiders\/\?issuer=0000789019/);
  await expect(page.locator('.insiders-page')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__connectionsCanvas,
    ),
  ).toBe(true);
  await page.getByRole('link', { name: 'Connections', exact: true }).click();
  await page.locator('.company-picker button').filter({ hasText: 'Alphabet' }).click();
  await expect(page.locator('a.view-node')).toHaveCount(2);
  await expect(page.locator('.unavailable')).toContainText('No matching records');
  expect(errors).toEqual([]);
});
test('phone connections support search, reduced motion, evidence downloads and honest empty states', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/records/connections/?company=0000789019');
  await page.getByRole('button', { name: 'Expand evidence panel', exact: true }).click();
  await expect(page.locator('.connection-detail')).toBeVisible();
  await expect(page.locator('.evidence-workspace')).toHaveCSS(
    'background-color',
    'rgb(251, 253, 254)',
  );
  await page.locator('.connection-graph').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/connections-graph-phone.png' });
  await page.locator('.provenance summary').click();
  await expect(page.locator('.provenance')).toContainText('must not be added together');
  const download = page.waitForEvent('download');
  await page
    .getByRole('link', { name: 'Download the complete connection index ↓', exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe('data.json');
  await page.screenshot({ path: 'test-results/connections-phone.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.getByLabel('Find a company').fill('no such company');
  await expect(page.locator('.empty')).toContainText('Absence here does not mean no filings exist');
  await page.getByRole('link', { name: 'Reset filters', exact: true }).click();
  await page.getByLabel('Find a company').fill('MSFT');
  await page.getByRole('button', { name: 'Search ↗', exact: true }).click();
  await expect(page.locator('.company-picker button')).toHaveCount(1);
  expect(
    await page
      .locator('.graph-lines path')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
});
