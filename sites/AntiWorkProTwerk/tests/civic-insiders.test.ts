import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from '../scripts/said-did/engine';
import {
  buildInsiders,
  acquireInsiders,
  capturedInsiderRow,
  insiderTables,
  insiderBoolean,
  insiderDate,
  insiderOwnerFields,
  runInsiders,
  type InsiderInput,
} from '../scripts/civic/insiders';
import {
  insiderArchiveUrl,
  insiderIssuerUrl,
  acquireInsiderFile,
} from '../scripts/civic/insider-source';
import { explainInsiderCode, filterInsiders, insiderStateCounts } from '../src/lib/civic/insiders';
import { loadInsiders, createInsiderReader } from '../src/lib/civic/insiders-repository';
import { zipFixture } from './helpers/zip';
const at = '2026-09-16T00:00:00.000Z',
  id = '0000320193',
  accession = '0001234567-26-000001',
  quarter = '2026q2';
const url =
  'https://www.sec.gov/files/datastandardsinnovation/data/insider-transactions-data-sets/2026q2_form345.zip';
const source = (url: string) => ({
  url,
  hash: 'a'.repeat(64),
  bytes: 100,
  observedAt: at,
  lastModified: null,
});
function fixture(): InsiderInput {
  const fields = {
    SUBMISSION: [
      {
        ACCESSION_NUMBER: accession,
        FILING_DATE: '01-JUN-2026',
        PERIOD_OF_REPORT: '30-MAY-2026',
        DATE_OF_ORIG_SUB: '',
        DOCUMENT_TYPE: '4',
        ISSUERCIK: id,
        ISSUERNAME: 'Fixture Issuer',
        ISSUERTRADINGSYMBOL: 'TEST',
        REMARKS: 'Exact remarks',
        AFF10B5ONE: 'true',
      },
    ],
    REPORTINGOWNER: [
      {
        ACCESSION_NUMBER: accession,
        RPTOWNERCIK: '0001234567',
        RPTOWNERNAME: 'Fixture Owner',
        RPTOWNER_RELATIONSHIP: 'Officer',
        RPTOWNER_TITLE: 'Test officer',
        RPTOWNER_TXT: '',
      },
    ],
    NONDERIV_TRANS: [
      {
        ACCESSION_NUMBER: accession,
        NONDERIV_TRANS_SK: '9007199254740993',
        SECURITY_TITLE: 'Common Stock',
        TRANS_CODE: 'F',
        TRANS_DATE: '30-MAY-2026',
        TRANS_SHARES: '9007199254740993.50',
        TRANS_PRICEPERSHARE: '0.0',
        TRANS_PRICEPERSHARE_FN: 'F1, F2',
        TRANS_ACQUIRED_DISP_CD: 'D',
      },
    ],
    DERIV_TRANS: [
      {
        ACCESSION_NUMBER: accession,
        DERIV_TRANS_SK: '1',
        SECURITY_TITLE: 'Option',
        TRANS_CODE: 'M',
        TRANS_DATE: '30-MAY-2026',
        TRANS_SHARES: '',
        TRANS_PRICEPERSHARE: '',
        TRANS_ACQUIRED_DISP_CD: 'D',
      },
    ],
    NONDERIV_HOLDING: [
      {
        ACCESSION_NUMBER: accession,
        NONDERIV_HOLDING_SK: '1',
        SECURITY_TITLE: 'Common Stock',
        SHRS_OWND_FOLWNG_TRANS: '100.00',
      },
    ],
    DERIV_HOLDING: [
      {
        ACCESSION_NUMBER: accession,
        DERIV_HOLDING_SK: '1',
        SECURITY_TITLE: 'Option',
        SHRS_OWND_FOLWNG_TRANS: '',
      },
    ],
    FOOTNOTES: [
      {
        ACCESSION_NUMBER: accession,
        FOOTNOTE_ID: 'F1',
        FOOTNOTE_TXT: 'Shares withheld; a literal "quote" stays intact.',
      },
    ],
  };
  const selected = Object.fromEntries(
    insiderTables.map((t) => [t, fields[t].map((r, n) => capturedInsiderRow(r, n + 1))]),
  ) as InsiderInput['archives'][number]['selected'];
  return {
    formatVersion: 1,
    plan: {
      id: 'fixture-insiders',
      title: 'Test only',
      selection: 'Fictional test',
      issuers: [id],
      quarters: [{ quarter, url }],
      maxFilings: 100,
    },
    archives: [
      {
        quarter,
        source: source(url),
        tables: insiderTables.map((t) => ({
          member: `${t}.tsv`,
          rows: selected[t].length,
          selected: selected[t].length,
          headers: Object.keys(selected[t][0].fields),
        })),
        selected,
      },
    ],
    issuers: [
      {
        cik: id,
        name: 'Fixture Issuer',
        tickers: ['TEST'],
        city: 'Test City',
        state: 'CA',
        stateDescription: 'CA',
        source: source(insiderIssuerUrl(id)),
      },
    ],
  };
}
function edit(
  f: InsiderInput,
  table: (typeof insiderTables)[number],
  fields: Record<string, string>,
) {
  const a = f.archives[0],
    r = a.selected[table][0];
  r.fields = { ...r.fields, ...fields };
  r.hash = hash(r.fields);
  a.tables.find((t) => t.member === `${table}.tsv`)!.headers = Object.keys(r.fields);
}
test('SEC explanations preserve transaction/holding distinctions, exact decimals, co-filers and unresolved footnotes', () => {
  const f = fixture();
  const owner = { ...f.archives[0].selected.REPORTINGOWNER[0].fields, RPTOWNERCIK: '0001234568' };
  f.archives[0].selected.REPORTINGOWNER.push(capturedInsiderRow(owner, 2));
  const receipt = f.archives[0].tables.find((t) => t.member === 'REPORTINGOWNER.tsv')!;
  receipt.rows = 2;
  receipt.selected = 2;
  const { data, details } = buildInsiders(f),
    d = details[0];
  assert.equal(d.filing.owners.length, 2);
  assert.deepEqual(d.filing.transactions, { nonDerivative: 1, derivative: 1 });
  assert.equal(d.entries[0].kind, 'taxExercise');
  assert.equal(d.entries[0].fields.fields.TRANS_PRICEPERSHARE, '0.0');
  assert.equal(d.entries[0].fields.fields.TRANS_SHARES, '9007199254740993.50');
  assert.equal(d.entries[1].fields.fields.TRANS_SHARES, '');
  assert.equal(d.entries[2].kind, null);
  assert.equal(d.entries[2].code, null);
  assert.equal(
    d.entries[0].footnotes[0].text,
    f.archives[0].selected.FOOTNOTES[0].fields.FOOTNOTE_TXT,
  );
  assert.equal(d.entries[0].footnotes[1].text, null);
  assert.equal(explainInsiderCode('A').kind, 'award');
  assert.equal(explainInsiderCode('S').kind, 'sale');
  assert.equal(explainInsiderCode('P').kind, 'purchase');
  assert.equal(explainInsiderCode('Y').kind, 'other');
  assert.equal(filterInsiders(data, new URLSearchParams('kind=sale')).length, 0);
  assert.equal(filterInsiders(data, new URLSearchParams('owner=0001234568&plan=yes')).length, 1);
  assert.deepEqual(insiderStateCounts(data, new URLSearchParams('state=TX')), { CA: 1 });
});
test('SEC dates and checkbox spellings retain unknown versus unchecked; Form 3/5 and amendments are not rebased trades', () => {
  for (const flag of ['true', 'TRUE', '1']) assert.equal(insiderBoolean(flag), true);
  for (const flag of ['false', '0']) assert.equal(insiderBoolean(flag), false);
  assert.equal(insiderBoolean(''), null);
  assert.throws(() => insiderBoolean('yes'), /Unknown/);
  assert.equal(insiderDate('29-FEB-2024'), '2024-02-29');
  assert.throws(() => insiderDate('29-FEB-2025'));
  assert.throws(() => insiderDate('01-XYZ-2025'));
  for (const form of ['3', '3/A', '5', '5/A']) {
    const f = fixture();
    edit(f, 'SUBMISSION', { DOCUMENT_TYPE: form, AFF10B5ONE: '', DATE_OF_ORIG_SUB: '01-JAN-2025' });
    const d = buildInsiders(f).details[0];
    assert.equal(d.filing.form, form);
    assert.equal(d.filing.tradingPlan, null);
    assert.equal(d.filing.originalFiled, '2025-01-01');
  }
});
test('SEC imported captures reject corrupt, duplicate, foreign, missing and unprojected evidence', () => {
  const corrupt = fixture();
  corrupt.archives[0].selected.SUBMISSION[0].hash = 'b'.repeat(64);
  assert.throws(() => buildInsiders(corrupt), /integrity/);
  const foreign = fixture();
  edit(foreign, 'NONDERIV_TRANS', { ACCESSION_NUMBER: '0001234567-26-000002' });
  assert.throws(() => buildInsiders(foreign), /Foreign/);
  const privacy = fixture();
  edit(privacy, 'REPORTINGOWNER', { RPTOWNER_STREET1: 'Private address' });
  assert.throws(() => buildInsiders(privacy), /address/);
  const incomplete = fixture();
  incomplete.archives[0].tables.pop();
  assert.throws(() => buildInsiders(incomplete), /coverage/);
  const missing = fixture();
  missing.issuers = [];
  assert.throws(() => buildInsiders(missing), /coverage/);
  const duplicate = fixture();
  duplicate.archives[0].selected.NONDERIV_TRANS.push({
    ...duplicate.archives[0].selected.NONDERIV_TRANS[0],
    row: 2,
  });
  const t = duplicate.archives[0].tables.find((t) => t.member === 'NONDERIV_TRANS.tsv')!;
  t.rows = 2;
  t.selected = 2;
  assert.throws(() => buildInsiders(duplicate), /Duplicate SEC table/);
  const unknown = fixture();
  edit(unknown, 'SUBMISSION', { AFF10B5ONE: 'maybe' });
  assert.throws(() => buildInsiders(unknown), /checkbox/);
  assert.throws(
    () => insiderArchiveUrl(quarter, 'https://example.org/2026q2_form345.zip'),
    /official/,
  );
  assert.throws(() => insiderArchiveUrl('2026q1', url), /official/);
});
test('SEC updates retain collected scope, detect source revisions and replay portable immutable releases', async () => {
  const input = fixture(),
    first = buildInsiders(input).data;
  assert.deepEqual(buildInsiders(input, first).data, first);
  const revised = fixture();
  edit(revised, 'SUBMISSION', { REMARKS: 'Changed remarks' });
  assert.throws(() => buildInsiders(revised, first), /same capture/);
  revised.archives[0].source.observedAt = '2026-09-17T00:00:00.000Z';
  revised.archives[0].source.hash = 'c'.repeat(64);
  const next = buildInsiders(revised, first).data;
  assert.deepEqual(next.changes.updated, [accession]);
  assert.equal(next.changes.added.length, 0);
  const shrink = fixture();
  shrink.plan.issuers = ['0000000001'];
  assert.throws(() => buildInsiders(shrink, first), /retain/);
  const missing = fixture();
  for (const t of insiderTables) {
    missing.archives[0].selected[t] = [];
    missing.archives[0].tables.find((r) => r.member === `${t}.tsv`)!.selected = 0;
  }
  assert.throws(() => buildInsiders(missing, first), /disappeared/);
  const root = await mkdtemp(join(tmpdir(), 'ltw-insider-publish-')),
    output = join(root, 'public');
  const result = await runInsiders({ input, workspace: join(root, 'work'), output, offline: true });
  const replay = await runInsiders({
    input,
    workspace: join(root, 'replay'),
    output: join(root, 'replay-public'),
    offline: true,
  });
  assert.equal(result.release, replay.release);
  const before = await readFile(join(output, 'manifest.json'), 'utf8');
  await assert.rejects(
    () => runInsiders({ input: missing, workspace: join(root, 'work'), output, offline: true }),
    /disappeared/,
  );
  assert.equal(await readFile(join(output, 'manifest.json'), 'utf8'), before);
});
test('SEC bulk acquisition scans all seven TSV tables, strips owner addresses, supports literal quotes and offline CRC-checked replay', async () => {
  const f = fixture(),
    root = await mkdtemp(join(tmpdir(), 'ltw-insider-acquire-'));
  const files = Object.fromEntries(
    insiderTables.map((t) => {
      const rows = f.archives[0].selected[t].map((r) => ({ ...r.fields }));
      if (t === 'REPORTINGOWNER') rows[0].RPTOWNER_STREET1 = 'not-public-street';
      if (t === 'DERIV_HOLDING') rows.length = 0;
      const headers = rows.length
        ? Object.keys(rows[0])
        : f.archives[0].tables.find((r) => r.member === `${t}.tsv`)!.headers;
      return [
        `${t}.tsv`,
        [headers.join('\t'), ...rows.map((r) => headers.map((h) => r[h] ?? '').join('\t'))].join(
          '\n',
        ) + '\n',
      ];
    }),
  );
  const zip = zipFixture(files),
    requests: string[] = [];
  const fetcher = (async (address: unknown) => {
    requests.push(String(address));
    return String(address) === url
      ? new Response(zip, { headers: { 'content-type': 'application/zip' } })
      : Response.json({
          cik: Number(id),
          name: 'Fixture Issuer',
          tickers: ['TEST'],
          addresses: {
            business: {
              city: 'TEST CITY',
              stateOrCountry: 'CA',
              stateOrCountryDescription: 'CA',
              street1: 'another-nonpublic-field',
            },
          },
        });
  }) as typeof fetch;
  const capture = await acquireInsiders(f.plan, root, false, null, fetcher),
    first = buildInsiders(capture);
  assert.deepEqual(requests, [url, insiderIssuerUrl(id)]);
  assert.ok(!JSON.stringify(capture).includes('not-public-street'));
  assert.ok(!JSON.stringify(capture).includes('another-nonpublic-field'));
  assert.equal(first.details[0].filing.holdings.derivative, 0);
  assert.ok(first.details[0].footnotes[0].fields.FOOTNOTE_TXT.includes('"quote"'));
  const replay = await acquireInsiders(f.plan, root, true, first.data, (() => {
    throw Error('Unexpected offline request');
  }) as typeof fetch);
  assert.deepEqual(buildInsiders(replay, first.data).data, first.data);
  const receipt = JSON.parse(await readFile(join(root, 'receipts', '2026q2.json'), 'utf8'));
  await writeFile(join(root, 'raw', `${receipt.hash}.zip`), Buffer.from('corrupt'));
  await assert.rejects(() => acquireInsiderFile(root, { quarter, url }, true), /integrity/);
});
test('SEC download validation distinguishes decoded HTTP bodies from transport lengths and rejects incomplete identity bodies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ltw-insider-compression-'));
  const body = '{"test":"a decoded response body"}';
  const compressed = (async () =>
    new Response(body, {
      headers: {
        'content-encoding': 'gzip',
        'content-length': '7',
        'content-type': 'application/json',
      },
    })) as typeof fetch;
  const receipt = await acquireInsiderFile(root, { cik: id }, false, compressed);
  assert.equal(receipt.source.bytes, Buffer.byteLength(body));
  assert.equal(await readFile(receipt.path, 'utf8'), body);
  const bad = (async () =>
    new Response(body, {
      headers: { 'content-length': '7', 'content-type': 'application/json' },
    })) as typeof fetch;
  await assert.rejects(() => acquireInsiderFile(root, { cik: id }, false, bad), /Incomplete/);
});
test('SEC browser repository verifies identity and hashes, retries failures, caches successes and honors aborts', async () => {
  const { data, details } = buildInsiders(fixture()),
    detail = details[0],
    file = `filings/${accession}.json`,
    manifest = {
      formatVersion: 1,
      release: `it-${hash(data).slice(0, 24)}`,
      dataHash: hash(data),
      publishedAt: at,
      files: { [file]: hash(detail) },
    };
  let broken = false,
    count = 0;
  const fetcher = (async (url: unknown) => {
    count++;
    return Response.json(
      String(url).endsWith('manifest.json')
        ? manifest
        : String(url).endsWith('data.json')
          ? data
          : broken
            ? {}
            : detail,
    );
  }) as typeof fetch;
  const bundle = await loadInsiders(fetcher, '/site'),
    reader = createInsiderReader(fetcher, '/site');
  assert.equal(count, 2);
  broken = true;
  await assert.rejects(() => reader(bundle, accession), /integrity/);
  broken = false;
  assert.deepEqual(await reader(bundle, accession), detail);
  const before = count;
  await reader(bundle, accession);
  assert.equal(count, before);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => reader(bundle, accession, controller.signal), { name: 'AbortError' });
  const wrong = structuredClone(bundle);
  wrong.data.filings[0].issuerName = 'Different';
  await assert.rejects(() => createInsiderReader(fetcher)(wrong, accession), /mismatch/);
  assert.deepEqual(Object.keys(detail.owners[0].fields), insiderOwnerFields);
});
