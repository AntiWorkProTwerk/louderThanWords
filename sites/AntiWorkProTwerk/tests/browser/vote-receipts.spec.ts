import { test, expect } from '@playwright/test';

test('real receipts connect search, exact questions, original text and the persistent map', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/');
  await expect(page.locator('.map-state-name')).toHaveCount(51, { timeout: 60000 });
  await page.evaluate(
    () => ((window as any).__receiptsMap = document.querySelector('.maplibregl-canvas')),
  );
  await page.getByRole('button', { name: /Explore data/ }).click();
  await page.getByRole('dialog').locator('.catalog-card').filter({hasText:'Vote receipts'}).click();
  // The catalog opens the complete collection; state selection is now explicit.
  await page.getByLabel('Explore a state', {exact:true}).selectOption('TX');
  await expect(page.locator('.vote-card')).toHaveCount(30);
  await expect(page.locator('.vote-results-bar')).toContainText('76 receipts in TX');
  await expect(page.locator('.vote-coverage')).toContainText('Official-source pilot');
  await page.getByRole('button', { name: 'Clear filters · All states' }).click();
  await expect(page.locator('.vote-card')).toHaveCount(30);
  await expect(page.locator('.vote-results-bar')).toContainText('868 receipts');
  await page.getByRole('button', { name: /Show 30 more receipts/ }).click();
  await expect(page.locator('.vote-card')).toHaveCount(60);
  await expect(page.locator('.map-state-name[data-state="GA"]')).toHaveAttribute('title', 'GA: 28 sample receipts by represented state');
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__receiptsMap,
    ),
  ).toBe(true);
  await page.getByRole('searchbox').fill('raskin');
  await page.getByLabel('Decision type').selectOption('passage');
  await expect(page.locator('.vote-card')).toHaveCount(1);
  await page.locator('.vote-card').click();
  await expect(page.locator('.vote-question')).toContainText('On Passage');
  await expect(page.locator('.vote-cautions')).toContainText(
    'does not establish a separate position',
  );
  await page.getByText('Why this text is linked to this vote', { exact: true }).click();
  await expect(page.locator('.vote-text').first()).toContainText(
    'Passed the House of Representatives January 7, 2025.',
  );
  await expect(page.getByRole('link', { name: 'Open original roll call ↗' })).toHaveAttribute(
    'href',
    'https://clerk.house.gov/evs/2025/roll006.xml',
  );
  const passedText = page
    .locator('.vote-text')
    .filter({ has: page.locator('summary', { hasText: '119-hr-29-eh' }) });
  await passedText.locator('summary').click();
  await expect(passedText.locator('blockquote')).toContainText('detention');
  await page.reload();
  await expect(page.locator('.vote-detail')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters · All states' }).click();
  await page.locator('#evidence-state').selectOption('DC');
  await expect(page.getByRole('heading', { name: 'No receipts in this slice.' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('phone receipts fit the evidence sheet and support reduced motion and shareable filters', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/records/votes/?state=GA');
  await page.getByRole('button', { name: 'Expand evidence panel' }).click();
  await expect(page.locator('.vote-card')).toHaveCount(28);
  await page.locator('.vote-card').first().click();
  await expect(page.locator('.vote-detail')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/vote-receipts-phone.png', fullPage: true });
});

test('real procedural votes remain distinct from passage and preserve unresolved motion text', async ({ page }) => {
  await page.goto('/records/votes/?state=HI&kind=procedure');
  await expect(page.locator('.vote-card')).toHaveCount(2);
  await page.locator('.vote-card').first().click();
  await expect(page.locator('.vote-question')).toContainText('On Ordering the Previous Question');
  await expect(page.locator('.vote-cautions')).toContainText('procedural decision');
  await expect(page.locator('.vote-cautions')).toContainText('has not been established');
  await expect(page.getByRole('link', { name: 'Open original roll call ↗' })).toHaveAttribute('href', 'https://clerk.house.gov/evs/2025/roll003.xml');
});
