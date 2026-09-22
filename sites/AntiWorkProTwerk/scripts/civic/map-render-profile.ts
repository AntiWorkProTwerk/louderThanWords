import { chromium } from '@playwright/test';
import { writeAtomic } from '../said-did/pipeline';

// Diagnostic experiments only: styles are injected into an isolated browser context.
// Trace overhead and deliberately paced actions make these unsuitable as timing gates.
const experiments: Record<string, string> = {
  baseline: '',
  layer: '.vector-map { will-change: transform; contain: layout paint; }',
  opacity: '.evidence-mode .live-map { opacity: 1; }',
  hidden: '.vector-map { visibility: hidden; }',
  svg: '.vector-map > svg { transform: translateZ(0); will-change: transform; }',
  strokes: '.vector-map path { stroke: none !important; }',
  labels: '.vector-map text { display: none; }',
  static: '.vector-map * { transition: none !important; }',
  scaling: '.vector-map path { vector-effect: none !important; }',
  outline: '.vector-selected, .vector-preview { stroke: none !important; }',
  borders: '.vector-state { stroke: none !important; }',
  mesh: '.vector-state { stroke: none !important; }',
  image: '.vector-state { fill: transparent !important; stroke: none !important; }',
};
const mode = process.argv.find((arg) => arg.startsWith('--mode='))?.slice(7) ?? 'baseline';
if (!(mode in experiments)) throw new Error('Unknown rendering experiment');
const traced = process.argv.includes('--trace');
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
try {
  const browserSession = await browser.newBrowserCDPSession();
  const system = await browserSession.send('SystemInfo.getInfo');
  const gpu = {
    renderer: system.gpu.auxAttributes?.glRenderer,
    compositing: system.gpu.featureStatus?.gpu_compositing,
    rasterization: system.gpu.featureStatus?.rasterization,
  };
  const context = await browser.newContext({ viewport: { width: 1672, height: 941 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // tsx's function-name helper is not captured by Playwright's function serialization.
  await page.addInitScript('window.__name = (fn) => fn;');
  await page.addInitScript(() => {
    localStorage.setItem('ltw.map-renderer.v1', 'vector');
    (window as any).__renderEvents = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const e = entry as PerformanceEventTiming;
        if (e.interactionId)
          (window as any).__renderEvents.push({
            name: e.name,
            at: e.startTime,
            duration: e.duration,
            processing: e.processingEnd - e.processingStart,
            presentation: Math.max(0, e.startTime + e.duration - e.processingEnd),
          });
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  });
  const response = await page.goto('http://127.0.0.1:4173/AntiWorkProTwerk/records/patterns/');
  if (!response?.ok()) throw new Error(`Production page returned ${response?.status()}`);
  await page.waitForFunction(() => document.querySelectorAll('[data-vector-state]').length === 51);
  if (experiments[mode]) await page.addStyleTag({ content: experiments[mode] });
  if (mode === 'mesh')
    await page.evaluate(() => {
      const states = [...document.querySelectorAll('.vector-state')];
      const mesh = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      mesh.setAttribute('d', states.map((p) => p.getAttribute('d')).join(''));
      mesh.setAttribute('fill', 'none');
      mesh.setAttribute('stroke', 'white');
      mesh.setAttribute('stroke-width', '1');
      mesh.setAttribute('vector-effect', 'non-scaling-stroke');
      mesh.setAttribute('pointer-events', 'none');
      states.at(-1)?.after(mesh);
    });
  if (mode === 'image')
    await page.evaluate(() => {
      const ns = 'http://www.w3.org/2000/svg';
      const states = [...document.querySelectorAll('.vector-state')];
      const image = document.createElementNS(ns, 'image');
      image.setAttribute('width', '1000');
      image.setAttribute('height', '650');
      image.setAttribute('pointer-events', 'none');
      states[0].before(image);
      const refresh = () => {
        const graphic = document.createElementNS(ns, 'svg');
        graphic.setAttribute('viewBox', '0 0 1000 650');
        for (const source of states) {
          const path = document.createElementNS(ns, 'path');
          path.setAttribute('d', source.getAttribute('d')!);
          path.setAttribute('fill', source.getAttribute('fill')!);
          path.setAttribute('stroke', 'white');
          path.setAttribute('stroke-width', '1');
          graphic.append(path);
        }
        image.setAttribute(
          'href',
          'data:image/svg+xml,' +
            encodeURIComponent(new XMLSerializer().serializeToString(graphic)),
        );
      };
      refresh();
      new MutationObserver(refresh).observe(states[0].parentNode!, {
        subtree: true,
        attributes: true,
        attributeFilter: ['fill'],
      });
    });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  if (traced)
    await cdp.send('Tracing.start', {
      categories:
        'devtools.timeline,disabled-by-default-devtools.timeline.frame,blink.graphics,gpu,viz',
      transferMode: 'ReturnAsStream',
    });
  const actions: { name: string; start: number; end: number }[] = [];
  for (const [name, act] of [
    ['fixed axes', () => page.getByLabel('Keep axes fixed across years').check()],
    [
      'year 2020',
      () => page.locator('.year-track').getByRole('button', { name: '2020', exact: true }).click(),
    ],
    [
      'year 2025',
      () => page.locator('.year-track').getByRole('button', { name: '2025', exact: true }).click(),
    ],
    ['unemployment pair', () => page.getByRole('button', { name: /Pay \+ unemployment/ }).click()],
    ['open inspector', () => page.getByRole('button', { name: /Inspect map/ }).click()],
  ] as const) {
    const start = await page.evaluate(() => performance.now());
    await act();
    await page.waitForTimeout(500);
    actions.push({ name, start, end: await page.evaluate(() => performance.now()) });
  }
  let trace: any = null;
  if (traced) {
    const complete = new Promise<string>((resolve) =>
      cdp.once('Tracing.tracingComplete', (event) => resolve(event.stream)),
    );
    await cdp.send('Tracing.end');
    const handle = await complete;
    let raw = '';
    for (;;) {
      const chunk = await cdp.send('IO.read', { handle });
      raw += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString('utf8') : chunk.data;
      if (chunk.eof) break;
    }
    await cdp.send('IO.close', { handle });
    trace = JSON.parse(raw);
  }
  const events = await page.evaluate(() => (window as any).__renderEvents);
  const totals = new Map<string, { name: string; count: number; totalMs: number; maxMs: number }>();
  for (const e of trace?.traceEvents ?? []) {
    if (!e.dur || e.ph !== 'X') continue;
    const item = totals.get(e.name) ?? { name: e.name, count: 0, totalMs: 0, maxMs: 0 };
    item.count++;
    item.totalMs += e.dur / 1000;
    item.maxMs = Math.max(item.maxMs, e.dur / 1000);
    totals.set(e.name, item);
  }
  const report = {
    at: new Date().toISOString(),
    mode,
    traced,
    graphics,
    gpu,
    errors,
    profile:
      'Single desktop diagnostic, paced actions, injected CSS; inclusive trace durations can overlap; not a production timing gate',
    actions: actions.map((action) => ({
      ...action,
      events: events.filter((e: any) => e.at >= action.start && e.at <= action.end),
    })),
    traceTotals: [...totals.values()].sort((a, b) => b.totalMs - a.totalMs).slice(0, 35),
  };
  const root = `.local/patterns/render-profile/${report.at.replaceAll(':', '-')}-${mode}`;
  await writeAtomic(`${root}.json`, report);
  if (trace) await writeAtomic(`${root}-trace.json`, trace);
  console.log(
    JSON.stringify(
      {
        ...report,
        actions: report.actions.map(({ name, events }) => ({
          name,
          maxMs: Math.max(0, ...events.map((e: any) => e.duration)),
        })),
        traceTotals: report.traceTotals.slice(0, 6),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
