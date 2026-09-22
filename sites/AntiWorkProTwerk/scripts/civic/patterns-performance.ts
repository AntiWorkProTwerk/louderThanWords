import { chromium, type Page } from '@playwright/test';
import { join } from 'node:path';
import { writeAtomic } from '../said-did/pipeline';

const url = 'http://127.0.0.1:4173/AntiWorkProTwerk/records/patterns/';
const renderer = process.argv.includes('--vector') ? 'vector' : 'webgl';
const graphics = process.argv.includes('--default-graphics')
  ? 'browser-default'
  : 'forced-swiftshader';
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
  args:
    graphics === 'browser-default'
      ? []
      : ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const browserSession = await browser.newBrowserCDPSession();
const system = await browserSession.send('SystemInfo.getInfo');
const gpu = {
  renderer: system.gpu.auxAttributes?.glRenderer,
  compositing: system.gpu.featureStatus?.gpu_compositing,
  rasterization: system.gpu.featureStatus?.rasterization,
};
const samples: any[] = [],
  loadErrors: string[] = [];
let failure: string | null = null,
  active: Page | null = null,
  failureEvidence: unknown = null;
try {
  for (const phone of [false, true])
    for (let run = 1; run <= 3; run++) {
      console.log(JSON.stringify({ stage: 'starting', phone, run }));
      const context = await browser.newContext({
        viewport: phone ? { width: 390, height: 844 } : { width: 1672, height: 941 },
        reducedMotion: 'no-preference',
      });
      const page = await context.newPage();
      active = page;
      const cdp = await context.newCDPSession(page),
        errors: string[] = [],
        geographyRequests: { url: string; timing: unknown }[] = [];
      page.on('requestfinished', (request) => {
        if (/\/geography\/(states|world)\.geojson$/.test(request.url()))
          geographyRequests.push({ url: request.url(), timing: request.timing() });
      });
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (r) => {
        if (r.status() >= 400) loadErrors.push(`${r.status()} ${r.url()}`);
      });
      page.on('requestfailed', (r) => loadErrors.push(`${r.url()} ${r.failure()?.errorText}`));
      if (phone) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: 80,
          downloadThroughput: 200000,
          uploadThroughput: 100000,
        });
      }
      await page.addInitScript((renderer) => {
        localStorage.setItem('ltw.map-renderer.v1', renderer);
        const timing = ((window as any).__patternTiming = {
          lcp: 0,
          mapReadyMs: null as number | null,
          backgroundReadyMs: null as number | null,
          events: [] as unknown[],
          inputs: [] as { name: string; at: number; label: string }[],
        });
        const mapObserver = new MutationObserver(() => {
          if (
            timing.mapReadyMs === null &&
            document.querySelectorAll(
              renderer === 'vector' ? '[data-vector-state]' : '.map-state-name',
            ).length === 51
          ) {
            timing.mapReadyMs = performance.now();
          }
          if (
            renderer === 'webgl' &&
            timing.backgroundReadyMs === null &&
            document
              .querySelector('[data-testid="us-map"]')
              ?.getAttribute('data-background-state') === 'ready'
          )
            timing.backgroundReadyMs = performance.now();
          if (
            timing.mapReadyMs !== null &&
            (renderer === 'vector' || timing.backgroundReadyMs !== null)
          )
            mapObserver.disconnect();
        });
        mapObserver.observe(document, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-background-state'],
        });
        // Capture labels before a clicked popover button is removed from the DOM.
        // Keep these separate from Event Timing so timestamp matches stay auditable.
        for (const name of ['pointerdown', 'pointerup', 'click', 'keydown'])
          document.addEventListener(
            name,
            (event) => {
              const target =
                event.target instanceof Element
                  ? (event.target.closest('button,input,select') ?? event.target)
                  : null;
              const labels =
                target instanceof HTMLInputElement || target instanceof HTMLSelectElement
                  ? Array.from(target.labels ?? [])
                      .map((label) => label.textContent)
                      .join(' ')
                  : '';
              timing.inputs.push({
                name,
                at: event.timeStamp,
                label: (target?.getAttribute('aria-label') || labels || target?.textContent || '')
                  .trim()
                  .slice(0, 120),
              });
            },
            true,
          );
        new PerformanceObserver(
          (list) => (timing.lcp = list.getEntries().at(-1)?.startTime ?? 0),
        ).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) =>
          timing.events.push(
            ...list
              .getEntries()
              .filter((e) => (e as PerformanceEventTiming).interactionId)
              .map((entry) => {
                const e = entry as PerformanceEventTiming;
                return {
                  name: e.name,
                  startTime: e.startTime,
                  duration: e.duration,
                  inputDelayMs: e.processingStart - e.startTime,
                  processingMs: e.processingEnd - e.processingStart,
                  presentationMs: Math.max(0, e.startTime + e.duration - e.processingEnd),
                  target:
                    e.target instanceof Element
                      ? {
                          tag: e.target.tagName,
                          label: (e.target.getAttribute('aria-label') ?? e.target.textContent ?? '')
                            .trim()
                            .slice(0, 120),
                          className: e.target.getAttribute('class'),
                        }
                      : null,
                };
              }),
          ),
        ).observe({ type: 'event', buffered: true, durationThreshold: 16 });
      }, renderer);
      const started = Date.now(),
        response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      if (!response?.ok()) throw new Error(`Production document returned ${response?.status()}`);
      if (await page.locator('script[src*="/@vite/client"]').count())
        throw new Error('Production preview required');
      await page.waitForFunction(
        () =>
          document.querySelectorAll('.pattern-dot').length === 51 &&
          !document.querySelector<HTMLButtonElement>('.pattern-dot')?.disabled,
      );
      const readyMs = Date.now() - started;
      if (phone)
        await page.getByRole('button', { name: 'Expand evidence panel', exact: true }).click();
      await page.getByLabel('Keep axes fixed across years').check();
      for (const year of ['2020', '2021', '2025']) {
        await page.locator('.year-track').getByRole('button', { name: year, exact: true }).click();
        await page.waitForFunction(
          (y) => document.querySelector('.year-control strong')?.textContent === y,
          year,
        );
      }
      await page.getByRole('button', { name: /Pay \+ unemployment/ }).click();
      await page.getByLabel('State or district', { exact: true }).selectOption('CA');
      await page.getByLabel('State or district', { exact: true }).selectOption('WA');
      const comparison = page.getByTestId('state-comparison');
      const coefficient = await page.getByTestId('pattern-r').textContent();
      await page.getByLabel('Comparison state or district', { exact: true }).selectOption('CA');
      for (const state of ['CA', 'WA']) {
        await comparison.getByRole('button', { name: 'Swap states ⇄', exact: true }).click();
        await page.waitForFunction(
          (code) => new URL(location.href).searchParams.get('state') === code,
          state,
        );
      }
      if ((await page.getByTestId('pattern-r').textContent()) !== coefficient)
        throw new Error('Two-state comparison changed the correlation coefficient');
      await comparison.getByRole('button', { name: 'View marked chart ↑', exact: true }).click();
      await comparison.getByRole('button', { name: 'Clear comparison', exact: true }).click();
      await page.waitForFunction(() => !new URL(location.href).searchParams.has('peer'));
      const directions = page.getByTestId('pattern-directions');
      const beforeDirections = page.url();
      await directions.locator(':scope > summary').click();
      const directionGroup = directions.locator('.direction-group').filter({
        has: page.locator('[data-direction-state=TX]'),
      });
      await directionGroup.locator(':scope > summary').click();
      if (page.url() !== beforeDirections) throw new Error('Direction disclosure changed filters');
      await directionGroup.locator('[data-direction-state=TX]').click();
      await page.waitForFunction(() => new URL(location.href).searchParams.get('state') === 'TX');
      if (
        (await page.getByTestId('pattern-r').textContent()) !== coefficient ||
        (await page.locator('.pattern-dot').count()) !== 51
      )
        throw new Error('Direction selection changed the correlation cohort');
      await directions.locator(':scope > summary').click();
      const history = page.getByTestId('correlation-history');
      const beforeHistoryPreview = page.url();
      await history.locator('[data-history-year="2025"]').focus();
      await page.keyboard.press('Home');
      if (page.url() !== beforeHistoryPreview)
        throw new Error('Annual preview changed the selected year');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => new URL(location.href).searchParams.get('year') === '2017');
      await history.locator('[data-history-year="2025"]').click();
      await page.waitForFunction(() => new URL(location.href).searchParams.get('year') === '2025');
      await page.getByLabel('Keep axes fixed across years').uncheck();
      const beforeChartPreview = page.url();
      await page.locator('.pattern-dot[data-state=WA]').focus();
      await page.keyboard.press('ArrowLeft');
      if (page.url() !== beforeChartPreview)
        throw new Error('Chart preview changed the selected region');
      const previewCode = await page.locator('.pattern-dot:focus').getAttribute('data-state');
      await page.keyboard.press('Enter');
      await page.waitForFunction(
        (code) => new URL(location.href).searchParams.get('state') === code,
        previewCode,
      );
      await page.locator('.endpoints summary').click();
      if (phone)
        await page.getByRole('button', { name: 'Collapse evidence panel', exact: true }).click();
      await page.getByRole('button', { name: /Inspect map/ }).click();
      const inspector = page.getByRole('dialog', { name: 'Map inspector', exact: true });
      const beforePreview = page.url();
      await inspector.locator('select').selectOption('CA');
      if (page.url() !== beforePreview) throw new Error('Map preview changed the record filters');
      await inspector
        .getByRole('button', { name: 'Use California in this view', exact: false })
        .click();
      await page.waitForFunction(() => new URL(location.href).searchParams.get('state') === 'CA');
      await page.waitForTimeout(1000);
      // Initial evidence controls can be usable before the lazy geographic assets arrive.
      // Observe that completion separately; do not mistake the end of the action sequence
      // for a failed map, or change the already-recorded evidence readiness time.
      await page.waitForFunction(
        () => (window as any).__patternTiming.mapReadyMs !== null,
        {},
        { timeout: 20000 },
      );
      if (renderer === 'webgl')
        await page.waitForFunction(
          () => (window as any).__patternTiming.backgroundReadyMs !== null,
          {},
          { timeout: 20000 },
        );
      // Exercise the map again after all geographic context has arrived as well.
      const completedView = page.url();
      await page.getByRole('button', { name: /Inspect map/ }).click();
      await inspector.locator('select').selectOption('WA');
      if (page.url() !== completedView) throw new Error('Completed-map preview changed filters');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      const timing = await page.evaluate(() => ({
        ...(window as any).__patternTiming,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      }));
      const sample = {
        phone,
        run,
        readyMs,
        ...timing,
        maxInteractionMs: Math.max(0, ...timing.events.map((e: any) => e.duration)),
        errors,
        geographyRequests,
      };
      samples.push(sample);
      console.log(
        JSON.stringify({
          stage: 'measured',
          phone,
          run,
          readyMs,
          maxInteractionMs: sample.maxInteractionMs,
          errors,
        }),
      );
      await context.close();
    }
} catch (e) {
  failure = String(e);
  failureEvidence =
    active && !active.isClosed()
      ? await active
          .evaluate(() => ({ url: location.href, text: document.body.innerText.slice(0, 1200) }))
          .catch(String)
      : null;
} finally {
  await browser.close();
}
const report = {
  profileVersion: 'state-patterns-v6-directions',
  at: new Date().toISOString(),
  url,
  renderer,
  graphics,
  gpu,
  directionActions:
    'Native group disclosure, select Texas, preserve 51-region cohort and r, close disclosure; all v5 actions retained.',
  profile:
    '3 desktop + 3 emulated phone; 4x phone CPU, 1.6 Mbps, 80 ms; graphics backend and map renderer recorded separately; mapReadyMs is state DOM readiness, not final paint; backgroundReadyMs separately observes surrounding-geography source/tile readiness, not final paint; geography request timings retained; animations enabled; fixed-axis year changes, pair, region, peer setup via programmatic selectOption (not a measured native picker gesture), measured comparison swap/restore/chart-link/clear clicks, annual-history keyboard preview/selection and year restoration, scale, chart keyboard preview/selection, source expansion, map inspector preview and explicit apply, then another inspector preview/dismissal after geographic context is ready',
  failure,
  failureEvidence,
  loadErrors,
  samples,
};
await writeAtomic(
  join('.local/patterns/performance', report.at.replaceAll(':', '-') + '.json'),
  report,
);
await writeAtomic('.local/patterns/performance/latest.json', report);
// Preserve the existing software-stress receipts when measuring browser-default graphics.
await writeAtomic(
  `.local/patterns/performance/latest-${renderer}${graphics === 'browser-default' ? '-default-graphics' : ''}.json`,
  report,
);
console.log(
  JSON.stringify(
    {
      at: report.at,
      renderer,
      graphics,
      gpu,
      failure,
      loadErrors,
      samples: samples.map(
        ({
          phone,
          run,
          readyMs,
          mapReadyMs,
          backgroundReadyMs,
          maxInteractionMs,
          overflow,
          errors,
        }) => ({
          phone,
          run,
          readyMs,
          mapReadyMs,
          backgroundReadyMs,
          maxInteractionMs,
          overflow,
          errors,
        }),
      ),
    },
    null,
    2,
  ),
);
if (
  failure ||
  loadErrors.length ||
  samples.length !== 6 ||
  samples.some(
    (s) =>
      s.errors.length ||
      s.overflow ||
      s.mapReadyMs === null ||
      (renderer === 'webgl' && s.backgroundReadyMs === null) ||
      s.maxInteractionMs >= 200,
  )
)
  process.exitCode = 1;
