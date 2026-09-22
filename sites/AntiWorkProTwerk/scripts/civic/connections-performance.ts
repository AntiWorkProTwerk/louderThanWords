import { chromium } from '@playwright/test';
import { writeAtomic } from '../said-did/pipeline';
import { join } from 'node:path';

// Local production-only lab profile; browser emulation is not field telemetry.
const url = 'http://127.0.0.1:4173/AntiWorkProTwerk/records/connections/?company=0000789019';
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const samples: any[] = [];
const disableCatalogBlur = process.env.CATALOG_DISABLE_BLUR === '1';
let failure: string | null = null;
let failureEvidence: unknown = null;
let activePage: import('@playwright/test').Page | null = null;
const loadErrors: string[] = [];
let current: {phone:boolean;run:number} | null = null;
try {
  for (const phone of [false, true]) for (let run = 1; run <= 3; run++) {
    current = {phone,run};
    console.log(JSON.stringify({stage:'starting',...current}));
    const context = await browser.newContext({ viewport: phone ? { width:390,height:844 } : { width:1672,height:941 }, reducedMotion:'no-preference' });
    const page = await context.newPage(), cdp = await context.newCDPSession(page), errors: string[] = [];
    activePage = page;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) loadErrors.push(`${response.status()} ${response.url()}`);
    });
    page.on('requestfailed', (request) => loadErrors.push(`${request.url()} ${request.failure()?.errorText}`));
    if (phone) {
      await cdp.send('Emulation.setCPUThrottlingRate', {rate:4});
      await cdp.send('Network.emulateNetworkConditions', {offline:false,latency:80,downloadThroughput:200000,uploadThroughput:100000});
    }
    await page.addInitScript(() => {
      const timing = ((window as any).__connectionsTiming = { lcp:0,events:[] as number[],eventDetails:[] as unknown[],longTasks:[] as number[] });
      new PerformanceObserver((list) => timing.lcp = list.getEntries().at(-1)?.startTime ?? 0).observe({type:'largest-contentful-paint',buffered:true});
      new PerformanceObserver((list) => {
        const entries = list.getEntries().filter((e) => (e as any).interactionId);
        timing.events.push(...entries.map((e) => e.duration));
        timing.eventDetails.push(...entries.map((e) => {
          const event = e as PerformanceEventTiming;
          return {name:e.name,duration:e.duration,startTime:e.startTime,
            inputDelayMs:event.processingStart-e.startTime,
            processingMs:event.processingEnd-event.processingStart,
            presentationMs:Math.max(0,e.startTime+e.duration-event.processingEnd),
            target:((e as any).target as HTMLElement | null)?.textContent?.slice(0,100) ?? null};
        }));
      }).observe({type:'event',buffered:true,durationThreshold:16});
      new PerformanceObserver((list) => timing.longTasks.push(...list.getEntries().map((e) => e.duration))).observe({type:'longtask',buffered:true});
    });
    const started = Date.now();
    const navigation = await page.goto(url, {waitUntil:'domcontentloaded'});
    if (!navigation?.ok()) throw new Error(`Production document returned ${navigation?.status() ?? 'no response'}`);
    if (await page.locator('script[src*="/@vite/client"]').count()) throw new Error('Use the built production preview');
    await page.waitForFunction(() => {
      const input = document.querySelector<HTMLInputElement>('#connection-search');
      return input && !input.disabled && document.querySelector('.identity-node')?.textContent?.includes('MSFT');
    });
    const readyMs = Date.now() - started;
    if (disableCatalogBlur) await page.addStyleTag({content:'.catalog-overlay{backdrop-filter:none!important}'});
    await page.getByRole('button',{name:/Explore data/}).click();
    await page.getByRole('searchbox',{name:'Search data views'}).fill('water');
    await page.waitForFunction(() => document.querySelectorAll('.catalog-card').length === 2);
    await page.getByRole('button',{name:'Clear data search',exact:true}).click();
    await page.getByRole('button',{name:'Money & ownership',exact:true}).click();
    await page.waitForFunction(() => document.querySelectorAll('.catalog-card').length === 4);
    await page.getByRole('button',{name:'Close data explorer',exact:true}).click();
    if (phone) await page.getByRole('button',{name:'Expand evidence panel',exact:true}).click();
    for (const ticker of ['JPM', 'MSFT', 'GOOGL']) {
      await page.locator('.company-picker button').filter({hasText:ticker}).click();
      await page.waitForFunction((value) => document.querySelector('.identity-node')?.textContent?.includes(value), ticker);
    }
    await page.getByLabel('Find a company').fill('MSFT');
    await page.getByRole('button',{name:'Search ↗',exact:true}).click();
    await page.waitForFunction(() => document.querySelectorAll('.company-picker button').length === 1);
    await page.locator('.provenance summary').click();
    await page.waitForTimeout(1200);
    const timing = await page.evaluate(() => ({...(window as any).__connectionsTiming, overflow:document.documentElement.scrollWidth > innerWidth + 1}));
    samples.push({phone,run,readyMs,...timing,errors,maxInteractionMs:Math.max(0,...timing.events)});
    console.log(JSON.stringify({stage:'measured',phone,run,readyMs,maxInteractionMs:Math.max(0,...timing.events),errors}));
    await context.close();
  }
} catch (error) {
  failure = String(error);
  failureEvidence = activePage && !activePage.isClosed() ? await activePage.evaluate(() => ({
    url: location.href,
    input: document.querySelector('#connection-search')?.outerHTML,
    identity: document.querySelector('.identity-node')?.textContent,
    text: document.body.innerText.slice(0, 2000),
  })).catch(String) : null;
}
finally { await browser.close(); }
const report = {at:new Date().toISOString(),url,profile:'3 desktop + 3 emulated phone; phone 4x CPU, 1.6 Mbps, 80 ms; motion enabled; software WebGL; catalog open/search/topic filtering included',disableCatalogBlur,current,failure,failureEvidence,loadErrors,samples};
const directory = '.local/connections/performance';
await writeAtomic(join(directory, report.at.replaceAll(':','-')+'.json'),report);
await writeAtomic(join(directory,'latest.json'),report);
console.log(JSON.stringify({at:report.at,failure,failureEvidence,loadErrors,samples:samples.map(({phone,run,readyMs,maxInteractionMs,overflow,errors})=>({phone,run,readyMs,maxInteractionMs,overflow,errors}))},null,2));
if (failure || loadErrors.length || samples.length !== 6 || samples.some((s) => s.errors.length || s.overflow || s.maxInteractionMs >= 200)) process.exitCode = 1;
