import { test, expect } from '@playwright/test';

for (const renderer of ['webgl', 'vector']) {
  test(`${renderer}: map-first atlas preserves records while hiding and expanding the floating dock`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1672, height: 941 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((mode) => localStorage.setItem('ltw.map-renderer.v1', mode), renderer);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/records/insiders/?state=TX');
    await expect(
      page.locator(renderer === 'vector' ? '[data-vector-state]' : '.map-state-name'),
    ).toHaveCount(51);
    const dock = page.locator('.evidence-workspace');
    const map = page.locator('.live-map');
    const bounds = await dock.boundingBox();
    expect(bounds!.width).toBe(420);
    expect(bounds!.width / 1672).toBeLessThan(0.3);
    expect((await map.boundingBox())!.width).toBe(1672);
    expect(await dock.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    if (renderer === 'vector') {
      const shape = await page.locator('.vector-map').boundingBox();
      const context = await page.locator('.evidence-map-label').boundingBox();
      expect(shape!.x + shape!.width).toBeLessThan(bounds!.x);
      expect(shape!.y).toBeGreaterThan(context!.y + context!.height);
    }
    await page.evaluate(() => {
      (window as any).__atlasMap = document.querySelector('.maplibregl-canvas');
    });
    await page.locator('.map-context-notes summary').click();
    await expect(page.locator('.map-evidence-key')).toBeVisible();
    await page.locator('.map-context-notes summary').click();
    const url = page.url();
    await page.getByRole('button', { name: 'Hide records and show map only' }).click();
    await expect(dock).toBeHidden();
    const restore = page.getByRole('button', { name: /Open records/ });
    await expect(restore).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dock).toBeVisible();
    const expand = page.getByRole('button', { name: 'Expand reading view' });
    await expect(expand).toBeFocused();
    await expand.click();
    await expect.poll(async () => (await dock.boundingBox())!.width).toBe(760);
    await page.getByRole('button', { name: 'Return to compact records' }).click();
    await expect.poll(async () => (await dock.boundingBox())!.width).toBe(420);
    expect(page.url()).toBe(url);
    expect(
      await page.evaluate(
        () => document.querySelector('.maplibregl-canvas') === (window as any).__atlasMap,
      ),
    ).toBe(true);
    for (const width of [1280, 2048]) {
      await page.setViewportSize({ width, height: 941 });
      expect(
        await page.locator('.masthead nav').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true);
      expect(await dock.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
    await page.setViewportSize({ width: 1672, height: 941 });
    await page.screenshot({ path: `test-results/atlas-final-${renderer}.png` });
    expect(errors).toEqual([]);
  });
}

test('correlation controls fit a compact atlas dock and reading view remains optional', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/records/patterns/?state=TX&peer=CA');
  await expect(page.locator('.pattern-dot')).toHaveCount(51);
  const dock = page.locator('.evidence-workspace');
  expect(await dock.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const r = await page.getByTestId('pattern-r').textContent();
  await page.getByRole('button', { name: 'Expand reading view' }).click();
  await expect(page.getByTestId('pattern-r')).toHaveText(r!);
  await expect(page).toHaveURL(/peer=CA/);
  await page.getByRole('button', { name: 'Return to compact records' }).click();
  await page.getByLabel('Comparison state or district', { exact: true }).selectOption('WA');
  await expect(page).toHaveURL(/peer=WA/);
  await expect(page.getByTestId('pattern-r')).toHaveText(r!);
  expect(await dock.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});
