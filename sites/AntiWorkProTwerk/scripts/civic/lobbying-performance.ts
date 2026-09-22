import { chromium } from '@playwright/test';
import { writeAtomic } from '../said-did/pipeline';
import { parseArgs } from 'node:util';

// Run only against the root production preview, not Vite's development server.
const { values } = parseArgs({
  options: {
    careers: { type: 'boolean', default: false },
    bills: { type: 'boolean', default: false },
    nursing: { type: 'boolean', default: false },
    enforcement: { type: 'boolean', default: false },
    water: { type: 'boolean', default: false },
    insiders: { type: 'boolean', default: false },
    holdings: { type: 'boolean', default: false },
    shared: { type: 'boolean', default: false },
    stakes: { type: 'boolean', default: false },
  },
});
if (
  [
    values.careers,
    values.bills,
    values.nursing,
    values.enforcement,
    values.water,
    values.insiders,
    values.holdings,
    values.shared,
    values.stakes,
  ].filter(Boolean).length > 1
)
  throw new Error('Choose one product profile');
const product = values.stakes
  ? 'major-stakes'
  : values.shared
    ? 'shared-investors'
    : values.holdings
      ? 'holdings'
      : values.insiders
        ? 'insiders'
        : values.water
          ? 'water'
          : values.enforcement
            ? 'enforcement'
            : values.nursing
              ? 'nursing'
              : values.bills
                ? 'graveyard'
                : values.careers
                  ? 'revolving'
                  : 'lobbying';
const url = `http://127.0.0.1:4173/AntiWorkProTwerk/records/${product}/`;
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const samples: unknown[] = [];
try {
  for (const phone of [false, true])
    for (let run = 1; run <= 3; run++) {
      const context = await browser.newContext({
        viewport: phone ? { width: 390, height: 844 } : { width: 1672, height: 941 },
        reducedMotion: 'reduce',
      });
      const page = await context.newPage(),
        cdp = await context.newCDPSession(page),
        errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      if (phone) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: 80,
          downloadThroughput: 200000,
          uploadThroughput: 100000,
        });
      }
      await page.addInitScript(() => {
        const state = ((window as any).__agendaTiming = {
          lcp: 0,
          events: [] as number[],
          longTasks: [] as number[],
        });
        new PerformanceObserver((list) => {
          state.longTasks.push(...list.getEntries().map((e) => e.duration));
        }).observe({ type: 'longtask', buffered: true });
        new PerformanceObserver((list) => {
          state.lcp = list.getEntries().at(-1)?.startTime ?? 0;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) => {
          state.events.push(
            ...list
              .getEntries()
              .filter((e) => (e as any).interactionId)
              .map((e) => e.duration),
          );
        }).observe({ type: 'event', durationThreshold: 16, buffered: true });
      });
      const started = Date.now();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      if (await page.locator('script[src*="/@vite/client"]').count())
        throw new Error('Production build required');
      await page.waitForFunction(
        (selector) => {
          const button = document.querySelector(selector) as HTMLButtonElement | null;
          return button && !button.disabled;
        },
        values.stakes
          ? '.stake-card'
          : values.shared
            ? 'select[aria-label="Peer group"]'
            : values.holdings
              ? '.position-card'
              : values.insiders
                ? '.insider-card'
                : values.water
                  ? '.water-card'
                  : values.enforcement
                    ? '.echo-card'
                    : values.nursing
                      ? '.facility-card'
                      : values.bills
                        ? '.bill-card'
                        : values.careers
                          ? '.career-card'
                          : '.agenda-quarter',
      );
      const readyMs = Date.now() - started;
      let largeManagerReadyMs: number | null = null;
      if (phone) await page.getByRole('button', { name: 'Expand evidence panel' }).click();
      if (values.stakes) {
        await page.getByLabel('Stake company', { exact: true }).selectOption('0001981792');
        await page
          .locator('.stake-card')
          .filter({ hasText: 'Pershing Square Capital Management' })
          .click();
        await page.locator('.statement').waitFor();
        await page.locator('.timeline button').filter({ hasText: 'Filed 2026-04-29' }).click();
        await page.locator('.not-restated').waitFor();
        await page.getByRole('button', { name: /Read the earlier disclosed text/ }).click();
        await page.locator('.statement').waitFor();
        await page.locator('.source-fields>summary').click();
        await page.getByRole('button', { name: 'Close disclosure history', exact: true }).click();
        await page.getByLabel('Stake company', { exact: true }).selectOption('0002042347');
        await page.getByLabel('Schedule type', { exact: true }).selectOption('13D');
        await page.locator('.stake-card').first().click();
        await page.locator('.statement').waitFor();
      } else if (values.shared) {
        await page.locator('.peer-card').first().locator('summary').click();
        await page
          .locator('.manager-card')
          .first()
          .locator('.matrix-row')
          .first()
          .getByRole('button')
          .first()
          .click();
        await page.locator('.source-evidence .raw-row').first().waitFor();
        await page.locator('.source-evidence .raw-row').first().locator('summary').click();
        await page.getByRole('button', { name: 'Close evidence', exact: true }).click();
        await page.getByLabel('Peer group', { exact: true }).selectOption('commercial-banks');
        await page.getByLabel('Find a company', { exact: true }).fill('WFC');
        await page.locator('.company-picker button').click();
        await page
          .locator('.manager-card')
          .filter({ has: page.getByRole('heading', { name: /^JPMORGAN/ }) })
          .locator('.matrix-row')
          .last()
          .getByRole('button')
          .last()
          .click();
        await page.locator('.source-evidence .raw-row').first().waitFor();
        if (!(await page.locator('.company-heading').innerText()).includes('Wells Fargo'))
          throw new Error('Wrong selected company');
      } else if (values.holdings) {
        await page
          .locator('.change-filters')
          .getByRole('button', { name: /^Quantity increased/ })
          .click();
        await page.locator('.position-card').first().click();
        await page.locator('.position-evidence .raw-row').first().waitFor();
        await page.locator('.position-evidence .raw-row summary').first().click();
        await page.getByRole('button', { name: 'Close position ×', exact: true }).click();
        // Include the largest collected manager, not only the small default portfolio.
        const largeStarted = Date.now();
        await page.getByLabel('Reporting manager', { exact: true }).selectOption('0000019617');
        await page.locator('.position-card').first().waitFor({ timeout: 120000 });
        largeManagerReadyMs = Date.now() - largeStarted;
        await page.getByLabel('Find an issuer or CUSIP', { exact: true }).fill('APPLE');
        await page.getByRole('button', { name: 'Search holdings', exact: true }).click();
        await page.locator('.position-card').first().waitFor();
        await page.getByLabel('Reporting manager', { exact: true }).selectOption('0001336528');
        await page.locator('.comparison-unavailable').waitFor();
        if (!(await page.locator('.snapshot-cards').innerText()).includes('Reported elsewhere'))
          throw new Error('Missing notice distinction');
      } else if (values.insiders) {
        await page
          .getByLabel('Find an issuer, reporting person, CIK or accession')
          .fill('0001140361-26-025620');
        await page.getByRole('button', { name: 'Search insider records', exact: true }).click();
        await page.locator('.insider-card').click();
        await page.locator('.insider-entries>li').first().waitFor();
        await page.getByRole('button', { name: 'Tax / exercise payment', exact: true }).click();
        await page.locator('.source-toggle').first().click();
        await page.locator('.raw-row').waitFor();
        if (
          !(await page.locator('.insider-entries').innerText()).includes(
            'Do not relabel this as an open-market sale',
          )
        )
          throw new Error('Missing tax-withholding distinction');
        await page.getByRole('button', { name: 'Close filing ×', exact: true }).click();
        await page.getByRole('button', { name: 'Clear insider filters', exact: true }).click();
      } else if (values.water) {
        await page.getByLabel('Find a water system, county or PWS ID').fill('TX1012680');
        await page.getByRole('button', { name: 'Search water records', exact: true }).click();
        await page.locator('.water-card').click();
        await page.locator('.water-timeline>li').first().waitFor();
        await page.getByLabel('Water record category', { exact: true }).selectOption('monitoring');
        await page.locator('.source-toggle').click();
        await page.locator('.raw-rows').waitFor();
        if (
          !(await page.locator('.record-caution').innerText()).includes(
            'does not mean that contaminant was detected',
          )
        )
          throw new Error('Missing monitoring distinction');
        await page.getByRole('button', { name: 'Clear history filters', exact: true }).click();
      } else if (values.enforcement) {
        await page.getByLabel('Find a facility, city or program ID').fill('Equistar');
        await page.getByRole('button', { name: 'Search facilities', exact: true }).click();
        await page.locator('.echo-card').click();
        await page.locator('.quarter').first().waitFor();
        await page.getByLabel('Environmental program', { exact: true }).selectOption('CWA');
        await page
          .getByRole('button', { name: /^CWA TX0119792, / })
          .first()
          .click();
        await page.locator('.quarter.chosen').waitFor();
        if (!(await page.locator('.notice').innerText()).includes('do not sum'))
          throw new Error('Missing penalty aggregation caution');
        await page.getByRole('button', { name: 'Clear response window', exact: true }).click();
        await page.getByLabel('Response entry type', { exact: true }).selectOption('formal');
        await page.locator('.event-list .penalty').first().waitFor();
      } else if (values.nursing) {
        await page
          .locator('.owner-options button')
          .filter({ hasText: 'PACS HOLDINGS, LLC' })
          .click();
        await page.locator('.portfolio').waitFor();
        await page.getByLabel('Connect this party’s mapped facilities', { exact: true }).check();
        await page.locator('.facility-card').first().click();
        await page.locator('.associations article').first().waitFor();
        if (
          !(await page.locator('.facility-detail').innerText()).includes('not an acquisition date')
        )
          throw new Error('Missing ownership time caution');
        await page.getByRole('button', { name: 'Close facility ×' }).click();
        await page.getByLabel('Disclosed relationship', { exact: true }).selectOption('management');
        await page.locator('.notice[role=status]').waitFor();
      } else if (values.bills) {
        await page.getByLabel('Bill Congress', { exact: true }).selectOption('119');
        await page.getByLabel('Bill policy area', { exact: true }).selectOption('Immigration');
        await page.locator('.bill-card').filter({ hasText: 'H.R. 29' }).click();
        await page.getByRole('button', { name: 'Follow collected bill →' }).click();
        await page.waitForFunction(() =>
          document
            .querySelector('.last-action')
            ?.textContent?.includes('Became Public Law No: 119-1'),
        );
        await page.locator('.amendments summary').click();
        if (
          !(await page.locator('.amendments').innerText()).includes(
            'Submitted amendments are not necessarily offered',
          )
        )
          throw new Error('Missing amendment scope warning');
      } else if (values.careers) {
        await page
          .getByLabel('Search a name, disclosed position or client', { exact: true })
          .fill('Rachel');
        await page.locator('.career-card').filter({ hasText: 'RACHEL APPLETON' }).click();
        await page.locator('.career-detail').waitFor();
        await page.locator('.career-timeline button').last().click();
        await page.waitForFunction(() =>
          document
            .querySelector('.career-report')
            ?.textContent?.includes('Covered-position field is blank'),
        );
        if (
          !(await page.locator('.career-position').innerText()).includes(
            'Legislative Counsel, Rep. Derek Kilmer',
          )
        )
          throw new Error('Earlier career disclosure was lost');
      } else {
        await page.getByLabel('Disclosed issue area', { exact: true }).selectOption('ENG');
        await page
          .getByRole('button', { name: 'Open 2025 / Q2 filing for ANTHROPIC', exact: true })
          .click();
        await page.locator('.agenda-detail').waitFor();
        if (!(await page.locator('.agenda-detail').innerText()).includes('$920,000.00'))
          throw new Error('Wrong amended evidence');
        await page
          .locator('.agenda-versions button')
          .filter({ hasText: '2nd Quarter - Report' })
          .click();
        if (!(await page.locator('.agenda-detail').innerText()).includes('$910,000.00'))
          await page.waitForFunction(() =>
            document.querySelector('.agenda-detail')?.textContent?.includes('$910,000.00'),
          );
      }
      await page.waitForTimeout(300); // Allow Event Timing observer delivery, not an application delay.
      const sample = await page.evaluate(() => ({
        ...(window as any).__agendaTiming,
        htmlBytes: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)
          .encodedBodySize,
        domNodes: document.querySelectorAll('*').length,
        positionResources: performance
          .getEntriesByType('resource')
          .filter((e) => e.name.includes('/holdings/') && e.name.includes('/positions/'))
          .map((e) => ({
            url: e.name,
            ms: e.duration,
            encodedBytes: (e as PerformanceResourceTiming).encodedBodySize,
          })),
      }));
      if (errors.length) throw new Error(errors.join('; '));
      const result = {
        phone,
        run,
        readyMs,
        ...(values.holdings ? { largeManagerReadyMs } : {}),
        ...sample,
        maximumEventMs: Math.max(0, ...sample.events),
        errors,
      };
      samples.push(result);
      console.log(JSON.stringify(result));
      await context.close();
    }
} finally {
  await browser.close();
}
const report = {
  formatVersion: 1,
  at: new Date().toISOString(),
  url,
  profile: {
    phoneCpu: 4,
    phoneNetwork: '1.6 Mbps download / 80 ms latency',
    desktopNetwork: 'unthrottled localhost',
    reducedMotion: true,
    softwareWebGL: true,
    physicalDevice: false,
    fieldINP: false,
  },
  samples,
};
await writeAtomic(`.local/${product}/performance/${report.at.replaceAll(':', '-')}.json`, report);
await writeAtomic(`.local/${product}/performance/latest.json`, report);
