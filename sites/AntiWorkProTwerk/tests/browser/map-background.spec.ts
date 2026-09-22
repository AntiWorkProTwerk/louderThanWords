import { test, expect } from '@playwright/test';

test('state interactions become ready before surrounding geography, without a duplicate state request', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  let release!: () => void,
    stateRequests = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  page.on('request', (request) => {
    if (request.url().endsWith('/geography/states.geojson')) stateRequests++;
  });
  await page.route('**/geography/world.geojson', async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });
  try {
    await page.goto('/records/patterns/?state=TX&peer=CA', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.map-state-name')).toHaveCount(51);
    await expect(page.locator('.map-loading')).toHaveCount(0);
    await expect(page.getByTestId('us-map')).toHaveAttribute('data-background-state', 'loading');
    await expect(page.locator('.map-overview small')).toHaveText('Surroundings loading');
    expect(stateRequests).toBe(1);
    await page.evaluate(() => {
      (window as any).__backgroundMap = document.querySelector('.maplibregl-canvas');
    });
    await page.getByRole('button', { name: /Inspect map/ }).click();
    const inspector = page.getByRole('dialog', { name: 'Map inspector', exact: true });
    await expect(inspector.getByTestId('background-status')).toContainText(
      'already inspect and select states',
    );
    await inspector.locator('select').selectOption('WA');
    await inspector
      .getByRole('button', { name: 'Use Washington in this view', exact: false })
      .click();
    await expect(page).toHaveURL(/state=WA/);
    await expect(page.getByTestId('us-map')).toHaveAttribute('data-comparison-state', 'CA');
    const before = page.url();
    await page.screenshot({ path: 'test-results/map-states-before-background.png' });
    release();
    await expect(page.getByTestId('us-map')).toHaveAttribute('data-background-state', 'ready');
    await expect(page.locator('.map-overview small')).toHaveCount(0);
    expect(page.url()).toBe(before);
    expect(stateRequests).toBe(1);
    expect(
      await page.evaluate(
        () => document.querySelector('.maplibregl-canvas') === (window as any).__backgroundMap,
      ),
    ).toBe(true);
  } finally {
    release();
  }
});

test('background failure has its own retry and never disables states or changes record filters', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let requests = 0;
  await page.route('**/geography/world.geojson', (route) =>
    ++requests === 1 ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue(),
  );
  await page.goto('/records/patterns/?state=TX&peer=CA&year=2020');
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-background-state', 'error');
  await expect(page.locator('.map-state-name')).toHaveCount(51);
  await expect(page.locator('.map-notice')).toHaveCount(0);
  await expect(page.locator('.map-overview small')).toHaveText('Background unavailable');
  const before = page.url();
  await page.getByRole('button', { name: /Inspect map/ }).click();
  const inspector = page.getByRole('dialog', { name: 'Map inspector', exact: true });
  await expect(inspector.getByTestId('background-status')).toContainText('still available');
  await inspector
    .getByRole('button', { name: 'Retry surrounding geography', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/map-background-retry-phone.png' });
  await inspector.getByRole('button', { name: 'Retry surrounding geography', exact: true }).click();
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-background-state', 'ready');
  await expect(inspector.getByTestId('background-status')).toContainText('not evidence coverage');
  await expect(inspector.getByTestId('background-status')).toBeFocused();
  expect(page.url()).toBe(before);
  expect(requests).toBe(2);
  await page.keyboard.press('Escape');
  for (const button of await page.locator('.map-toolbar button').all()) {
    expect(
      await button.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }),
    ).toBe(true);
  }
});

test('switching to lightweight cancels unfinished background and returning retains one WebGL canvas', async ({
  page,
}) => {
  const aborted: string[] = [];
  page.on('requestfailed', (request) => {
    if (request.url().endsWith('/geography/world.geojson'))
      aborted.push(request.failure()?.errorText ?? 'unknown');
  });
  let release!: () => void,
    requests = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/geography/world.geojson', async (route) => {
    if (++requests === 1) await gate;
    await route.continue().catch(() => {});
  });
  try {
    await page.goto('/records/patterns/?state=TX');
    await expect(page.getByTestId('us-map')).toHaveAttribute('data-background-state', 'loading');
    await page.evaluate(() => {
      (window as any).__backgroundMap = document.querySelector('.maplibregl-canvas');
    });
    const before = page.url();
    await page.getByRole('button', { name: 'Lightweight map', exact: true }).click();
    await expect(page.locator('[data-vector-state]')).toHaveCount(51);
    await expect(page.getByTestId('us-map')).toHaveAttribute('data-background-state', 'idle');
    release();
    await expect.poll(() => aborted.length).toBe(1);
    await page.getByRole('button', { name: 'Lightweight map', exact: true }).click();
    await expect(page.getByTestId('us-map')).toHaveAttribute('data-background-state', 'ready');
    expect(page.url()).toBe(before);
    expect(
      await page.evaluate(
        () => document.querySelector('.maplibregl-canvas') === (window as any).__backgroundMap,
      ),
    ).toBe(true);
    const completedRequests = requests;
    await page.getByRole('button', { name: 'Lightweight map', exact: true }).click();
    await expect(page.locator('[data-vector-state]')).toHaveCount(51);
    await page.getByRole('button', { name: 'Lightweight map', exact: true }).click();
    await expect(page.getByTestId('us-map')).toHaveAttribute('data-background-state', 'ready');
    expect(requests).toBe(completedRequests);
  } finally {
    release();
  }
});
