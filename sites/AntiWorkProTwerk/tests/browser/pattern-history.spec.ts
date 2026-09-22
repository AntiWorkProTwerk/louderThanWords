import { test, expect } from '@playwright/test';

test('annual correlation history previews independently and selects a year on the same map', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/patterns/?state=WA');
  await expect(page.locator('.map-loading')).toHaveCount(0);
  await page.evaluate(
    () => ((window as any).__historyCanvas = document.querySelector('.maplibregl-canvas')),
  );
  const history = page.getByTestId('correlation-history');
  await expect(history.locator('[data-history-year]')).toHaveCount(9);
  await expect(history.locator('.history-cohort')).toContainText('same 51 regions');
  const original = page.url(),
    r = await page.getByTestId('pattern-r').innerText();
  await history.locator('[data-history-year="2025"]').focus();
  await page.keyboard.press('Home');
  await expect(history.locator('[data-history-year="2017"]')).toBeFocused();
  await expect(history.locator('.history-readout')).toContainText('Preview · not selected');
  expect(page.url()).toBe(original);
  await expect(page.getByTestId('pattern-r')).toHaveText(r);
  await expect(history.locator('[data-history-year][tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/year=2018/);
  await expect(page).toHaveURL(/state=WA/);
  await expect(history.locator('.history-readout')).toContainText('Selected year');
  await expect(history.locator('[data-history-year="2018"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.year-control strong')).toHaveText('2018');
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__historyCanvas,
    ),
  ).toBe(true);
  await history.screenshot({ path: 'test-results/pattern-history-desktop.png' });
});

test.describe('touch annual history', () => {
  test.use({ hasTouch: true, isMobile: true });
  test('phone history exposes every value, preserves source pair and reduces motion', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('ltw.map-renderer.v1', 'vector'));
    await page.goto('/records/patterns/?pair=pay-unemployment&state=CA');
    await page.getByRole('button', { name: 'Expand evidence panel', exact: true }).tap();
    const history = page.getByTestId('correlation-history');
    await history.locator('[data-history-year="2020"]').tap();
    await expect(page).toHaveURL(/year=2020/);
    await expect(page).toHaveURL(/pair=pay-unemployment/);
    await expect(page).toHaveURL(/state=CA/);
    await expect(history.locator('.history-guide')).toHaveCSS('transition-duration', '0s');
    await expect(history.locator('.history-chip')).toContainText('2020 · r');
    await expect(history.locator('.history-chip')).toHaveCSS('transition-duration', '0s');
    await history.locator('summary').tap();
    await expect(history.locator('tbody tr')).toHaveCount(9);
    await expect(history.locator('caption')).toContainText('Pay + unemployment');
    await history.getByRole('button', { name: '2019', exact: true }).tap();
    await expect(page).toHaveURL(/year=2019/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await history.evaluate((el) => {
      const workspace = el.closest('.evidence-workspace')!;
      workspace.scrollTo({
        top:
          workspace.scrollTop +
          el.getBoundingClientRect().top -
          workspace.getBoundingClientRect().top -
          54,
        behavior: 'instant',
      });
    });
    for (const point of await history.locator('[data-history-year]').all()) {
      expect(
        await point.evaluate((el) => {
          const b = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
        }),
      ).toBe(true);
    }
    await page.screenshot({ path: 'test-results/pattern-history-phone.png' });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download calculated pairs ↓', exact: true }).click();
    const file = await download;
    const stream = await file.createReadStream();
    const chunks = [];
    for await (const chunk of stream!) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    expect(payload.history.rows).toHaveLength(9);
    expect(payload.history.rows.find((r: any) => r.year === 2019).r).toBe(payload.result.r);
    expect(payload.history.pair).toBe('pay-unemployment');
    expect(payload.history.rows.every((r: any) => r.count === 51)).toBe(true);
  });
});
