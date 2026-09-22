import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('state patterns animate dated pairs, preserve the cohort and connect frozen sources on one map', async ({
  page,
}) => {
  const errors: string[] = [];
  const representativeRequests: string[] = [];
  page.on('request', request => { if (/\/states\/[^/]+\/summary\.json/.test(request.url())) representativeRequests.push(request.url()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/patterns/');
  await expect(page.locator('.pattern-dot')).toHaveCount(51);
  await expect(page.locator('.map-loading')).toHaveCount(0);
  await page.evaluate(
    () => ((window as any).__patternCanvas = document.querySelector('.maplibregl-canvas')),
  );
  await page.locator('.pattern-plot').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/patterns-desktop.png' });
  const r = await page.getByTestId('pattern-r').innerText();
  await page.getByLabel('State or district', { exact: true }).selectOption('CA');
  await expect(page.locator('.state-top h3')).toHaveText('California');
  await expect(page.getByTestId('pattern-r')).toHaveText(r);
  await expect(page.locator('.pattern-dot')).toHaveCount(51);
  await page.locator('.year-track').getByRole('button', { name: '2020', exact: true }).click();
  await expect(page).toHaveURL(/year=2020/);
  await page.getByRole('button', { name: 'Pay + unemployment', exact: false }).click();
  await expect(page.locator('.measure-note')).toContainText('not matched people');
  await expect(page.locator('.pattern-dot')).toHaveCount(51);
  await expect(page.locator('.pattern-plot')).toHaveAttribute('data-locked', 'false');
  await page.getByLabel('Keep axes fixed across years').check();
  await expect(page.locator('.pattern-plot')).toHaveAttribute('data-locked', 'true');
  await page.getByLabel('Keep axes fixed across years').uncheck();
  await expect(page.locator('.pattern-plot')).toHaveAttribute('data-locked', 'false');
  await expect(page.locator('.small-note').first()).toContainText('not comparable across years');
  await page.getByLabel('Explore a state', { exact: true }).selectOption('WA');
  await expect(page.locator('.state-top h3')).toHaveText('Washington');
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-highlighted-state', 'WA');
  await expect(page.locator('.pattern-dot')).toHaveCount(51);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download calculated pairs ↓', exact: true }).click();
  const payload = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(payload.result.config).toEqual({ year: 2020, pair: 'pay-unemployment' });
  expect(payload.result.points).toHaveLength(51);
  expect(payload.result.rows.find((r: any) => r.code === 'WA').x0.sourceHash).toMatch(
    /^[a-f0-9]{64}$/,
  );
  await page.getByRole('link', { name: 'Open resident unemployment ↗', exact: true }).click();
  await expect(page).toHaveURL(/charts\/\?.*state=WA.*from=2019-12.*through=2020-12.*release=ec-/);
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__patternCanvas,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  expect(representativeRequests).toEqual([]);
  await page.getByRole('link', {name: /Back to representatives/}).click();
  await expect.poll(() => representativeRequests.some(url => url.includes('/states/WA/'))).toBe(true);
});

test('phone pattern selection supports keyboard dots, map focus, reduced motion and complete evidence', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/records/patterns/?pair=pay-unemployment&year=2025');
  await page.getByRole('button', { name: 'Expand evidence panel', exact: true }).click();
  await expect(page.locator('.method tbody tr')).toHaveCount(0);
  const dot = page.locator('.pattern-dot[data-state=TX]');
  await expect(dot).toBeEnabled();
  await dot.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.state-top h3')).toHaveText('Texas');
  await expect(dot).toHaveCSS('transition-duration', '0s');
  await page.locator('.pattern-plot').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/patterns-phone.png' });
  await page.getByRole('button', { name: 'Locate on map ↗', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Focus TX', exact: true })).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Expand evidence panel', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.pattern-dot')).toHaveCount(51);
  await page.getByRole('button', { name: 'Expand evidence panel', exact: true }).click();
  await page.locator('.endpoints summary').click();
  await expect(page.locator('.endpoints')).toContainText('LASST480000000000003');
  await page.locator('.method summary').click();
  await expect(page.locator('.method tbody tr')).toHaveCount(51);
  await expect(page.locator('.method')).toContainText('not wholly independent');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test('invalid pattern selections and missing pinned releases remain explicit', async ({ page }) => {
  await page.goto('/records/patterns/?year=2099');
  await expect(page.getByRole('alert')).toContainText('year');
  await expect(page.locator('.pattern-dot')).toHaveCount(0);
  await page.getByRole('link', { name: 'Reset comparison →', exact: true }).click();
  await expect(page.locator('.pattern-dot')).toHaveCount(51);
  await page.goto('/records/patterns/?release=pt-000000000000000000000000');
  await expect(page.getByRole('alert')).toContainText('never silently substitutes');
  await expect(page.locator('.pattern-dot')).toHaveCount(0);
  await page.goto('/records/patterns/?state=ZZ');
  await expect(page.locator('.error')).toContainText('not included');
  await expect(page.locator('.pattern-dot')).toHaveCount(51);
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-highlighted-state', '__none__');
});
