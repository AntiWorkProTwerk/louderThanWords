import { test, expect } from '@playwright/test';

test('map inspection previews state values and outlines without changing the selected records', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/patterns/?state=TX');
  await expect(page.locator('.map-loading')).toHaveCount(0);
  await page.evaluate(
    () => ((window as any).__inspectorMap = document.querySelector('.maplibregl-canvas')),
  );
  await page.getByRole('button', { name: 'Inspect map', exact: false }).click();
  const inspector = page.getByRole('dialog', { name: 'Map inspector', exact: true });
  await expect(inspector).toBeVisible();
  await expect(inspector.locator('select')).toBeFocused();
  const original = page.url();
  await inspector.locator('select').selectOption('CA');
  await expect(inspector.locator('.inspector-reading')).toContainText('California');
  await expect(inspector.locator('.inspector-source')).toContainText('BLS');
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-preview-state', 'CA');
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-highlighted-state', 'TX');
  expect(page.url()).toBe(original);
  await expect(page.locator('.pattern-dot')).toHaveCount(51);
  await page.screenshot({ path: 'test-results/map-inspector-desktop.png' });
  await page.keyboard.press('Escape');
  await expect(inspector).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Inspect map/ })).toBeFocused();
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-preview-state', '__none__');
  await page.getByRole('button', { name: /Inspect map/ }).click();
  await inspector.locator('select').selectOption('WA');
  await inspector
    .getByRole('button', { name: 'Use Washington in this view', exact: false })
    .click();
  await expect(page).toHaveURL(/state=WA/);
  await expect(inspector).toHaveCount(0);
  await expect(page.locator('.pattern-dot')).toHaveCount(51);
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__inspectorMap,
    ),
  ).toBe(true);
});

test('pointer inspection follows states only while enabled and resets after navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/connections/');
  await expect(page.locator('.map-loading')).toHaveCount(0);
  await page.getByRole('button', { name: /Inspect map/ }).click();
  const inspector = page.getByRole('dialog', { name: 'Map inspector', exact: true });
  // Dispatching a marker event also covers the independent accessible DOM marker path.
  await page.locator('.map-state-name[data-state=CA]').dispatchEvent('mouseenter');
  await expect(inspector.locator('select')).toHaveValue('CA');
  await expect(inspector.locator('.inspector-reading strong')).toHaveText('1');
  await expect(inspector.locator('.inspector-reading')).toContainText('Connected companies');
  await inspector.locator('select').selectOption('TX');
  await expect(inspector.locator('.inspector-reading strong')).toHaveText('No match');
  await page.locator('.map-state-name[data-state=CA]').dispatchEvent('mouseenter');
  await expect(inspector.locator('select')).toHaveValue('TX');
  await inspector.getByLabel('Follow pointer over the map').check();
  await page.locator('.map-state-name[data-state=NY]').hover();
  await expect(inspector.locator('select')).toHaveValue('NY');
  await page.getByRole('link', { name: 'Connections', exact: true }).click();
  await expect(inspector).toHaveCount(0);
});

test.describe('touch inspector', () => {
test.use({hasTouch:true,isMobile:true});
test('phone inspection fits the viewport and makes geography and demo limits explicit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/records/rules/');
  await page.getByRole('button', { name: /Inspect map/ }).click();
  const inspector = page.getByRole('dialog', { name: 'Map inspector', exact: true });
  await expect(inspector.locator('.inspector-reading strong')).toHaveText('Context only');
  await expect(inspector.locator('.inspector-source')).toContainText('Federal Register');
  await expect(inspector.locator('.pointer-option')).toBeHidden();
  await expect(page.locator('.map-loading')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/map-inspector-phone.png' });
  const box = await inspector.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  expect(box!.y + box!.height).toBeLessThanOrEqual(845);
  expect(await inspector.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await page.setViewportSize({width:320,height:568});
  await expect.poll(async()=>{const b=await inspector.boundingBox();return !!b&&b.x>=0&&b.y>=0&&b.x+b.width<=321&&b.y+b.height<=569;}).toBe(true);
  await page.getByRole('button', { name: 'Close map inspector', exact: true }).click();
  await page.goto('/said-vs-did/');
  await page.getByRole('button', { name: /Inspect map/ }).click();
  await expect(inspector.locator('.sample-warning')).toContainText('not verified records');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
});

test('a missing pinned collection remains unavailable in the inspector', async ({ page }) => {
  await page.goto('/records/patterns/?release=pt-000000000000000000000000');
  await expect(page.getByRole('alert')).toContainText('could not load');
  await page.getByRole('button', { name: /Inspect map/ }).click();
  const inspector = page.getByRole('dialog', { name: 'Map inspector', exact: true });
  await expect(inspector.locator('.inspector-reading strong')).toHaveText('Unavailable');
  await expect(inspector.locator('.inspector-reading')).toContainText(
    'cannot fill in missing evidence',
  );
});
