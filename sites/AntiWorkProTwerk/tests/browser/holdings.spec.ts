import { test, expect } from '@playwright/test';

test('holdings compare exact quantities, open original rows and keep one map across regional context', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/holdings/');
  await expect(page.locator('.coverage summary')).toContainText('3 selected managers · 7 filings');
  await expect(page.locator('.position-card')).toHaveCount(25);
  await expect(page.locator('.map-evidence-key')).toContainText('not investment locations');
  await expect(page.locator('[data-record-sites]')).toHaveAttribute('data-record-sites', '0');
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);
  await page.evaluate(() => {
    (window as any).__holdingsMap = document.querySelector('.maplibregl-canvas');
  });
  await page.screenshot({ path: 'test-results/holdings-desktop.png' });
  await page
    .locator('.change-filters')
    .getByRole('button', { name: /^Quantity increased/ })
    .click();
  await expect(page.locator('.position-card').first()).toBeVisible();
  await expect(page.locator('.position-card .badge').first()).toHaveText('Quantity increased');
  await page.locator('.position-card').first().click();
  await expect(page.locator('.position-evidence .raw-row').first()).toBeVisible();
  await page.locator('.position-evidence .raw-row summary').first().click();
  await expect(page.locator('.position-evidence .raw-row').first()).toContainText(
    'INVESTMENTDISCRETION',
  );
  await expect(page.locator('.position-evidence .raw-row').first()).toContainText('INFOTABLE.tsv');
  await page.getByRole('button', { name: 'Inspect filing context', exact: true }).first().click();
  await expect(page.locator('.filing-detail .manager-relations')).toBeVisible();
  await expect(page.locator('.filing-detail')).toContainText('Managers included in this report');
  await page
    .locator('.position-evidence')
    .screenshot({ path: 'test-results/holdings-evidence.png' });
  await page
    .getByRole('link', { name: 'Explore NE wage and employment context →', exact: true })
    .click();
  await page
    .getByRole('link', {
      name: 'Explore quarterly holdings by reporting-manager state →',
      exact: true,
    })
    .click();
  await expect(page.locator('.holdings-page')).toBeVisible();
  await expect(page.getByLabel('Explore a state', { exact: true })).toHaveValue('NE');
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__holdingsMap,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('phone holdings recover failed lazy evidence; notices preserve reporting relationships and never become exits', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let failed = false;
  await page.route('**/holdings/releases/*/positions/0001067983-2026-06-30.json', async (route) => {
    if (!failed) {
      failed = true;
      await route.abort();
    } else await route.continue();
  });
  await page.goto('/records/holdings/');
  await page.getByRole('button', { name: 'Expand evidence panel' }).click();
  await expect(page.locator('.comparison [role=alert]')).toContainText('could not load');
  await page.getByRole('button', { name: 'Retry quarter evidence', exact: true }).click();
  await expect(page.locator('.position-card')).toHaveCount(25);
  await page.getByLabel('Reporting manager', { exact: true }).selectOption('0001336528');
  await expect(page.locator('.comparison-unavailable')).toContainText(
    'does not mean every prior holding was sold',
  );
  await expect(page.locator('.position-card')).toHaveCount(0);
  await expect(page.locator('.snapshot-cards')).toContainText('Reported elsewhere');
  await page.locator('.filing-card').last().click();
  await expect(page.locator('.filing-detail')).toContainText('public parent company');
  await expect(page.locator('.manager-relations')).toContainText(
    'Other managers reporting for this manager',
  );
  await page.locator('.manager-heading').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/holdings-phone.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Explore a state', { exact: true }).selectOption('AL');
  await expect(page.locator('.empty')).toContainText('bounded collection');
});

test('large manager comparisons use restatements, link exact CIKs and ignore stale quarter responses', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let release!: () => void,
    started = false;
  const gate = new Promise<void>((r) => (release = r));
  await page.route('**/holdings/releases/*/positions/0000019617-2026-03-31.json', async (route) => {
    started = true;
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await page.goto('/records/holdings/');
    await expect(page.locator('.position-card')).toHaveCount(25);
    await page.getByLabel('Reporting manager', { exact: true }).selectOption('0000019617');
    await expect.poll(() => started).toBe(true);
    await page.getByLabel('Reporting manager', { exact: true }).selectOption('0001336528');
    release();
    await expect(page.locator('.comparison-unavailable')).toBeVisible();
    await expect(page.locator('.position-card')).toHaveCount(0);
    await page.getByLabel('Reporting manager', { exact: true }).selectOption('0000019617');
    await expect(page.locator('.position-card')).toHaveCount(25);
    await expect(page.locator('.filing-chain')).toContainText([
      'Restatement #1',
      'Original report',
    ]);
    await page.getByLabel('Find an issuer or CUSIP', { exact: true }).fill('APPLE');
    await page.getByRole('button', { name: 'Search holdings', exact: true }).click();
    await expect(page.locator('.position-card').first()).toContainText('APPLE');
    await page
      .getByRole('link', { name: 'Read this SEC entity’s insider disclosures →', exact: true })
      .click();
    await expect(page.getByLabel('Insider issuer', { exact: true })).toHaveValue('0000019617');
    await page.locator('.insider-card').first().click();
    await page
      .getByRole('link', {
        name: 'Compare this SEC entity’s quarterly managed holdings →',
        exact: true,
      })
      .click();
    await expect(page.getByLabel('Reporting manager', { exact: true })).toHaveValue('0000019617');
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});
