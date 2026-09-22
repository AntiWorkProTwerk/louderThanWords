import { test, expect } from '@playwright/test';

test.use({ hasTouch: true, isMobile: true });

for (const renderer of ['vector', 'webgl']) {
  test(`${renderer}: mobile map separates title, geography, touch controls and evidence`, async ({
    page,
  }) => {
    await page.addInitScript((mode) => localStorage.setItem('ltw.map-renderer.v1', mode), renderer);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 700, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      for (const route of ['/records/patterns/?state=TX', '/records/lobbying/?state=TX']) {
        await page.goto(route);
        await expect(
          page.locator(renderer === 'vector' ? '[data-vector-state]' : '.map-state-name'),
        ).toHaveCount(51);
        const title = await page.locator('.evidence-map-label').boundingBox();
        const geography = await page
          .locator(renderer === 'vector' ? '.vector-map svg' : '.maplibre-host')
          .boundingBox();
        const toolbar = await page.locator('.map-toolbar').boundingBox();
        const evidence = await page.locator('.evidence-workspace').boundingBox();
        expect(title!.y + title!.height).toBeLessThanOrEqual(geography!.y);
        expect(geography!.height).toBeGreaterThanOrEqual(130);
        expect(geography!.y + geography!.height).toBeLessThanOrEqual(toolbar!.y);
        expect(toolbar!.y + toolbar!.height).toBeLessThanOrEqual(evidence!.y);
        expect(evidence!.height).toBeGreaterThanOrEqual(180);
        for (const button of await page.locator('.map-toolbar button').all()) {
          const bounds = await button.boundingBox();
          expect(bounds!.height).toBeGreaterThanOrEqual(44);
          expect(bounds!.width).toBeGreaterThanOrEqual(44);
          expect(
            await button.evaluate((el) => {
              const r = el.getBoundingClientRect();
              return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
            }),
          ).toBe(true);
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        const before = page.url();
        if (renderer === 'webgl') {
          await page.getByRole('button', { name: 'Show contiguous United States', exact: true }).tap();
          const overview = JSON.parse((await page.getByTestId('us-map').getAttribute('data-camera'))!);
          await page.getByRole('button', { name: 'Focus TX', exact: true }).tap();
          await expect.poll(async () => {
            const focused = JSON.parse((await page.getByTestId('us-map').getAttribute('data-camera'))!);
            return focused[2] - overview[2];
          }).toBeGreaterThan(0.5);
          await page.getByRole('button', { name: 'Show contiguous United States', exact: true }).tap();
        }
        const toggle = page.getByRole('button', { name: 'Expand evidence panel', exact: true });
        await expect(toggle).toContainText('Explore evidence');
        await toggle.tap();
        await expect(page.locator('.evidence-workspace')).toHaveCSS('top', '76px');
        await expect(page.locator('.evidence-workspace')).toHaveCSS('transition-duration', '0s');
        await page.getByRole('button', { name: 'Collapse evidence panel', exact: true }).tap();
        await expect(toggle).toBeFocused();
        expect(page.url()).toBe(before);
        if (viewport.width === 320 && route.includes('patterns'))
          await page.screenshot({ path: `test-results/mobile-map-layout-${renderer}.png` });
      }
    }
  });
}
