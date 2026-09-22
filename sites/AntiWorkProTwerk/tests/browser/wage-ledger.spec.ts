import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('wage ledger preserves exact legal names, source money and case history across map navigation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/wages/');
  await expect(page.locator('.wage-coverage')).toContainText('Department of Labor');
  await expect(page.locator('.wage-stats')).toContainText('6,615');
  await expect(page.locator('.wage-stats')).toContainText('$71,975,624.83');
  await expect(page.locator('.wage-stats')).toContainText('$43,072,262.64');
  await expect(page.locator('.wage-group')).toHaveCount(24);
  await expect(page.locator('.wage-group').first()).toContainText('Fourteen Foods LLC');
  await expect(page.locator('.wage-group').first()).toContainText('15 cases');
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-record-sites', '0');
  await page.getByText('Read this before comparing employers', { exact: true }).click();
  await expect(page.locator('.wage-method')).toContainText('367,890');
  await expect(page.locator('.wage-method')).toContainText('October 1, 2025');
  await expect(page.locator('.wage-method')).toContainText(
    'Names are not unique corporate identifiers',
  );
  const promise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download this source-backed collection ↧' }).click();
  const download = await promise,
    data = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(data.records).toHaveLength(6615);
  expect(data.coverage.completeArchive).toBe(true);
  expect(data.records.some((r: any) => r.violations === 0)).toBe(true);
  await page.getByText('Read this before comparing employers', { exact: true }).click();
  await page.locator('.wage-group').first().click();
  await expect(page.locator('.wage-case')).toHaveCount(15);
  await expect(page.locator('.wage-timeline')).toBeVisible();
  await page.locator('.wage-case').first().click();
  await expect(page.locator('.wage-detail')).toContainText('Fourteen Foods LLC');
  await expect(page.locator('.wage-detail')).toContainText('Findings period, not case duration');
  await expect(page.locator('.wage-source')).toContainText('Data row');
  await expect(page.getByRole('link', { name: 'Original DOL bulk file ↗' })).toHaveAttribute(
    'href',
    /data\.dol\.gov.*WHD_enforcement\.zip$/,
  );
  await page.locator('.wage-detail').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/wage-ledger-desktop.png' });
  await page.getByRole('button', { name: 'Close case ×' }).click();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByLabel('Recorded case violations', { exact: true }).selectOption('zero');
  await expect(page.locator('.wage-stats > div').first()).toContainText('805');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByLabel('Explore a state', { exact: true }).selectOption('TX');
  await expect(page.locator('.wage-stats > div').first()).toContainText('1,308');
  await page.evaluate(() => {
    (window as any).__wageMap = document.querySelector('.maplibregl-canvas');
  });
  await page.getByRole('link', { name: 'Regional pay context ↗' }).click();
  await expect(page).toHaveURL(/paycheck\/\?state=TX/);
  await page.getByRole('link', { name: 'Federal wage cases in this geography ↗' }).click();
  await expect(page.locator('.wage-filter-note')).toContainText('TX');
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__wageMap,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('phone wage ledger has readable source evidence, search, filters and empty-state safeguards', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/records/wages/?state=TX');
  await page.getByRole('button', { name: 'Expand evidence panel' }).click();
  await page.getByLabel('Search employer or case', { exact: true }).fill('Chipotle');
  await expect(page.locator('.wage-group').first()).toContainText('Chipotle');
  await page.locator('.wage-group').first().click();
  await page.locator('.wage-case').first().click();
  await expect(page.locator('.wage-detail')).toContainText('not case closure');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.wage-detail').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/wage-ledger-phone.png', fullPage: true });
  await page.getByRole('button', { name: 'Close case ×' }).click();
  await page.getByLabel('Search employer or case', { exact: true }).fill('no-such-case-xyz');
  await expect(page.getByRole('heading', { name: 'No cases in this slice.' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByRole('button', { name: 'Case records', exact: true }).click();
  await expect(page.locator('.wage-case')).toHaveCount(24);
  await page.getByRole('button', { name: 'Show 24 more cases' }).click();
  await expect(page.locator('.wage-case')).toHaveCount(48);
  await page.getByRole('button', { name: 'Capture changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No capture changes yet.' })).toBeVisible();
});

test('wage details load on demand, recover from failure and ignore obsolete responses', async ({
  page,
}) => {
  let requests = 0,
    failNext = true;
  let releaseHeld: () => void = () => {},
    heldFinished: Promise<void> = Promise.resolve(),
    held = false;
  const heldGate = new Promise<void>((resolve) => (releaseHeld = resolve));
  let markHeld: () => void = () => {};
  const heldStarted = new Promise<void>((resolve) => (markHeld = resolve));
  await page.route('**/cases-v1/*.json', async (route) => {
    requests++;
    if (failNext) {
      failNext = false;
      await route.fulfill({ status: 503, body: 'unavailable' });
      return;
    }
    if (held) {
      held = false;
      let finish: () => void = () => {};
      heldFinished = new Promise<void>((resolve) => (finish = resolve));
      markHeld();
      try {
        const response = await route.fetch();
        await heldGate;
        await route.fulfill({ response });
      } catch {
        /* The obsolete request may already have been cancelled. */
      } finally {
        finish();
      }
      return;
    }
    await route.continue();
  });
  await page.goto('/records/wages/?view=cases');
  await expect(page.locator('.wage-case')).toHaveCount(24);
  expect(requests).toBe(0);
  const ids = (await page.locator('.wage-case > span').allTextContents()).map(
    (text) => text.match(/Case (\d+)/)![1],
  );
  await page.locator('.wage-case').first().click();
  await expect(page.locator('.wage-empty[role=alert]')).toContainText('could not load');
  await page.getByRole('button', { name: 'Retry case evidence' }).click();
  await expect(page.locator('.wage-detail')).toContainText(`WHD case ${ids[0]}`);
  expect(requests).toBe(2);
  await page.getByRole('button', { name: 'Close case ×' }).click();
  await page.locator('.wage-case').first().click();
  await expect(page.locator('.wage-detail')).toContainText(`WHD case ${ids[0]}`);
  expect(requests).toBe(2);
  await page.getByRole('button', { name: 'Close case ×' }).click();
  const second = ids.findIndex((id) => Number(id) % 64 !== Number(ids[0]) % 64);
  const third = ids.findIndex(
    (id) => Number(id) % 64 !== Number(ids[0]) % 64 && Number(id) % 64 !== Number(ids[second]) % 64,
  );
  expect(second).toBeGreaterThan(0);
  expect(third).toBeGreaterThan(0);
  held = true;
  await page.locator('.wage-case').nth(second).click();
  await expect(page.locator('.wage-empty[role=status]')).toContainText('Loading verified');
  await heldStarted;
  await page.locator('.wage-case').nth(third).click();
  await expect(page.locator('.wage-detail')).toContainText(`WHD case ${ids[third]}`);
  releaseHeld();
  await heldFinished;
  await expect(page.locator('.wage-detail')).toContainText(`WHD case ${ids[third]}`);
  await expect(page.locator('.wage-detail')).not.toContainText(`WHD case ${ids[second]}`);
});
