import { test, expect } from '@playwright/test';

test('inspector keeps its close and apply controls visible while source evidence scrolls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/patterns/?state=TX&peer=CA');
  await page.getByRole('button', { name: /Inspect map/ }).click();
  const panel = page.getByRole('dialog', { name: 'Map inspector', exact: true });
  await expect(panel).toHaveAttribute('data-placement', 'above');
  await expect(panel.locator('select')).toBeFocused();
  const before = page.url();
  await panel.locator('select').selectOption('WA');
  await expect(panel.locator('.inspector-reading')).toContainText('Washington');
  await panel.evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished)); });
  const header = await panel.locator('.inspector-header').boundingBox();
  const footer = await panel.locator('.inspector-footer').boundingBox();
  await page.keyboard.press('Shift+Tab');
  await expect(panel.getByRole('region', { name: 'State preview and source details' })).toBeFocused();
  await page.keyboard.press('End');
  await expect.poll(() => panel.locator('.inspector-body').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect(await panel.locator('.inspector-header').boundingBox()).toEqual(header);
  expect(await panel.locator('.inspector-footer').boundingBox()).toEqual(footer);
  for (const selector of ['.inspector-close', '.apply-preview']) {
    expect(
      await panel.locator(selector).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }),
    ).toBe(true);
  }
  expect(page.url()).toBe(before);
  await page.screenshot({ path: 'test-results/inspector-fixed-actions-desktop.png' });
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Inspect map/ })).toBeFocused();
});

test.describe('touch inspector shell', () => {
  test.use({ hasTouch: true, isMobile: true });
  test('phone retains touch targets and context across scrolling and a short-screen resize', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('ltw.map-renderer.v1', 'vector'));
    await page.goto('/records/patterns/?state=TX&peer=CA');
    await page.getByRole('button', { name: /Inspect map/ }).tap();
    const panel = page.getByRole('dialog', { name: 'Map inspector', exact: true });
    await expect(panel).toHaveCSS('animation-name', 'none');
    await panel.locator('select').selectOption('WA');
    const before = page.url();
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      await expect
        .poll(async () => {
          const r = await panel.boundingBox();
          return (
            !!r &&
            r.x >= 0 &&
            r.y >= 0 &&
            r.x + r.width <= viewport.width + 1 &&
            r.y + r.height <= viewport.height + 1
          );
        })
        .toBe(true);
      await panel.locator('.inspector-body').evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await expect(panel.getByTestId('projection-note')).toBeVisible();
      for (const selector of ['.inspector-close', '.apply-preview']) {
        const button = panel.locator(selector),
          r = await button.boundingBox();
        expect(r!.height).toBeGreaterThanOrEqual(44);
        expect(
          await button.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
          }),
        ).toBe(true);
      }
      expect(page.url()).toBe(before);
      await page.screenshot({
        path: `test-results/inspector-fixed-actions-phone-${viewport.width}.png`,
      });
    }
    await panel.getByRole('button', { name: /Use Washington in this view/ }).tap();
    await expect(page).toHaveURL(/state=WA/);
    await expect(page).toHaveURL(/peer=CA/);
    await expect(page.locator('.pattern-dot')).toHaveCount(51);
    await expect(panel).toHaveCount(0);
  });
});
