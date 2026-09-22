import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('regional paycheck compares real source values, preserves the map, and exports frozen calculations', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/paycheck/?state=TX&from=2019-12&through=2025-12');
  await expect(page.locator('.paycheck-coverage')).toContainText('51 states / D.C.');
  await expect(page.locator('.paycheck-summary')).toContainText('+4.28%');
  await expect(page.locator('.paycheck-summary')).toContainText('+11.59%');
  await expect(page.locator('.paycheck-region')).toHaveCount(51);
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-metric-states', '51');
  await expect(page.locator('.map-state-name[data-state="TX"]')).toContainText('Δ +4.3%');
  await page.evaluate(() => {
    (window as any).__paycheckMap = document.querySelector('.maplibregl-canvas');
  });
  await page.getByRole('button', { name: 'Payroll jobs', exact: true }).click();
  await expect(page.locator('.map-state-name[data-state="TX"]')).toContainText('Δ +11.6%');
  await page.getByRole('button', { name: 'Inflation-adjusted pay', exact: true }).click();
  await page.locator('.paycheck-chart').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/paycheck-desktop.png' });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download calculation ↧' }).click();
  const download = await downloadPromise;
  const result = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(result.configuration).toEqual({ state: 'TX', from: '2019-12', through: '2025-12' });
  expect(result.release).toMatch(/^pc-[a-f0-9]{24}$/);
  expect(result.regions).toHaveLength(51);
  expect(result.result.selected.real).toBeCloseTo(4.28419289, 6);
  await page.getByRole('button', { name: 'Copy frozen comparison' }).click();
  await expect(page).toHaveURL(/release=pc-/);
  await page.reload();
  await expect(page.locator('.paycheck-summary')).toContainText('+4.28%');
  await page.evaluate(() => {
    (window as any).__paycheckMap = document.querySelector('.maplibregl-canvas');
  });
  await page.getByRole('link', { name: 'Unemployment in the same geography and window ↗' }).click();
  await expect(page.locator('.chart-page')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__paycheckMap,
    ),
  ).toBe(true);
  await page.getByRole('link', { name: 'Regional paychecks ↗' }).click();
  await expect(page.locator('.paycheck-page')).toBeVisible();
  await page.getByLabel('Compare a geography', { exact: true }).selectOption('CA');
  await expect(page.locator('.paycheck-summary')).toContainText('California');
  expect(errors).toEqual([]);
});
test('phone paycheck handles invalid seasonal windows, missing CPI endpoints and unavailable pinned releases', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/records/paycheck/?state=TX&from=2019-12&through=2025-12');
  await page.getByRole('button', { name: 'Expand evidence panel' }).click();
  await page.getByLabel('End month', { exact: true }).fill('2025-11');
  await expect(page.getByRole('alert')).toContainText('same calendar month');
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-metric-states', '0');
  await page.getByLabel('Start month', { exact: true }).fill('2019-10');
  await page.getByLabel('End month', { exact: true }).fill('2025-10');
  await expect(page.locator('.paycheck-summary')).toContainText('Unavailable');
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-metric-states', '0');
  await page.getByRole('button', { name: 'Payroll jobs', exact: true }).click();
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-metric-states', '51');
  await page.getByLabel('Start month', { exact: true }).fill('2019-12');
  await page.getByLabel('End month', { exact: true }).fill('2025-12');
  await page.locator('.paycheck-chart').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/paycheck-phone.png', fullPage: true });
  await page.getByRole('searchbox', { name: 'Find a state' }).fill('zz no state');
  await expect(page.getByText('No states match this search.')).toBeVisible();
  await page.goto('/records/paycheck/?release=pc-000000000000000000000000');
  await expect(page.getByRole('heading', { name: 'Snapshot unavailable' })).toBeVisible();
});
