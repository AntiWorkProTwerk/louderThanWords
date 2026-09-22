import { test, expect } from '@playwright/test';

test('evidence is integrated with the persistent map, filters, comparison and timelines', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto('/');
  await expect(page.locator('.map-state-name')).toHaveCount(51);
  await page.evaluate(() => {
    (window as any).__evidenceMap = document.querySelector('.maplibregl-canvas');
  });
  await page.locator('.evidence-entry[href*="/said-vs-did/"]').click();
  await expect(page.locator('.evidence-card')).toHaveCount(4);
  await page.locator('#evidence-state').selectOption('CA');
  await expect(page.locator('.evidence-card')).toHaveCount(2);
  await page.locator('.evidence-card').first().click();
  await expect(page.locator('.comparison-columns')).toBeVisible();
  await expect(page.locator('.said-column blockquote')).toContainText('only if');
  await expect(page.locator('.material-context')).toContainText('conditional');
  await page.locator('#evidence-statement summary').click();
  await expect(page.locator('#evidence-statement blockquote')).toBeVisible();
  await page.locator('.comparison-person>a').first().click();
  await expect(page).toHaveURL(/\/said-vs-did\/members\/demo-nora-reyes\/$/);
  await expect(page.locator('.evidence-heading h2')).toContainText('Nora Reyes');
  await page.goBack();
  await expect(page).toHaveURL(/\/said-vs-did\/comparisons\/[^/]+\/(?:#.*)?$/);
  await expect(page.locator('.comparison-columns')).toBeVisible();
  await page.locator('.comparison-person>a').last().click();
  await expect(page.locator('.measure-versions')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.querySelector('.maplibregl-canvas') === (window as any).__evidenceMap,
    ),
  ).toBe(true);
  await page.goto('/said-vs-did/?state=HI');
  await expect(page.getByRole('heading', { name: 'No matching published evidence' })).toBeVisible();
  await page.getByRole('link', { name: 'Clear filters and explore the sample ↗' }).click();
  await page.getByRole('searchbox', { name: 'Search the record' }).fill('Eli Brooks');
  await expect(page.locator('.evidence-card')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.evidence-card')).toHaveCount(2);
  expect(errors).toEqual([]);
});
test('phone evidence stacks statement before action, exposes sources and correction downloads', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/said-vs-did/');
  const collapsed = await page.locator('.evidence-workspace').boundingBox();
  await page.getByRole('button', { name: 'Expand evidence panel' }).click();
  await expect(page.getByRole('button', { name: 'Collapse evidence panel' })).toBeVisible();
  await expect
    .poll(async () => (await page.locator('.evidence-workspace').boundingBox())!.height)
    .toBeGreaterThan(collapsed!.height);
  await page.locator('.evidence-card').first().click();
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    /^https:\/\/louderthanwords\.fyi\/[^/]+\/said-vs-did\/comparisons\//,
  );
  expect(await page.locator('link[rel=canonical]').getAttribute('href')).not.toContain('..');
  const said = await page.locator('.said-column').boundingBox(),
    did = await page.locator('.did-column').boundingBox();
  expect(did!.y).toBeGreaterThan(said!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByText('Correction history & report an issue', { exact: true }).click();
  await page
    .locator('#correction-note')
    .fill('Please check the operative text version and condition.');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download correction request' }).click();
  expect((await download).suggestedFilename()).toContain('correction-');
  await expect(page.getByRole('status').filter({ hasText: 'has not been sent' })).toBeVisible();
});
test('local review desk reads the disk queue and blocks unreviewable evidence', async ({
  page,
}) => {
  await page.goto('/said-vs-did/review/');
  await expect(page.locator('.review-candidates button')).toHaveCount(9);
  await page.locator('.review-candidates button').filter({ hasText: 'No match' }).click();
  await expect(page.getByText('Publication blocked', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve this version' })).toBeDisabled();
  await expect(page.getByText('No matching action in this input.', { exact: true })).toBeVisible();
});

test('pipeline controls disclose Codex inference and require an explicit opt-in', async ({
  page,
}) => {
  await page.goto('/said-vs-did/review/');
  await expect(page.locator('.review-candidates button')).toHaveCount(9);
  await page.getByText('Collection, Luna extraction & quality checks', { exact: false }).click();
  const run = page.getByRole('button', { name: 'Run Luna extraction' });
  await expect(run).toBeDisabled();
  await page.getByRole('checkbox', { name: /Send this corpus/ }).check();
  await expect(run).toBeEnabled();
  await expect(page.getByText('Luna · high reasoning', { exact: true })).toBeVisible();
  await expect(page.getByText(/Only actual human-reviewed labels\s+count/)).toBeVisible();
  // Do not invoke the model or mutate the working corpus during browser tests.
});

test('opt-in device diagnostics persist across comparisons and export only locally', async ({
  page,
}) => {
  await page.goto('/said-vs-did/?diagnostics=1');
  await page
    .getByRole('textbox', { name: 'Device and network description' })
    .fill('Automated browser smoke test, not a physical phone');
  await page.locator('.evidence-card').first().click();
  await expect(page.locator('.comparison-columns')).toBeVisible();
  await expect(page.locator('.diagnostics-panel')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download this device’s measurements' }).click();
  expect((await download).suggestedFilename()).toContain('said-did-device-');
  await expect(
    page.getByRole('status').filter({ hasText: 'Nothing was sent to a server' }),
  ).toBeVisible();
});

test('AI audit preview is separate from approval, consent-gated and filterable', async ({
  page,
}) => {
  await page.route('**/api/local-evidence', async (route) => {
    if (route.request().method() !== 'GET')
      throw new Error('Browser test must not invoke inference.');
    const response = await route.fetch(),
      body = await response.json();
    body.pilotAvailable = true;
    body.pilotAiReview = {
      stale: false,
      model: 'gpt-5.6-luna',
      effort: 'high',
      at: '2026-09-15T00:00:00Z',
      counts: { passages: 1, supported: 0, disputed: 1, insufficientEvidence: 0 },
      cases: [
        {
          passageId: 'synthetic-ui-case',
          personName: 'Fictional reviewer fixture',
          date: '2025-01-07',
          extractionVerdict: 'disputed',
          rationale: 'Synthetic test: qualification was missed.',
          issues: ['qualification'],
          quote: 'Only if the condition holds.',
          proposedClaims: [],
          citations: [{ quote: 'Only if', url: null }],
          comparisons: [],
        },
      ],
    };
    await route.fulfill({ response, json: body });
  });
  await page.goto('/said-vs-did/review/');
  await expect(
    page.getByRole('heading', { name: 'Let Luna challenge the first pass.' }),
  ).toBeVisible();
  const run = page.getByRole('button', { name: 'Run AI second-pass review' });
  await expect(run).toBeDisabled();
  await page.getByRole('checkbox', { name: /Send the saved source excerpts/ }).check();
  await expect(run).toBeEnabled();
  await expect(page.getByText(/Agreement is not an\s+accuracy score/)).toBeVisible();
  await page.locator('.ai-review-case>summary').click();
  await expect(page.getByText('Synthetic test: qualification was missed.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Show', exact: true }).selectOption('supported');
  await expect(page.getByText('No passages match this filter.')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download AI review report' }).click();
  expect((await download).suggestedFilename()).toBe('said-did-ai-review.json');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
