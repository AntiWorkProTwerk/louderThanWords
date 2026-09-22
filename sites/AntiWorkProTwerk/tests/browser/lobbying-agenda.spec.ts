import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('lobbying agenda preserves amendments, source wording, quarter baselines and map context', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/lobbying/');
  await expect(page.locator('.agenda-scope')).toContainText('11 filings');
  await expect(page.locator('.agenda-quarter')).toHaveCount(8);
  await expect(page.locator('.agenda-stats>div').nth(2)).toContainText('5');
  await page
    .getByRole('button', { name: 'Open 2025 / Q2 filing for ANTHROPIC', exact: true })
    .click();
  await expect(page.locator('.agenda-detail')).toContainText('2nd Quarter - Amendment');
  await expect(page.locator('.agenda-detail')).toContainText('$920,000.00');
  await expect(page.locator('.agenda-new')).toHaveText('Newly listed since preceding quarter');
  await expect(page.getByRole('link', { name: 'Open original LDA filing ↗' })).toHaveAttribute(
    'href',
    /lda.gov\/filings\/public\/filing\/df03939f-/,
  );
  await page.locator('.agenda-versions button').filter({ hasText: '2nd Quarter - Report' }).click();
  await expect(page.locator('.agenda-detail')).toContainText('$910,000.00');
  await expect(page.locator('.agenda-caution').first()).toContainText('earlier posted version');
  await page.getByRole('button', { name: 'Close filing ×' }).click();
  await page.getByRole('button', { name: 'Every filing & amendment' }).click();
  await expect(page.locator('.agenda-quarter')).toHaveCount(11);
  await page.getByText('Read the collection rules & limitations', { exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download complete captured dataset' }).click();
  const download = await pending,
    data = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(data.records).toHaveLength(11);
  expect(data.records.find((r: any) => r.type === 'RA').isAmendment).toBe(true);
  expect(data.sourceNotice).toContain('cannot vouch');
  expect(JSON.stringify(data)).not.toContain('contact_telephone');
  await page.getByLabel('Explore a state', { exact: true }).selectOption('CA');
  await expect(page.locator('.agenda-stats>div').first()).toContainText('11');
  await expect(page.locator('.map-evidence-key')).toContainText('not historical offices');
  await page.evaluate(() => {
    (window as any).__agendaMap = document.querySelector('.maplibregl-canvas');
  });
  await page.getByRole('link', { name: 'Agency rulebook ↗', exact: true }).click();
  await expect(page.locator('.rule-card')).toHaveCount(8);
  await page.getByRole('button', { name: /Explore data/ }).click();
  await page.getByRole('dialog').locator('.catalog-card').filter({hasText:'Washington agenda'}).click();
  await expect(page.locator('.agenda-scope')).toContainText('11 filings');
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__agendaMap,
    ),
  ).toBe(true);
  await page.locator('.agenda-page header').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/lobbying-agenda-desktop.png' });
  expect(errors).toEqual([]);
});

test('phone lobbying agenda supports search, evidence, clear filters and reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/records/lobbying/');
  await page.getByRole('button', { name: 'Expand evidence panel' }).click();
  await page.getByLabel('Disclosed issue area', { exact: true }).selectOption('ENG');
  await expect(page.locator('.agenda-quarter')).toHaveCount(2);
  await page
    .getByRole('button', { name: 'Open 2025 / Q3 filing for ANTHROPIC', exact: true })
    .click();
  await expect(page.locator('.agenda-detail')).toContainText('ECN');
  await expect(page.locator('.agenda-detail')).toContainText('Source record SHA-256');
  await page.locator('.agenda-detail').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/lobbying-agenda-phone.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Close filing ×' }).click();
  await page
    .getByLabel('Search company, issue, bill mention or agency', { exact: true })
    .fill('no-such-disclosure-xyz');
  await expect(page.getByRole('heading', { name: 'No matching filings' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('.agenda-quarter')).toHaveCount(8);
});
