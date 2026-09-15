import { test, expect } from '@playwright/test';

test('laboratory interaction and memory diagnostics keep one map alive', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const metrics = { lcp: 0, cls: 0 };
    (window as any).__ltwMetrics = metrics;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any) {
        if (!entry.hadRecentInput) metrics.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.map-state-name')).toHaveCount(51);
  await page.evaluate(() => document.fonts.ready);
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  await session.send('HeapProfiler.collectGarbage');
  const before = await session.send('Performance.getMetrics');
  const interactions: number[] = [];
  for (let i = 0; i < 12; i++) {
    const start = Date.now();
    await page.locator('[data-person=cruz]').click();
    await expect(page.locator('.detail-profile')).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Representative details' })
      .getByRole('button', { name: 'Donations' })
      .click();
    await expect(page.locator('.donor-row')).toHaveCount(3);
    interactions.push(Date.now() - start);
    await page.keyboard.press('Escape');
  }
  await session.send('HeapProfiler.collectGarbage');
  const after = await session.send('Performance.getMetrics');
  const heap = (metrics: { name: string; value: number }[]) =>
    metrics.find((m) => m.name === 'JSHeapUsedSize')!.value;
  const heapGrowth = heap(after.metrics) - heap(before.metrics);
  expect(heapGrowth).toBeLessThan(20 * 1024 * 1024);
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);
  await expect(page.getByTestId('us-map')).toHaveAttribute('data-map-generation', '1');
  const frameTimes = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const times: number[] = [];
        let previous = performance.now();
        function frame(now: number) {
          times.push(now - previous);
          previous = now;
          if (times.length < 60) requestAnimationFrame(frame);
          else resolve(times);
        }
        requestAnimationFrame(frame);
      }),
  );
  const metrics = await page.evaluate(() => (window as any).__ltwMetrics);
  await testInfo.attach('lab-performance.json', {
    body: JSON.stringify(
      {
        environment:
          'Headless desktop Chromium; software WebGL. Not physical-device or field metrics.',
        ...metrics,
        heapGrowthBytes: heapGrowth,
        interactionRoundTripsMs: interactions,
        frameTimesMs: frameTimes,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
});
