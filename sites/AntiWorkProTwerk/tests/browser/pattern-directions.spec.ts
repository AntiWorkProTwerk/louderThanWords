import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('direction groups explain and select regions without filtering the correlation or replacing the map', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/patterns/?state=TX&peer=CA&year=2025');
  await expect(page.locator('.map-loading')).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).__directionCanvas = document.querySelector('.maplibregl-canvas');
  });
  const breakdown = page.getByTestId('pattern-directions');
  const before = page.url();
  const coefficient = await page.getByTestId('pattern-r').textContent();
  await expect(breakdown.locator('.direction-strip')).toBeVisible();
  await breakdown.locator(':scope > summary').click();
  expect(page.url()).toBe(before);
  const group = breakdown
    .locator('.direction-group')
    .filter({ has: page.locator('[data-direction-state=WA]') });
  await group.locator(':scope > summary').click();
  await group.locator('[data-direction-state=WA]').click();
  await expect(page).toHaveURL(/state=WA/);
  await expect(page).toHaveURL(/peer=CA/);
  await expect(page).toHaveURL(/release=pt-/);
  await expect(group.locator('[data-direction-state=WA]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('pattern-r')).toHaveText(coefficient!);
  await expect(page.locator('.pattern-dot')).toHaveCount(51);
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-highlighted-state', 'WA');
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__directionCanvas,
    ),
  ).toBe(true);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download calculated pairs ↓', exact: true }).click();
  const payload = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(payload.directionGroups.total).toBe(51);
  expect(
    payload.directionGroups.groups.flatMap((g: any) => g.rows.map((r: any) => r.code)).sort(),
  ).toEqual(payload.result.rows.map((r: any) => r.code).sort());
  await page.getByRole('button', { name: /Pay \+ unemployment/ }).click();
  await expect(breakdown).toContainText('unemployment increased');
  await expect(breakdown.locator('[data-direction-state]')).toHaveCount(51);
  for (const item of await breakdown.locator('.direction-group[open] > summary').all())
    await item.click();
  await breakdown.locator(':scope > summary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/pattern-directions-desktop.png' });
});

test('short phone direction breakdown supports keyboard, empty groups and reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ltw.map-renderer.v1', 'vector'));
  await page.goto('/records/patterns/?pair=pay-unemployment&year=2025');
  await page.getByRole('button', { name: 'Expand evidence panel', exact: true }).click();
  const breakdown = page.getByTestId('pattern-directions');
  await breakdown.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  await expect(breakdown).toHaveAttribute('open', '');
  const missing = breakdown.locator('.direction-group[data-direction=missing]');
  await missing.locator('summary').click();
  await expect(missing).toContainText('No regions in this group');
  const group = breakdown
    .locator('.direction-group')
    .filter({ has: page.locator('[data-direction-state=TX]') });
  await group.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  const state = group.locator('[data-direction-state=TX]');
  await state.focus();
  await page.keyboard.press('Enter');
  await expect(state).toHaveAttribute('aria-pressed', 'true');
  expect((await state.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(breakdown.locator('.direction-strip i').first()).toHaveCSS(
    'transition-duration',
    '0s',
  );
  await state.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/pattern-directions-phone.png' });
  await group.locator(':scope > summary').click();
  await missing.locator(':scope > summary').click();
  await breakdown.locator(':scope > summary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/pattern-directions-phone-overview.png' });
});
