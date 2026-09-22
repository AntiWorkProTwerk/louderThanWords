import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('career connections retain earlier roles, explain blank later filings and verify agenda crosslinks', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/records/revolving/');
  await expect(page.locator('.career-scope')).toContainText('27 captured filings');
  await expect(page.locator('.career-card')).toHaveCount(10);
  await page
    .getByLabel('Search a name, disclosed position or client', { exact: true })
    .fill('Rachel');
  await expect(page.locator('.career-card')).toHaveCount(1);
  await page.locator('.career-card').click();
  await expect(page.locator('.career-detail>h3')).toHaveText('RACHEL APPLETON');
  await expect(page.locator('.career-position')).toContainText(
    'Legislative Counsel, Rep. Derek Kilmer',
  );
  await expect(page.locator('.career-timeline button')).toHaveCount(11);
  await page.locator('.career-timeline button').last().click();
  await expect(page.locator('.career-report')).toContainText('Covered-position field is blank');
  await expect(page.locator('.career-position')).toContainText(
    'U.S. Drug Enforcement Administration',
  );
  await expect(page.locator('.career-connection')).toContainText('Not employment start/end dates');
  await page.evaluate(() => {
    (window as any).__careerMap = document.querySelector('.maplibregl-canvas');
  });
  await page.getByRole('link', { name: 'Same verified filing in Washington Agenda ↗' }).click();
  await expect(page.locator('.agenda-detail')).toContainText('4th Quarter - Report');
  await page.getByRole('link', { name: 'Look up people named in this filing ↗' }).click();
  await expect(page.locator('.career-filter-note')).toContainText(
    'f1f12efe-e53f-4396-886b-2fb674e4e22e',
  );
  await expect(page.locator('.career-card')).toHaveCount(5);
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__careerMap,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Show all filings', exact: true }).click();
  await page.getByLabel('Explore a state', { exact: true }).selectOption('VA');
  await expect(page.locator('.career-card')).toHaveCount(1);
  await expect(page.locator('.career-card')).toContainText('JED NICHOLAS BHUTA');
  await page.getByText('What these connections do—and do not—mean', { exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download career evidence dataset' }).click();
  const download = await pending,
    dataset = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(dataset.filings).toHaveLength(27);
  expect(dataset.observations).toHaveLength(94);
  expect(JSON.stringify(dataset)).not.toContain('contact_telephone');
  await page.getByLabel('Explore a state', { exact: true }).selectOption('');
  await page.locator('.career-page header').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/career-connections-desktop.png' });
  expect(errors).toEqual([]);
});

test('phone career record stacks the source relationship diagram and supports accessible filters', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/records/revolving/');
  await page.getByRole('button', { name: 'Expand evidence panel' }).click();
  await page.getByLabel('Search a name, disclosed position or client', { exact: true }).fill('Jed');
  await page.locator('.career-card').click();
  await expect(page.locator('.career-detail')).toContainText('NC-11- Legislative Director');
  await expect(page.locator('.career-connection')).toContainText(
    'AQUIA GROUP ON BEHALF OF ANTHROPIC',
  );
  await page.locator('.career-connection').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/career-connections-phone.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Close career record ×' }).click();
  await page
    .getByLabel('Search a name, disclosed position or client', { exact: true })
    .fill('no-such-government-role-xyz');
  await expect(page.getByRole('heading', { name: 'No matching career records' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear career filters' }).click();
  await expect(page.locator('.career-card')).toHaveCount(10);
});
