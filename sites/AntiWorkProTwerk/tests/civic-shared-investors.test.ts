import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from '../scripts/said-did/engine';
import {
  buildHoldings,
  holdingsColumns,
  holdingsTables,
  type HoldingsInput,
  type HoldingsTable,
} from '../scripts/civic/holdings';
import { capturedInsiderRow } from '../scripts/civic/insiders';
import {
  buildSharedInvestors,
  runSharedInvestors,
  sharedFilingUrl,
  type SharedInput,
} from '../scripts/civic/shared-investors';
import {
  sharedCatalogSchema,
  sharedCell,
  sharedOverlap,
  sharedStateCounts,
} from '../src/lib/civic/shared-investors';
import {
  loadSharedInvestors,
  readSharedEvidence,
} from '../src/lib/civic/shared-investors-repository';
import { acquireSecFile } from '../scripts/civic/sec-source';
import type { HoldingPosition, HoldingSnapshot } from '../src/lib/civic/holdings';

const companyA = '0000000001',
  companyB = '0000000002',
  managerA = '0000000011',
  managerB = '0000000012',
  before = '2026-03-31',
  after = '2026-06-30';
function fixture(): SharedInput {
  const catalog = sharedCatalogSchema.parse({
    id: 'synthetic',
    version: 'v1',
    title: 'Synthetic test',
    selection: 'Fictional fixtures only',
    reviewedAt: '2026-09-16',
    companies: [companyA, companyB].map((cik, i) => ({
      cik,
      label: `Test company ${i}`,
      ticker: `T${i}`,
      securities: [
        {
          cusip: i ? '222222222' : '111111111',
          label: 'Common',
          from: before,
          through: after,
          identityUrl: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/000123456726000001/primary_doc.xml`,
        },
      ],
    })),
    groups: [
      {
        id: 'test-banks',
        label: 'Synthetic banks',
        kind: 'sic',
        companies: [companyA, companyB],
        definition: 'Test grouping only',
        sourceUrl: null,
        excerpt: null,
        locator: 'sic',
        sicCodes: ['6021'],
      },
    ],
  });
  const selected = Object.fromEntries(
    holdingsTables.map((t) => [t, []]),
  ) as unknown as HoldingsInput['archives'][number]['selected'];
  const source = {
    url: 'https://www.sec.gov/files/structureddata/data/form-13f-data-sets/01jun2026-31aug2026_form13f.zip',
    hash: 'a'.repeat(64),
    bytes: 100,
    observedAt: '2026-09-16T00:00:00.000Z',
    lastModified: null,
  };
  function row(table: HoldingsTable, fields: Record<string, string>) {
    selected[table].push(
      capturedInsiderRow(
        Object.fromEntries(holdingsColumns[table].map((k) => [k, fields[k] ?? ''])),
        selected[table].length + 1,
      ),
    );
  }
  let n = 0;
  for (const manager of [managerA, managerB])
    for (const period of [before, after]) {
      const accession = `0001234567-26-${String(++n).padStart(6, '0')}`,
        notice = manager === managerB && period === after;
      row('SUBMISSION', {
        ACCESSION_NUMBER: accession,
        FILING_DATE: period === before ? '15-MAY-2026' : '15-AUG-2026',
        SUBMISSIONTYPE: notice ? '13F-NT' : '13F-HR',
        CIK: manager,
        PERIODOFREPORT: period === before ? '31-MAR-2026' : '30-JUN-2026',
      });
      row('COVERPAGE', {
        ACCESSION_NUMBER: accession,
        REPORTCALENDARORQUARTER: period === before ? '31-MAR-2026' : '30-JUN-2026',
        ISAMENDMENT: 'N',
        FILINGMANAGER_NAME: `Synthetic manager ${manager}`,
        FILINGMANAGER_STATEORCOUNTRY: 'NY',
        REPORTTYPE: notice ? '13F NOTICE' : '13F HOLDINGS REPORT',
      });
      if (!notice) {
        row('SUMMARYPAGE', {
          ACCESSION_NUMBER: accession,
          TABLEENTRYTOTAL: '2',
          TABLEVALUETOTAL: '2000',
          ISCONFIDENTIALOMITTED: 'N',
        });
        for (const cusip of ['111111111', '222222222'])
          row('INFOTABLE', {
            ACCESSION_NUMBER: accession,
            INFOTABLE_SK: String(selected.INFOTABLE.length + 1),
            NAMEOFISSUER: 'Synthetic issuer',
            TITLEOFCLASS: 'Common',
            CUSIP: cusip,
            VALUE: '1000',
            SSHPRNAMT: '10',
            SSHPRNAMTTYPE: 'SH',
            INVESTMENTDISCRETION: 'SOLE',
            VOTING_AUTH_SOLE: '10',
            VOTING_AUTH_SHARED: '0',
            VOTING_AUTH_NONE: '0',
          });
      }
    }
  const tables = holdingsTables.map((t) => ({
    member: `${t}.tsv`,
    rows: selected[t].length,
    selected: selected[t].length,
    headers: [...holdingsColumns[t]],
  }));
  const h = buildHoldings({
    formatVersion: 1,
    plan: {
      id: 'synthetic',
      title: 'Synthetic holdings',
      selection: 'Test only',
      managers: [managerA, managerB],
      archives: [{ id: '01jun2026-31aug2026', url: source.url }],
      maxFilings: 10,
      maxRows: 100,
    },
    archives: [{ id: '01jun2026-31aug2026', source, tables, selected }],
  });
  const manifest = {
    formatVersion: 1,
    release: `hf-${hash(h.data).slice(0, 24)}`,
    dataHash: hash(h.data),
    publishedAt: source.observedAt,
    files: Object.fromEntries(Object.entries(h.attachments).map(([k, v]) => [k, hash(v)])),
  };
  const captures: SharedInput['captures'] = [];
  function capture(key: string, url: string, body: string) {
    captures.push({
      key,
      body,
      source: {
        ...source,
        url,
        hash: createHash('sha256').update(body).digest('hex'),
        bytes: Buffer.byteLength(body),
      },
    });
  }
  for (const c of catalog.companies) {
    capture(
      'issuer-' + c.cik,
      `https://data.sec.gov/submissions/CIK${c.cik}.json`,
      JSON.stringify({
        cik: Number(c.cik),
        name: c.label,
        sic: '6021',
        sicDescription: 'National Commercial Banks',
        addresses: { business: { stateOrCountry: 'NY', street1: 'PRIVATE STREET MUST NOT SHIP' } },
      }),
    );
    for (const s of c.securities)
      capture(
        'identity-' + s.cusip,
        s.identityUrl,
        `<edgarSubmission><headerData><submissionType>SCHEDULE 13G</submissionType></headerData><formData><coverPageHeader><eventDateRequiresFilingThisStatement>03/31/2026</eventDateRequiresFilingThisStatement><securitiesClassTitle>Common Stock</securitiesClassTitle><issuerInfo><issuerCik>${c.cik}</issuerCik><issuerName>${c.label}</issuerName><issuerCusips><issuerCusipNumber>${s.cusip}</issuerCusipNumber></issuerCusips></issuerInfo></coverPageHeader></formData></edgarSubmission>`,
      );
  }
  return {
    formatVersion: 1,
    catalog,
    captures,
    holdings: { manifest, data: h.data, artifacts: h.attachments },
  };
}
function recapture(c: SharedInput['captures'][number]) {
  c.source.hash = createHash('sha256').update(c.body).digest('hex');
  c.source.bytes = Buffer.byteLength(c.body);
}
test('shared investors keep a balanced reporting cohort; notices are not exits; amounts and exact rows agree', async () => {
  const { data, attachments } = await buildSharedInvestors(fixture());
  assert.equal(data.cells.length, 8);
  assert.equal(
    data.cells.find((c) => c.manager === managerB && c.period === after)?.status,
    'unavailable',
  );
  const overlap = sharedOverlap(data, companyA, companyB, before, after);
  assert.deepEqual(overlap.cohort, [managerA]);
  assert.deepEqual(overlap.before, [managerA]);
  assert.deepEqual(overlap.after, [managerA]);
  assert.equal(overlap.observedBefore.length, 2);
  assert.equal(overlap.observedAfter.length, 1);
  assert.deepEqual(sharedStateCounts(data, 'test-banks'), { NY: 2 });
  assert.deepEqual(sharedStateCounts(data, 'unknown-group'), {});
  assert.equal(data.cells[0].value, '1000');
  assert(!JSON.stringify({ data, attachments }).includes('PRIVATE STREET'));
  assert.equal(hash((await buildSharedInvestors(fixture(), data)).data), hash(data));
  assert.throws(() => sharedOverlap(data, companyA, companyB, after, before));
});
test('mapping intervals, options, units, zero quantities and absence have distinct semantics', () => {
  const company = fixture().catalog.companies[0],
    snapshot = {
      id: managerA + '-' + before,
      cik: managerA,
      period: before,
      status: 'reported',
      issues: [],
      cautions: [],
    } as unknown as HoldingSnapshot;
  const p = {
    key: '111111111|SH|',
    cusip: '111111111',
    unit: 'SH',
    option: '',
    quantity: '900719925474099312345',
    value: '900719925474099312346',
    names: [],
    classes: [],
    refs: [],
  } as HoldingPosition;
  assert.equal(sharedCell(company, managerA, before, snapshot, [p]).value, p.value);
  assert.equal(
    sharedCell(company, managerA, before, snapshot, [{ ...p, option: 'Call' }]).status,
    'not-listed',
  );
  assert.equal(
    sharedCell(company, managerA, before, snapshot, [{ ...p, unit: 'PRN' }]).status,
    'not-listed',
  );
  assert.equal(
    sharedCell(company, managerA, before, snapshot, [{ ...p, quantity: '0', value: '0' }]).status,
    'zero-reported',
  );
  assert.equal(sharedCell(company, managerA, before, snapshot, []).value, null);
  assert.equal(sharedCell(company, managerA, before, undefined, []).status, 'unavailable');
  assert.equal(sharedCell(company, managerA, '2026-09-30', snapshot, [p]).status, 'unavailable');
  assert.equal(
    sharedCell(company, managerA, before, snapshot, [{ ...p, quantity: '-1' }]).status,
    'unavailable',
  );
  const duplicate = fixture().catalog;
  duplicate.companies[1].securities[0].cusip = '111111111';
  assert.throws(() => sharedCatalogSchema.parse(duplicate));
});
test('metadata hashes, issuer CIK, CUSIP and classifications fail closed; exact official paths only', async () => {
  const raw = fixture();
  raw.captures[0].body += ' ';
  await assert.rejects(buildSharedInvestors(raw), /integrity/);
  const wrongCik = fixture();
  wrongCik.captures[1].body = wrongCik.captures[1].body.replace(
    `<issuerCik>${companyA}</issuerCik>`,
    `<issuerCik>${companyB}</issuerCik>`,
  );
  recapture(wrongCik.captures[1]);
  await assert.rejects(buildSharedInvestors(wrongCik), /identity mismatch/);
  const wrongCusip = fixture();
  wrongCusip.captures[1].body = wrongCusip.captures[1].body.replace('111111111', '999999999');
  recapture(wrongCusip.captures[1]);
  await assert.rejects(buildSharedInvestors(wrongCusip), /identity mismatch/);
  const sic = fixture();
  sic.captures[0].body = sic.captures[0].body.replace('6021', '7372');
  recapture(sic.captures[0]);
  await assert.rejects(buildSharedInvestors(sic), /SIC/);
  assert.throws(() => sharedFilingUrl('https://example.com/primary_doc.xml', 'xml'));
  assert.throws(() =>
    sharedFilingUrl(
      fixture().catalog.companies[0].securities[0].identityUrl + '?x=1',
      'xml',
      companyA,
    ),
  );
  assert.throws(() =>
    sharedFilingUrl(fixture().catalog.companies[0].securities[0].identityUrl, 'xml', companyB),
  );
});
test('curated peer evidence must be present in captured filing; source material stays private', async () => {
  const raw = fixture(),
    g = raw.catalog.groups[0];
  g.kind = 'curated';
  g.sicCodes = [];
  g.sourceUrl = 'https://www.sec.gov/Archives/edgar/data/1/000123456726000001/test.htm';
  g.excerpt = 'Cloud providers include Test A and Test B';
  const c = {
    ...structuredClone(raw.captures[0]),
    key: 'group-' + g.id,
    body: '<html><body>Cloud providers include <b>Test A</b> and Test B</body></html>',
  };
  c.source.url = g.sourceUrl;
  recapture(c);
  raw.captures.push(c);
  const good = await buildSharedInvestors(raw);
  assert(good.data.groups[0].source);
  assert(!JSON.stringify(good.data).includes('<html>'));
  g.excerpt = 'An unsupported classification';
  await assert.rejects(buildSharedInvestors(raw), /excerpt missing/);
});
test('portable replay publishes immutable evidence; stale input, shrinking coverage and silent catalog changes are rejected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shared-investors-')),
    raw = fixture(),
    options = {
      input: raw,
      holdings: 'unused',
      workspace: join(dir, 'job'),
      output: join(dir, 'public'),
    };
  const first = await runSharedInvestors(options),
    second = await runSharedInvestors(options);
  assert.equal(first.release, second.release);
  const prior = JSON.parse(
    await readFile(join(options.output, 'releases', first.release, 'data.json'), 'utf8'),
  );
  const changed = fixture();
  changed.catalog.title = 'New title';
  await assert.rejects(buildSharedInvestors(changed, prior), /new explicit version/);
  const older = { ...prior, observedAt: '2026-09-17T00:00:00.000Z' };
  await assert.rejects(buildSharedInvestors(raw, older), /Stale/);
  const lost = { ...prior, periods: [...prior.periods, '2025-12-31'] };
  await assert.rejects(buildSharedInvestors(raw, lost), /scope disappeared/);
  const fetcher = (async (url) => {
    try {
      return Response.json(
        JSON.parse(
          await readFile(
            join(options.output, String(url).replace('/data/shared-investors/', '')),
            'utf8',
          ),
        ),
      );
    } catch {
      return new Response('', { status: 404 });
    }
  }) as typeof fetch;
  const bundle = await loadSharedInvestors(fetcher),
    e = await readSharedEvidence(fetcher, bundle, bundle.data.cells[0].id);
  assert.equal(e.rows.length, 1);
  assert.equal(e.rows[0].row.fields.SSHPRNAMT, '10');
  await assert.rejects(readSharedEvidence(fetcher, bundle, 'not-in-collection'), /outside/);
  const bad = (async (url, options) => {
    const r = await fetcher(url, options);
    if (String(url).includes('/evidence/')) {
      const raw = await r.json();
      raw.cell.company = companyB;
      return Response.json(raw);
    }
    return r;
  }) as typeof fetch;
  await assert.rejects(readSharedEvidence(bad, bundle, bundle.data.cells[0].id), /integrity/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    readSharedEvidence(fetcher, bundle, bundle.data.cells[0].id, '', controller.signal),
  );
});
test('rehashed upstream projections still reject private fields and amounts that disagree with source rows', async () => {
  const privateInput = fixture();
  const file = Object.keys(privateInput.holdings.artifacts).find((k) => k.startsWith('filings/'))!;
  const detail = privateInput.holdings.artifacts[file] as any;
  detail.cover.fields.STREET1 = 'Do not publish';
  detail.cover.hash = hash(detail.cover.fields);
  (privateInput.holdings.manifest as any).files[file] = hash(detail);
  await assert.rejects(buildSharedInvestors(privateInput), /privacy whitelist/);
  const amountInput = fixture(),
    holdings = amountInput.holdings.data as any,
    manifest = amountInput.holdings.manifest as any;
  const snapshot = holdings.snapshots.find((s: any) => s.status === 'reported'),
    path = `positions/${snapshot.id}.json`,
    positions = amountInput.holdings.artifacts[path] as any;
  positions.rows[0][6] = '900719925474099312346';
  snapshot.positionsHash = hash(positions);
  manifest.files[path] = snapshot.positionsHash;
  manifest.dataHash = hash(holdings);
  manifest.release = `hf-${manifest.dataHash.slice(0, 24)}`;
  await assert.rejects(buildSharedInvestors(amountInput), /reconcile/);
});

test('a fresh unrelated capture cannot mask stale or same-time altered company metadata', async () => {
  const original = fixture(),
    prior = (await buildSharedInvestors(original)).data;
  const stale = fixture();
  stale.captures[0].source.observedAt = '2026-09-15T00:00:00.000Z';
  stale.captures[2].source.observedAt = '2026-09-17T00:00:00.000Z';
  await assert.rejects(buildSharedInvestors(stale, prior), /metadata source capture/);
  const changed = fixture();
  changed.captures[0].body = changed.captures[0].body.replace('Test company 0', 'Changed name');
  recapture(changed.captures[0]);
  changed.captures[2].source.observedAt = '2026-09-17T00:00:00.000Z';
  await assert.rejects(buildSharedInvestors(changed, prior), /metadata source capture/);
});

test('extended SEC transport preserves XML bytes and offline integrity, and rejects HTML masquerading as XML', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shared-sec-')),
    request = {
      url: 'https://www.sec.gov/Archives/edgar/data/1/000123456726000001/primary_doc.xml',
      key: 'identity-test',
      extension: 'xml' as const,
      cap: 1000,
    };
  const fetcher = (async () =>
    new Response('<issuer>Test</issuer>', {
      headers: { 'content-type': 'text/xml' },
    })) as typeof fetch;
  const first = await acquireSecFile(dir, request, false, fetcher),
    second = await acquireSecFile(dir, request, true);
  assert.equal(first.source.hash, second.source.hash);
  await assert.rejects(
    acquireSecFile(
      dir,
      { ...request, key: 'bad' },
      false,
      (async () =>
        new Response('<html>Blocked</html>', {
          headers: { 'content-type': 'text/html' },
        })) as typeof fetch,
    ),
    /type rejected/,
  );
});
