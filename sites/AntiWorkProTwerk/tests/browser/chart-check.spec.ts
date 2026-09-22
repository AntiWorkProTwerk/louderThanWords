import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('chart windows preserve gaps, expose reproducible calculations and connect state unemployment on the same map', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/rules/');
  await expect(page.locator('.map-state-name')).toHaveCount(51, { timeout: 60000 });
  await page.evaluate(() => {
    (window as any).__chartMap = document.querySelector('.maplibregl-canvas');
  });
  await page.getByRole('button', { name: /Explore data/ }).click();
  await page.getByRole('dialog').locator('.catalog-card').filter({hasText:'Chart check'}).click();
  await expect(page.locator('.chart-analysis h3').first()).toContainText('Average hourly earnings');
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-metric-states', '0');
  await page.getByRole('button', { name: 'Full captured history', exact: true }).click();
  await expect(page.locator('.chart-result')).toContainText('119 elapsed months');
  await page.getByLabel('Value basis', { exact: true }).selectOption('real');
  await expect(page.locator('.chart-warning')).toContainText('2025-10');
  const path = await page.locator('.window-chart svg').first().locator('path').getAttribute('d');
  expect((path!.match(/M/g) ?? []).length).toBe(2);
  await page.getByLabel('Vertical scale', { exact: true }).selectOption('fit');
  await expect(page.locator('.window-chart figcaption')).toContainText('Fitted y-axis');
  await page.getByRole('button', { name: 'Show accessible data table' }).click();
  await expect(page.locator('.chart-table-wrap tbody tr')).toHaveCount(24);
  await page.getByRole('button', { name: 'Show 24 more months' }).click();
  await expect(page.locator('.chart-table-wrap tbody tr')).toHaveCount(48);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download calculation', exact: true }).click();
  const file = await download;
  const calculation = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(calculation.configuration.adjustment).toBe('real');
  expect(calculation.result.missingMonths).toEqual(['2025-10']);
  const first = calculation.result.points[0],
    last = calculation.result.points.at(-1);
  expect(calculation.result.change).toBeCloseTo(
    (last.nominal / last.cpi / (first.nominal / first.cpi) - 1) * 100,
    9,
  );
  await page.getByRole('button', { name: 'Copy frozen chart link', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`release=${calculation.release}`));
  await page.getByLabel('Measure', { exact: true }).selectOption('unemployment');
  await page.getByLabel('Geography', { exact: true }).selectOption('TX');
  await expect(page.locator('.chart-result')).toContainText('pp');
  await expect(page.getByLabel('Value basis', { exact: true })).toBeDisabled();
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-metric-states', '51');
  await expect(page.locator('.map-state-name[data-state="TX"]')).toHaveAttribute(
    'title',
    /unemployment in 2025-12/,
  );
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__chartMap,
    ),
  ).toBe(true);
  await page.locator('.window-chart').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/chart-check-desktop.png' });
  await page.reload();
  await expect(page.getByLabel('Geography', { exact: true })).toHaveValue('TX');
  await expect(page).toHaveURL(new RegExp(calculation.release));
  expect(errors).toEqual([]);
});

test('phone chart controls explain invalid windows and missing endpoint months without inventing state inflation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/records/charts/?from=2016-01&through=2025-10&adjustment=real');
  await page.getByRole('button', { name: 'Expand evidence panel' }).click();
  await expect(page.getByRole('alert')).toContainText('CPI');
  await page.getByLabel('End month', { exact: true }).fill('2025-12');
  await page.getByLabel('End month', { exact: true }).press('Tab');
  await expect(page.locator('.chart-result')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.window-chart').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/chart-check-phone.png', fullPage: true });
  await page.goto('/records/charts/?through=not-a-month');
  await expect(
    page.getByRole('heading', { name: 'This window cannot be calculated' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect(page.locator('.chart-result')).toBeVisible();
  await page.getByLabel('Measure', { exact: true }).selectOption('unemployment');
  await page.getByLabel('End month', { exact: true }).fill('2025-10');
  await page.getByLabel('End month', { exact: true }).press('Tab');
  await expect(page.locator('.chart-warning').first()).toContainText('endpoint');
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-metric-states', '0');
  expect(errors).toEqual([]);
});
