import { chromium } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { startDiagnostics, sampleFrames } from '../../src/lib/said-did/diagnostics.ts';
import { defaultWorkspace, writeAtomic } from './pipeline.ts';
import { hash } from './engine.ts';

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    runs: { type: 'string', default: '3' },
    workspace: { type: 'string' },
    enforce: { type: 'boolean', default: false },
  },
});
const target = new URL(values.url ?? 'http://127.0.0.1:8788/AntiWorkProTwerk/said-vs-did/');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname))
  throw new Error('Laboratory benchmarks must target a local production preview.');
const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw new Error('--runs must be 1–10.');
const workspace = values.workspace ? resolve(values.workspace) : defaultWorkspace;
const manifest = JSON.parse(
  await readFile(resolve('.svelte-kit/output/client/.vite/manifest.json'), 'utf8'),
);
const optionalMaps = new Set(
  Object.entries<any>(manifest)
    .filter(([key, entry]) => /maplibre-gl/.test(key))
    .map(([, entry]) => entry.file),
);
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined),
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const results: any[] = [];
const percentile = (values: number[], q: number) =>
  values.length
    ? [...values].sort((a, b) => a - b)[
        Math.min(values.length - 1, Math.ceil(values.length * q) - 1)
      ]
    : null;
try {
  for (const profile of ['desktop', 'mobile'] as const)
    for (let run = 0; run < runs; run++) {
      const context = await browser.newContext({
        viewport: profile === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 },
        isMobile: profile === 'mobile',
        hasTouch: profile === 'mobile',
        deviceScaleFactor: profile === 'mobile' ? 2 : 1,
      });
      const page = await context.newPage(),
        cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: profile === 'mobile' ? 80 : 0,
        downloadThroughput: profile === 'mobile' ? 1_600_000 / 8 : -1,
        uploadThroughput: profile === 'mobile' ? 750_000 / 8 : -1,
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile === 'mobile' ? 4 : 1 });
      await page.addInitScript(
        `window.__name = (fn) => fn; window.__saidDidLab = (${startDiagnostics.toString()})();`,
      );
      const scripts = new Map<string, number>(),
        bodies: Promise<void>[] = [];
      page.on('response', (response) => {
        if (!/\.js(?:\?|$)/.test(response.url())) return;
        const pathname = new URL(response.url()).pathname;
        if (
          [...optionalMaps].some((file) => pathname.endsWith(file)) ||
          /maplibre-gl-worker/.test(pathname)
        )
          return;
        bodies.push(
          response
            .body()
            .then((body) => {
              scripts.set(pathname, gzipSync(body).length);
            })
            .catch(() => {}),
        );
      });
      await page.goto(target.href);
      if (await page.locator('script[src*="@vite/client"]').count())
        throw new Error(
          'Benchmark refused a Vite development server; build and use the production preview.',
        );
      await page.locator('.evidence-card').first().waitFor();
      await page.locator('.map-state-name').first().waitFor({ timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready);
      await Promise.all(bodies);
      const initialGzipBytes = [...scripts.values()].reduce((a, b) => a + b, 0);
      const map = await page.locator('.maplibregl-canvas').count();
      await page.locator('.evidence-card').first().click();
      await page.locator('.comparison-columns').waitFor();
      await page.goBack();
      await page.locator('.evidence-card').first().waitFor();
      await page.locator('.evidence-card').first().hover();
      await page.evaluate(() => {
        (window as any).__navigationMs = null;
        document.addEventListener(
          'click',
          () => {
            const start = performance.now();
            const observer = new MutationObserver(() => {
              if (document.querySelector('.comparison-columns')) {
                (window as any).__navigationMs = performance.now() - start;
                observer.disconnect();
              }
            });
            observer.observe(document.body, { childList: true, subtree: true });
          },
          { once: true, capture: true },
        );
      });
      await page.locator('.evidence-card').first().click();
      await page.locator('.comparison-columns').waitFor();
      await page.locator('#evidence-statement summary').click();
      const framePromise = page.evaluate(`(${sampleFrames.toString()})(1500)`);
      if (profile === 'mobile') await page.getByRole('button', { name: /evidence panel/ }).click();
      else await page.getByRole('button', { name: /Focus / }).click();
      const frames = (await framePromise) as number[];
      const metrics = await page.evaluate(() => (window as any).__saidDidLab.snapshot());
      const cachedNavigationMs = await page.evaluate(() => (window as any).__navigationMs);
      const result = {
        profile,
        run: run + 1,
        metrics,
        cachedNavigationMs,
        initialApplicationGzipBytes: initialGzipBytes,
        measuredJavaScriptFiles: Object.fromEntries(scripts),
        excludedOptionalMapFiles: [...optionalMaps],
        frameP95Ms: percentile(frames, 0.95),
        framesOver34Ms: frames.filter((v) => v > 34).length,
        frameSamples: frames.length,
        mapInstances: map,
        noHorizontalOverflow: await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      };
      results.push(result);
      console.log(
        `${profile} ${run + 1}: LCP=${metrics.lcpMs}ms INP estimate=${metrics.inpEstimateMs}ms cached nav=${cachedNavigationMs}ms JS=${initialGzipBytes} gzip bytes`,
      );
      await context.close();
    }
  const profiles = Object.fromEntries(
    ['desktop', 'mobile'].map((profile) => {
      const samples = results.filter((r) => r.profile === profile);
      const p75 = (pick: (r: any) => number | null) =>
        percentile(
          samples.map(pick).filter((v): v is number => v !== null),
          0.75,
        );
      const lcp = p75((r) => r.metrics.lcpMs),
        inp = p75((r) => r.metrics.inpEstimateMs),
        nav = p75((r) => r.cachedNavigationMs);
      return [
        profile,
        {
          runs: samples.length,
          lcpP75Ms: lcp,
          inpEstimateP75Ms: inp,
          cachedNavigationP75Ms: nav,
          gates: {
            lcpBelow2500: lcp !== null && lcp < 2500,
            inpBelow200: inp !== null && inp < 200,
            cachedNavigationBelow200: nav !== null && nav < 200,
            initialApplicationJsBelow200KB: samples.every(
              (r) => r.initialApplicationGzipBytes <= 200_000,
            ),
            onePersistentMap: samples.every((r) => r.mapInstances === 1),
            noHorizontalOverflow: samples.every((r) => r.noHorizontalOverflow),
          },
        },
      ];
    }),
  );
  const report = {
    formatVersion: 1,
    at: new Date().toISOString(),
    target: target.href,
    browser: await browser.version(),
    environment:
      'Headless Chromium, software WebGL; desktop and 4x CPU/1.6Mbps/80ms mobile emulation. NOT physical-phone or field acceptance.',
    profiles,
    results,
    physicalDeviceAcceptance: 'pending manual-device report',
    fieldAcceptance: 'not measurable before real users',
    animationNote:
      'Frame p95 and >34ms samples are diagnostics, not a 60fps certification on software-rendered headless hardware.',
  };
  const file = join(workspace, 'performance', 'lab-report.json');
  await writeAtomic(file, report);
  await writeAtomic(join(workspace, 'performance', 'reports', `${hash(report)}.json`), report);
  console.log(`Saved ${file}`);
  if (
    values.enforce &&
    Object.values<any>(profiles).some((p) => Object.values(p.gates).some((passed) => !passed))
  )
    process.exitCode = 2;
} finally {
  await browser.close();
}
