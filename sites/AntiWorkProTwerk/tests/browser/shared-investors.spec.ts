import { test, expect } from '@playwright/test';

test('shared investors compare a stable cohort, inspect exact source rows and preserve the shared map across links', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/shared-investors/');
  await expect(page.locator('.coverage summary')).toContainText(
    '7 selected companies · 3 managers',
  );
  await expect(page.locator('.peer-card')).toHaveCount(2);
  await expect(page.locator('.manager-card')).toHaveCount(3);
  await expect(page.locator('.map-evidence-key')).toContainText('not investment destinations');
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);
  await expect(page.locator('.map-loading')).toHaveCount(0);
  await expect(page.locator('.map-notice')).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).__sharedMap = document.querySelector('.maplibregl-canvas');
  });
  await page.screenshot({ path: 'test-results/shared-investors-desktop.png' });
  await page.locator('.peer-card').first().locator('summary').click();
  await expect(page.locator('.peer-card').first()).toContainText(
    'observed shared counts are 2 → 1',
  );
  await expect(page.locator('.peer-card').first()).toContainText('consistent group of 2');
  await expect(page.locator('.peer-card').first().locator('.trend strong')).toHaveText(['1', '1']);
  await page
    .locator('.manager-card')
    .first()
    .locator('.matrix-row')
    .first()
    .getByRole('button')
    .first()
    .click();
  await expect(page.locator('.source-evidence .raw-row')).not.toHaveCount(0);
  await page.locator('.source-evidence .raw-row').first().locator('summary').click();
  await expect(page.locator('.source-evidence .raw-row').first()).toContainText(
    'INVESTMENTDISCRETION',
  );
  await page
    .locator('.source-evidence')
    .screenshot({ path: 'test-results/shared-investors-evidence.png' });
  await page.getByRole('link', { name: 'Open current quarterly holdings →', exact: true }).click();
  await expect(page.locator('.holdings-page')).toBeVisible();
  await page
    .getByRole('link', {
      name: 'Explore this manager’s overlap across selected peer companies →',
      exact: true,
    })
    .click();
  await expect(page.locator('.shared-page')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__sharedMap,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('phone shared-investor records distinguish notices, retry failed evidence and export reproducible comparisons', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let failed = false;
  await page.route(
    '**/shared-investors/releases/*/evidence/0001336528-0001652044-2026-06-30.json',
    async (route) => {
      if (!failed) {
        failed = true;
        await route.abort();
      } else await route.continue();
    },
  );
  await page.goto('/records/shared-investors/');
  await page.getByRole('button', { name: 'Expand evidence panel' }).click();
  await page
    .locator('.manager-card')
    .filter({ hasText: 'PERSHING' })
    .locator('.matrix-row')
    .first()
    .getByRole('button')
    .last()
    .click();
  await expect(page.locator('.source-evidence [role=alert]')).toContainText('could not load');
  await page.getByRole('button', { name: 'Retry source evidence', exact: true }).click();
  await expect(page.locator('.source-evidence')).toContainText(
    'Not evidence of an empty portfolio',
  );
  await page.locator('.filing-context summary').click();
  await expect(page.locator('.filing-context')).toContainText('public parent company');
  await expect(page.locator('.source-evidence .raw-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close evidence', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download comparison', exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('shared-investors-comparison.json');
  await page.getByLabel('Peer group', { exact: true }).selectOption('commercial-banks');
  await expect(page.locator('.peer-card')).toHaveCount(3);
  await page.getByLabel('Find a company', { exact: true }).fill('WFC');
  await expect(page.locator('.company-picker button')).toHaveCount(1);
  await page.locator('.company-picker button').click();
  await expect(page.locator('.company-heading')).toContainText('Wells Fargo');
  await page.locator('.company-heading').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/shared-investors-phone.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('state filters keep outside peers, quarter errors do not become zeros, and unknown states show bounded coverage', async ({
  page,
}) => {
  await page.goto('/records/shared-investors/?state=CA');
  await expect(page.locator('.company-picker button')).toHaveCount(1);
  await expect(page.locator('.peer-card')).toHaveCount(2);
  await expect(page.locator('.state-context')).toContainText('not its out-of-state peers');
  await page
    .locator('.manager-card')
    .first()
    .locator('.matrix-row')
    .filter({ hasText: 'Amazon' })
    .getByRole('button')
    .first()
    .click();
  await expect(page.locator('.company-heading')).toContainText('Amazon');
  await expect(page.locator('.source-evidence')).toBeVisible();
  await expect(page.getByLabel('Explore a state', { exact: true })).toHaveValue('');
  await page.getByLabel('Earlier quarter', { exact: true }).selectOption('2026-06-30');
  await expect(page.locator('.empty')).toContainText('Choose an earlier quarter');
  await expect(page.locator('.peer-card')).toHaveCount(0);
  await page.getByLabel('Explore a state', { exact: true }).selectOption('AL');
  await expect(page.locator('.empty').first()).toContainText('not the whole market');
});
