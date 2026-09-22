import { test, expect } from '@playwright/test';

for (const renderer of ['webgl', 'vector'])
  test(`${renderer}: two-state comparison marks both views without changing the annual cohort`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1672, height: 941 });
    await page.addInitScript((mode) => localStorage.setItem('ltw.map-renderer.v1', mode), renderer);
    await page.goto('/records/patterns/?state=TX');
    await expect(page.locator('.map-loading')).toHaveCount(0);
    await page.evaluate(() => {
      (window as any).__peerMap =
        document.querySelector('.maplibregl-canvas') ??
        document.querySelector('[data-testid="vector-map"]');
    });
    const before = await page.getByTestId('pattern-r').innerText();
    const history = await page.locator('.history-table tbody').textContent();
    await page.getByLabel('Comparison state or district', { exact: true }).selectOption('CA');
    await expect(page).toHaveURL(/peer=CA/);
    const card = page.getByTestId('state-comparison');
    await expect(card).toContainText('California · comparison');
    await expect(card.locator('.comparison-measure')).toHaveCount(2);
    await expect(page.locator('.pattern-dot.compared')).toHaveAttribute('data-state', 'CA');
    await expect(page.locator('.pattern-dot.chosen')).toHaveAttribute('data-state', 'TX');
    await expect(page.getByTestId('pattern-r')).toHaveText(before);
    expect(await page.locator('.history-table tbody').textContent()).toBe(history);
    await expect(page.locator('.pattern-dot')).toHaveCount(51);
    await expect(page.getByTestId('us-map')).toHaveAttribute('data-comparison-state', 'CA');
    if (renderer === 'vector') {
      await expect(page.getByTestId('vector-map')).toHaveAttribute('data-comparison-state', 'CA');
      await expect(page.locator('.vector-comparison')).toHaveAttribute(
        'd',
        (await page.locator('[data-vector-state=CA]').getAttribute('d'))!,
      );
    } else
      await expect(page.locator('.map-state-name[data-state=CA]')).toHaveAttribute(
        'aria-label',
        /Comparison state/,
      );
    await page.getByRole('button', { name: /Inspect map/ }).click();
    const inspector = page.getByRole('dialog', { name: 'Map inspector', exact: true });
    await expect(inspector.getByTestId('comparison-map-note')).toContainText('California');
    const original = page.url();
    await inspector.locator('select').selectOption('NY');
    expect(page.url()).toBe(original);
    await expect(page.getByTestId('us-map')).toHaveAttribute('data-comparison-state', 'CA');
    await page.keyboard.press('Escape');
    await expect(inspector).toHaveCount(0);
    const title = await page.locator('.evidence-map-label').boundingBox();
    const geography = await page
      .locator(renderer === 'vector' ? '.vector-map' : '.maplibre-host')
      .boundingBox();
    const toolbar = await page.locator('.map-toolbar').boundingBox();
    if (renderer === 'vector') expect(title!.y + title!.height).toBeLessThan(geography!.y);
    else {
      // The canvas extends behind overlays. Check rendered geographic anchors,
      // not the old separate-column canvas bounds or transient camera padding.
      const dock = await page.locator('.evidence-workspace').boundingBox();
      for (const code of ['WA', 'CA', 'TX', 'ME', 'FL']) {
        const anchor = await page.locator(`.map-state-name[data-state=${code}]`).boundingBox();
        expect(anchor!.y).toBeGreaterThan(title!.y + title!.height);
        expect(anchor!.x + anchor!.width).toBeLessThan(dock!.x);
        expect(anchor!.y + anchor!.height).toBeLessThan(toolbar!.y);
      }
    }
    expect(geography!.height).toBeGreaterThan(200);
    if (renderer === 'vector') expect(geography!.y + geography!.height).toBeLessThan(toolbar!.y);
    await card.getByRole('button', { name: 'View marked chart ↑', exact: true }).click();
    await page.screenshot({ path: `test-results/state-comparison-${renderer}.png` });
    await card.getByRole('button', { name: 'Swap states ⇄', exact: true }).click();
    await expect(page).toHaveURL(/state=CA/);
    await expect(page).toHaveURL(/peer=TX/);
    await expect(page.getByTestId('pattern-r')).toHaveText(before);
    await expect(page.getByTestId('us-map')).toHaveAttribute('data-comparison-state', 'TX');
    await card.getByRole('link', { name: 'Open Texas pay + jobs source ↗', exact: true }).click();
    await expect(page).toHaveURL(
      /paycheck\/\?.*state=TX.*from=2024-12.*through=2025-12.*release=pc-/,
    );
    await expect(page.getByTestId('us-map')).toHaveAttribute('data-comparison-state', '__none__');
    await page.goBack();
    await expect(page.getByTestId('us-map')).toHaveAttribute('data-comparison-state', 'TX');
    expect(
      await page.evaluate(
        () =>
          (document.querySelector('.maplibregl-canvas') ??
            document.querySelector('[data-testid="vector-map"]')) === (window as any).__peerMap,
      ),
    ).toBe(true);
  });

test('comparison scales remain fixed across years and desktop geography stays below its heading', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('ltw.map-renderer.v1', 'vector'));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/records/patterns/?state=TX&peer=CA&year=2025');
  const card = page.getByTestId('state-comparison');
  await expect(card.locator('.axis-low, .axis-high')).toHaveCount(4);
  const axes = await card.locator('.axis-low, .axis-high').allTextContents();
  const initial = await card.locator('.primary-marker').first().getAttribute('style');
  await page.locator('.year-track').getByRole('button', { name: '2020', exact: true }).click();
  await expect(page).toHaveURL(/year=2020/);
  expect(await card.locator('.axis-low, .axis-high').allTextContents()).toEqual(axes);
  expect(await card.locator('.primary-marker').first().getAttribute('style')).not.toBe(initial);
  await expect(card.locator('.primary-marker').first()).toHaveCSS('transition-duration', '0.3s');
  await expect(page.getByTestId('vector-map')).toHaveAttribute('data-comparison-state', 'CA');
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 1024, height: 768 },
    { width: 800, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(async () => {
        const label = await page.locator('.evidence-map-label').boundingBox();
        const geography = await page.locator('.vector-map').boundingBox();
        return geography!.y - label!.y - label!.height;
      })
      .toBeGreaterThanOrEqual(15);
    const map = await page.locator('.vector-map svg').boundingBox();
    expect(map!.height).toBeGreaterThan(100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  }
});

test.describe('touch two-state comparison', () => {
  test.use({ hasTouch: true, isMobile: true });
  test('phone comparisons preserve units, exports and filters and explain invalid peers', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('ltw.map-renderer.v1', 'vector'));
    await page.goto('/records/patterns/?state=WA&peer=CA&year=2020&pair=pay-unemployment');
    await page.getByRole('button', { name: 'Expand evidence panel', exact: true }).tap();
    const card = page.getByTestId('state-comparison');
    await expect(card.locator('[data-measure=x]')).toContainText('percentage points');
    await expect(card.locator('.comparison-marker').first()).toHaveCSS('transition-duration', '0s');
    await card.evaluate((el) => {
      const w = el.closest('.evidence-workspace')!;
      w.scrollTo({
        top: w.scrollTop + el.getBoundingClientRect().top - w.getBoundingClientRect().top - 54,
        behavior: 'instant',
      });
    });
    await page.screenshot({ path: 'test-results/state-comparison-phone.png' });
    await page.setViewportSize({ width: 320, height: 568 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download calculated pairs ↓', exact: true }).click();
    const download = await event,
      stream = await download.createReadStream(),
      chunks = [];
    for await (const chunk of stream!) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    expect(payload.result.points).toHaveLength(51);
    expect(payload.stateComparison.secondary.code).toBe('CA');
    expect(payload.stateComparison.secondary.xSeriesId).toBe('LASST060000000000003');
    expect(payload.stateComparison.measures.every((m: any) => m.gapUnit === 'pp')).toBe(true);
    await page.getByLabel('Comparison state or district', { exact: true }).selectOption('WA');
    await expect(card.getByRole('alert')).toContainText('different comparison');
    await expect(page.getByTestId('vector-map')).toHaveAttribute(
      'data-comparison-state',
      '__none__',
    );
    await expect(page.locator('.pattern-dot')).toHaveCount(51);
    await card.getByRole('button', { name: 'Clear comparison', exact: true }).tap();
    await expect(page).not.toHaveURL(/peer=/);
    await expect(page).toHaveURL(/year=2020/);
    await expect(page).toHaveURL(/state=WA/);
    await page.goto('/records/patterns/?state=WA&peer=ZZ');
    await expect(card.getByRole('alert')).toContainText('included in this frozen collection');
    await expect(page.getByTestId('vector-map')).toHaveAttribute(
      'data-comparison-state',
      '__none__',
    );
  });
});
