import { test, expect } from '@playwright/test';

test('chart axis browsing previews without selecting and has one keyboard entry point', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/patterns/?state=TX');
  const selected = page.locator('.pattern-dot[data-state=TX]');
  await expect(selected).toBeEnabled();
  await expect(page.locator('.pattern-dot[tabindex="0"]')).toHaveCount(1);
  await expect(selected).toHaveAttribute('tabindex', '0');
  const original = page.url();
  const correlation = await page.getByTestId('pattern-r').innerText();
  await selected.focus();
  await page.keyboard.press('Home');
  const alabama = page.locator('.pattern-dot[data-state=AL]');
  await expect(alabama).toBeFocused();
  await expect(page.locator('.plot-readout')).toContainText('Alabama');
  await expect(page.locator('.readout-state')).toHaveText('Preview · not selected');
  await expect(page.locator('.plot-guides')).toHaveAttribute('data-state', 'AL');
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  expect(page.url()).toBe(original);
  await page.keyboard.press('End');
  await expect(page.locator('.pattern-dot[data-state=WY]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  const focused = page.locator('.pattern-dot:focus');
  const code = await focused.getAttribute('data-state');
  const previewName = (await focused.getAttribute('aria-label'))!.split(':')[0];
  await expect(page.locator('.plot-readout')).toContainText(previewName);
  await expect(page.locator('.plot-guides')).toHaveAttribute('data-state', code!);
  await expect(page.locator('.pattern-dot[tabindex="0"]')).toHaveCount(1);
  expect(page.url()).toBe(original);
  await page.locator('.pattern-plot').scrollIntoViewIfNeeded();
  await expect(page.locator('.map-loading')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/pattern-navigation-desktop.png' });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`state=${code}`));
  await expect(page.locator('.state-top h3')).toHaveText(previewName);
  await expect(page.locator('.readout-state')).toHaveText('Selected state');
  await expect(page.getByTestId('pattern-r')).toHaveText(correlation);
  await expect(page.locator('.pattern-dot')).toHaveCount(51);
  await page.keyboard.press('Tab');
  await expect(page.locator('.pattern-dot:focus')).toHaveCount(0);
});

test('phone guides fit the plot, respect reduced motion and recover from an unknown selection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/records/patterns/?state=ZZ&scale=all');
  await page.getByRole('button', { name: 'Expand evidence panel', exact: true }).click();
  const entry = page.locator('.pattern-dot[tabindex="0"]');
  await expect(entry).toHaveCount(1);
  await expect(entry).toBeEnabled();
  await entry.focus();
  await page.keyboard.press('Home');
  await expect(page.locator('.plot-guides')).toHaveAttribute('data-state', 'AL');
  await expect(page.locator('.guide-horizontal')).toHaveCSS('transition-duration', '0s');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.pattern-dot:focus')).toHaveCount(1);
  await expect(page).toHaveURL(/state=ZZ/);
  await page.locator('.pattern-plot').scrollIntoViewIfNeeded();
  await expect(page.locator('.map-loading')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/pattern-navigation-phone.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.keyboard.press('Enter');
  await expect(page.locator('.pattern-dot[aria-pressed=true]')).toHaveCount(1);
  await page.locator('.year-track').getByRole('button', { name: '2020', exact: true }).click();
  await expect(page.locator('.pattern-dot[tabindex="0"]')).toHaveCount(1);
  await expect(page.locator('.pattern-dot')).toHaveCount(51);
});
