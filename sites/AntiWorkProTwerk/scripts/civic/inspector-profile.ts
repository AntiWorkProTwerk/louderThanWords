import { chromium } from '@playwright/test';
import { writeAtomic } from '../said-did/pipeline';

// A paced CPU diagnostic, not a substitute for the complete interaction gate.
const label = process.argv.find((arg) => arg.startsWith('--label='))?.slice(8) ?? 'baseline';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Use a simple diagnostic label');
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(),
    cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    localStorage.setItem('ltw.map-renderer.v1', 'vector');
    (window as any).__inspectorEvents = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const event = entry as PerformanceEventTiming;
        if (event.interactionId)
          (window as any).__inspectorEvents.push({
            name: event.name,
            at: event.startTime,
            duration: event.duration,
            processing: event.processingEnd - event.processingStart,
            input: event.processingStart - event.startTime,
          });
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  });
  const response = await page.goto('http://127.0.0.1:4173/AntiWorkProTwerk/records/patterns/');
  if (!response?.ok()) throw new Error(`Production response ${response?.status()}`);
  await page.waitForFunction(() => document.querySelectorAll('[data-vector-state]').length === 51);
  await page.waitForTimeout(1000);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  await cdp.send('Profiler.start');
  await page.getByRole('button', { name: /Inspect map/ }).click();
  await page.getByRole('dialog', { name: 'Map inspector', exact: true }).waitFor();
  await page.waitForTimeout(500);
  const { profile } = await cdp.send('Profiler.stop');
  const frames = new Map(profile.nodes.map((node) => [node.id, node.callFrame]));
  const costs = new Map<number, number>();
  profile.samples?.forEach((id, index) =>
    costs.set(id, (costs.get(id) ?? 0) + (profile.timeDeltas?.[index] ?? 0)),
  );
  const top = [...costs]
    .map(([id, time]) => ({ frame: frames.get(id), selfMs: time / 1000 }))
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, 35);
  const events = await page.evaluate(() => (window as any).__inspectorEvents);
  const report = {
    at: new Date().toISOString(),
    label,
    profile:
      '4x CPU, 390x844, vector, default graphics; paced first open; profiler overhead; diagnostic only',
    events,
    top,
    cpu: profile,
  };
  await writeAtomic(
    `.local/map-inspector/profile/${report.at.replaceAll(':', '-')}-${label}.json`,
    report,
  );
  console.log(JSON.stringify({ at: report.at, label, events, top }, null, 2));
} finally {
  await browser.close();
}
