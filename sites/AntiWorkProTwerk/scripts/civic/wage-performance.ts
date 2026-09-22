import { chromium } from '@playwright/test';
import { parseArgs } from 'node:util';
import { join, resolve } from 'node:path';
import { writeAtomic } from '../said-did/pipeline';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:4173/AntiWorkProTwerk/records/wages/' },
    runs: { type: 'string', default: '3' },
    output: { type: 'string', default: '.local/wages/performance' },
    network: { type: 'boolean', default: false },
  },
});
const url = new URL(values.url!),
  runs = Number(values.runs);
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
  !Number.isInteger(runs) ||
  runs < 1 ||
  runs > 10
)
  throw new Error('Use a local production preview and 1–10 runs');
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const samples: any[] = [];
try {
  for (const mobile of [false, true])
    for (let run = 1; run <= runs; run++) {
      const context = await browser.newContext({
          viewport: mobile ? { width: 390, height: 844 } : { width: 1672, height: 941 },
          reducedMotion: 'reduce',
        }),
        page = await context.newPage();
      const session = await context.newCDPSession(page);
      if (mobile) await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      if (mobile && values.network)
        await session.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: 80,
          downloadThroughput: 200000,
          uploadThroughput: 100000,
        });
      const errors: string[] = [],
        requests: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => requests.push(request.url()));
      await page.addInitScript(() => {
        const state = ((window as any).__wagePerformance = {
          lcp: 0,
          events: [] as number[],
          eventDetails: [] as unknown[],
        });
        new PerformanceObserver((list) => {
          state.lcp = list.getEntries().at(-1)?.startTime ?? 0;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) => {
          state.events.push(
            ...list
              .getEntries()
              .filter((entry) => (entry as any).interactionId)
              .map((entry) => entry.duration),
          );
          state.eventDetails.push(
            ...list
              .getEntries()
              .filter((entry) => (entry as any).interactionId)
              .map((entry) => {
                const event = entry as PerformanceEventTiming;
                return {
                  name: event.name,
                  target: (event.target as HTMLElement | null)?.className ?? '',
                  start: event.startTime,
                  duration: event.duration,
                  inputDelay: event.processingStart - event.startTime,
                  processing: event.processingEnd - event.processingStart,
                  presentation: event.startTime + event.duration - event.processingEnd,
                };
              }),
          );
        }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
      });
      const start = Date.now();
      await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      if (await page.locator('script[src*="/@vite/client"]').count())
        throw new Error('Benchmark requires production, not Vite development');
      await page.waitForFunction(
        () =>
          !(document.querySelector('.evidence-sheet-toggle') as HTMLButtonElement | null)?.disabled,
      );
      await page.locator('.wage-group').first().waitFor();
      const readyMs = Date.now() - start,
        initialRequests = [...requests];
      if (
        initialRequests.some(
          (path) =>
            path.includes('/cases-v1/') || /\/data\/wages\/releases\/[^/]+\/data\.json/.test(path),
        )
      )
        throw new Error('Wage initial load downloaded full case evidence');
      if (mobile) await page.getByRole('button', { name: 'Expand evidence panel' }).click();
      await page.getByLabel('Search employer or case', { exact: true }).fill('Chipotle');
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('.wage-group')].length > 0 &&
          [...document.querySelectorAll('.wage-group')].every((el) =>
            el.textContent?.includes('Chipotle'),
          ),
      );
      await page.locator('.wage-group').first().click();
      await page.locator('.wage-case').first().click();
      await page.locator('.wage-detail').waitFor();
      await page.getByRole('button', { name: 'Close case ×' }).click();
      const cachedStart = Date.now();
      await page.locator('.wage-case').first().click();
      await page.locator('.wage-detail').waitFor();
      const cachedDetailMs = Date.now() - cachedStart;
      // Event Timing is delivered asynchronously. This short collection window is not an app delay.
      await page.waitForTimeout(300);
      const measured = await page.evaluate(() => ({
        ...(window as any).__wagePerformance,
        htmlBytes: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)
          .encodedBodySize,
        domNodes: document.querySelectorAll('*').length,
      }));
      const sample = {
        mobile,
        run,
        readyMs,
        cachedDetailMs,
        ...measured,
        maximumEventMs: Math.max(0, ...measured.events),
        detailRequests: requests.filter((path) => path.includes('/cases-v1/')).length,
        errors,
      };
      if (errors.length) throw new Error(errors.join('; '));
      samples.push(sample);
      console.log(JSON.stringify({ ...sample, eventDetails: undefined }));
      await context.close();
    }
} finally {
  await browser.close();
}
const p75 = (values: number[]) =>
  values.toSorted((a, b) => a - b)[Math.max(0, Math.ceil(values.length * 0.75) - 1)];
const report = {
  formatVersion: 1,
  at: new Date().toISOString(),
  url: url.href,
  runs,
  profile: {
    phoneCpu: 4,
    phoneNetwork: values.network ? '1.6 Mbps download / 80 ms latency' : 'unthrottled localhost',
    physicalDevice: false,
    fieldINP: false,
    reducedMotion: true,
  },
  samples,
  summary: [false, true].map((mobile) => {
    const selected = samples.filter((s) => s.mobile === mobile);
    return {
      mobile,
      lcpP75: p75(selected.map((s) => s.lcp)),
      readyP75: p75(selected.map((s) => s.readyMs)),
      maximumEventP75: p75(selected.map((s) => s.maximumEventMs)),
      cachedDetailP75: p75(selected.map((s) => s.cachedDetailMs)),
    };
  }),
};
const directory = resolve(values.output!);
await writeAtomic(join(directory, `${report.at.replaceAll(':', '-')}.json`), report);
await writeAtomic(join(directory, 'latest.json'), report);
console.log(JSON.stringify(report.summary));
