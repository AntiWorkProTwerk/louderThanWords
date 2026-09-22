import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from '../scripts/said-did/engine';
import { capturedInsiderRow } from '../scripts/civic/insiders';
import {
  acquireHoldings,
  buildHoldings,
  runHoldings,
  holdingsColumns,
  holdingsTables,
  holdingsArchiveUrl,
  type HoldingsInput,
  type HoldingsTable,
} from '../scripts/civic/holdings';
import {
  amountAdd,
  amountSubtract,
  amountCompare,
  valueDollars,
  holdingWeight,
  compareConcentration,
  encodeHoldingPositions,
  decodeHoldingPositions,
  holdingPositionsWireSchema,
  compareHoldings,
  compareHoldingsAsync,
  sortHoldingComparisons,
  holdingStateCounts,
} from '../src/lib/civic/holdings';
import { loadHoldings, createHoldingsReader } from '../src/lib/civic/holdings-repository';
import { zipFixture } from './helpers/zip';
const manager = '0001067983',
  archive = '01jun2026-31aug2026',
  url = `https://www.sec.gov/files/datastandardsinnovation/data/form-13f-data-sets/${archive}_form13f.zip`;
const accession = (n: number) => `0001234567-26-${String(n).padStart(6, '0')}`;
function fixture() {
  const selected = Object.fromEntries(
    holdingsTables.map((t) => [t, []]),
  ) as unknown as HoldingsInput['archives'][number]['selected'];
  const input: HoldingsInput = {
    formatVersion: 1,
    plan: {
      id: 'fixture',
      title: 'Synthetic holdings',
      selection: 'Test only',
      managers: [manager],
      archives: [{ id: archive, url }],
      maxFilings: 100,
      maxRows: 10000,
    },
    archives: [
      {
        id: archive,
        source: {
          url,
          hash: 'a'.repeat(64),
          bytes: 123,
          observedAt: '2026-09-16T00:00:00.000Z',
          lastModified: null,
        },
        tables: [],
        selected,
      },
    ],
  };
  function add(t: HoldingsTable, fields: Record<string, string>) {
    const row = Object.fromEntries(holdingsColumns[t].map((k) => [k, fields[k] ?? '']));
    selected[t].push(capturedInsiderRow(row, selected[t].length + 1));
  }
  function filing(
    n: number,
    period: string,
    items: { cusip?: string; quantity?: string; value?: string; unit?: string; option?: string }[],
    opts: {
      form?: string;
      type?: string;
      amendment?: string;
      number?: string;
      confidential?: string;
      release?: string;
      filed?: string;
    } = {},
  ) {
    const id = accession(n),
      form = opts.form ?? '13F-HR';
    add('SUBMISSION', {
      ACCESSION_NUMBER: id,
      FILING_DATE: opts.filed ?? '14-AUG-2026',
      SUBMISSIONTYPE: form,
      CIK: manager,
      PERIODOFREPORT: period,
    });
    add('COVERPAGE', {
      ACCESSION_NUMBER: id,
      REPORTCALENDARORQUARTER: period,
      ISAMENDMENT: form.endsWith('/A') ? 'Y' : 'N',
      AMENDMENTNO: opts.number ?? '',
      AMENDMENTTYPE: opts.amendment ?? '',
      FILINGMANAGER_NAME: 'Fixture "Manager"',
      FILINGMANAGER_CITY: 'Omaha',
      FILINGMANAGER_STATEORCOUNTRY: 'NE',
      REPORTTYPE: opts.type ?? (form.startsWith('13F-NT') ? '13F NOTICE' : '13F HOLDINGS REPORT'),
      CONFDENIEDEXPIRED: opts.release ?? '',
    });
    if (!form.startsWith('13F-NT'))
      add('SUMMARYPAGE', {
        ACCESSION_NUMBER: id,
        OTHERINCLUDEDMANAGERSCOUNT: '0',
        TABLEENTRYTOTAL: String(items.length),
        TABLEVALUETOTAL: items.reduce((s, i) => amountAdd(s, i.value ?? '100'), '0'),
        ISCONFIDENTIALOMITTED: opts.confidential ?? 'N',
      });
    items.forEach((i, k) =>
      add('INFOTABLE', {
        ACCESSION_NUMBER: id,
        INFOTABLE_SK: String(900000000000000000n + BigInt(n * 100 + k)),
        NAMEOFISSUER: 'Example issuer',
        TITLEOFCLASS: 'COM',
        CUSIP: i.cusip ?? '123456789',
        VALUE: i.value ?? '100',
        SSHPRNAMT: i.quantity ?? '10',
        SSHPRNAMTTYPE: i.unit ?? 'SH',
        PUTCALL: i.option ?? '',
        INVESTMENTDISCRETION: 'SOLE',
        VOTING_AUTH_SOLE: i.quantity ?? '10',
        VOTING_AUTH_SHARED: '0',
        VOTING_AUTH_NONE: '0',
      }),
    );
  }
  function finish() {
    input.archives[0].tables = holdingsTables.map((t) => ({
      member: `${t}.tsv`,
      rows: selected[t].length,
      selected: selected[t].length,
      headers: [...holdingsColumns[t]],
    }));
    return input;
  }
  return { input, selected, add, filing, finish };
}
function mutate(f: HoldingsInput, table: HoldingsTable, index: number, key: string, value: string) {
  const row = f.archives[0].selected[table][index];
  row.fields[key] = value;
  row.hash = hash(row.fields);
}
test('13F arithmetic stays exact beyond safe integers and uses filing-date value units', () => {
  assert.equal(amountAdd('9007199254740993.125', '0.875'), '9007199254740994');
  assert.equal(amountSubtract('0.01', '100.001'), '-99.991');
  assert.equal(amountAdd('-0.10', '0.1'), '0');
  assert.equal(amountCompare('9007199254740993', '9007199254740992'), 1);
  assert.equal(valueDollars('123.50', '2023-01-02'), '123500');
  assert.equal(valueDollars('123.50', '2023-01-03'), '123.5');
  assert.equal(holdingWeight('1', '4'), 25);
  assert.equal(holdingWeight('1', '0'), null);
  assert.equal(compareConcentration('1', '3', '1', '2'), 1);
  assert.equal(compareConcentration('0.1', '0.3', '1', '3'), 0);
  assert.equal(
    compareConcentration(
      '9007199254740992',
      '9007199254740994',
      '9007199254740993',
      '9007199254740994',
    ),
    1,
  );
  assert.throws(() => amountAdd('NaN', '0'));
  assert.throws(() => holdingsArchiveUrl(archive, url + '?other=1'));
  assert.throws(() => holdingsArchiveUrl(archive, url.replace('www.sec.gov', 'evil.test')));
});
test('13F snapshots combine discretion rows but keep security/unit/options distinct, compare shares not market values', () => {
  const f = fixture();
  f.filing(1, '31-MAR-2026', [
    { quantity: '9007199254740993', value: '10' },
    { quantity: '2', value: '20' },
    { unit: 'PRN' },
    { option: 'Put' },
    { cusip: '999999999' },
  ]);
  f.filing(2, '30-JUN-2026', [
    { quantity: '9007199254740996', value: '5' },
    { unit: 'PRN', value: '400' },
    { option: 'Call' },
    { cusip: '222222222' },
  ]);
  const { data, attachments } = buildHoldings(f.finish()),
    [before, after] = data.snapshots;
  const a = decodeHoldingPositions(
      holdingPositionsWireSchema.parse(attachments[`positions/${before.id}.json`]),
    ).positions,
    b = decodeHoldingPositions(
      holdingPositionsWireSchema.parse(attachments[`positions/${after.id}.json`]),
    ).positions;
  const changes = compareHoldings(before, after, a, b);
  const shares = changes.find((c) => c.key === '123456789|SH|')!;
  assert.equal(shares.prior!.quantity, '9007199254740995');
  assert.equal(shares.delta, '1');
  assert.equal(shares.change, 'increased');
  assert.equal(shares.next!.value, '5');
  assert.equal(shares.prior!.refs.length, 2);
  assert.equal(changes.find((c) => c.key === '123456789|PRN|')!.change, 'unchanged');
  assert.equal(changes.find((c) => c.key.endsWith('|Put'))!.change, 'missing');
  assert.equal(changes.find((c) => c.key.endsWith('|Call'))!.change, 'new');
  assert.deepEqual(holdingStateCounts(data, new URLSearchParams()), { NE: 1 });
  assert.throws(() => compareHoldings(after, before, b, a), /chronological/);
  const negative = fixture();
  negative.filing(1, '31-MAR-2026', [{ value: '100' }, { value: '-50', cusip: '999999999' }]);
  negative.filing(2, '30-JUN-2026', [{ value: '100' }, { value: '-40', cusip: '999999999' }]);
  const neg = buildHoldings(negative.finish()),
    [na, nb] = neg.data.snapshots;
  const positions = (id: string) =>
    decodeHoldingPositions(
      holdingPositionsWireSchema.parse(neg.attachments[`positions/${id}.json`]),
    ).positions;
  const nc = compareHoldings(na, nb, positions(na.id), positions(nb.id));
  assert.equal(na.topTenWeight, null);
  assert.ok(
    nc.every(
      (c) => c.priorWeight === null && c.nextWeight === null && c.concentrationDirection === null,
    ),
  );
});
test('13F restatements replace prior information, additions supplement, confidentiality stays explicit', () => {
  const f = fixture();
  f.filing(1, '31-MAR-2026', [{ quantity: '100' }], { filed: '01-APR-2026' });
  f.filing(2, '31-MAR-2026', [{ quantity: '40' }], {
    form: '13F-HR/A',
    amendment: 'RESTATEMENT',
    number: '1',
    filed: '02-APR-2026',
    confidential: 'Y',
  });
  f.filing(3, '31-MAR-2026', [{ cusip: '222222222', quantity: '20' }], {
    form: '13F-HR/A',
    amendment: 'NEW HOLDINGS',
    number: '2',
    release: 'Y',
    filed: '03-APR-2026',
  });
  const built = buildHoldings(f.finish()),
    s = built.data.snapshots[0];
  assert.equal(s.status, 'reported');
  assert.equal(s.positions, 2);
  assert.deepEqual(s.activeFilings, [accession(2), accession(3)]);
  assert.ok(s.cautions.some((c) => c.includes('omitted')));
  assert.ok(s.cautions.some((c) => c.includes('previously confidential')));
  const positions = decodeHoldingPositions(
    holdingPositionsWireSchema.parse(built.attachments[`positions/${s.id}.json`]),
  ).positions;
  assert.equal(positions[0].quantity, '40');
  const incomplete = structuredClone(f.input);
  mutate(incomplete, 'COVERPAGE', 2, 'AMENDMENTNO', '3');
  assert.equal(buildHoldings(incomplete).data.snapshots[0].status, 'unresolved');
  const unknown = structuredClone(f.input);
  mutate(unknown, 'COVERPAGE', 2, 'AMENDMENTTYPE', 'UNRECOGNIZED');
  assert.equal(buildHoldings(unknown).data.snapshots[0].status, 'unresolved');
  const standalone = fixture();
  standalone.filing(9, '31-MAR-2026', [{}], {
    form: '13F-HR/A',
    amendment: 'RESTATEMENT',
    number: '3',
  });
  assert.equal(buildHoldings(standalone.finish()).data.snapshots[0].status, 'reported');
  const orphan = fixture();
  orphan.filing(9, '31-MAR-2026', [{}], {
    form: '13F-HR/A',
    amendment: 'NEW HOLDINGS',
    number: '1',
  });
  assert.equal(buildHoldings(orphan.finish()).data.snapshots[0].status, 'unresolved');
});
test('13F notices are not exits; unreconciled and contradictory reports do not produce comparisons', () => {
  const f = fixture();
  f.filing(1, '31-MAR-2026', [{}]);
  f.filing(2, '30-JUN-2026', [], { form: '13F-NT' });
  f.add('OTHERMANAGER', {
    ACCESSION_NUMBER: accession(2),
    OTHERMANAGER_SK: '1',
    CIK: '0000000002',
    NAME: 'Reporting parent',
  });
  const result = buildHoldings(f.finish());
  assert.equal(result.data.snapshots[1].status, 'notice');
  assert.equal(result.details[1].reportingFor[0].fields.NAME, 'Reporting parent');
  assert.throws(
    () => compareHoldings(result.data.snapshots[0], result.data.snapshots[1], [], []),
    /resolved/,
  );
  for (const [t, i, k, v] of [
    ['SUMMARYPAGE', 0, 'TABLEENTRYTOTAL', '99'],
    ['SUMMARYPAGE', 0, 'TABLEVALUETOTAL', '99'],
    ['COVERPAGE', 0, 'REPORTCALENDARORQUARTER', '30-JUN-2026'],
    ['INFOTABLE', 0, 'SSHPRNAMTTYPE', 'UNKNOWN'],
    ['INFOTABLE', 0, 'OTHERMANAGER', '9'],
  ] as const) {
    const broken = structuredClone(f.input);
    mutate(broken, t, i, k, v);
    const s = buildHoldings(broken).data.snapshots[0];
    assert.equal(s.status, 'unresolved', k);
    assert.equal(s.positions, 0);
  }
});
test('13F import rejects forged row hashes, private fields, scope loss, duplicate children and vanished evidence; replay is stable', async () => {
  const f = fixture();
  f.filing(1, '31-MAR-2026', [{}]);
  f.filing(2, '30-JUN-2026', [{}]);
  const input = f.finish(),
    first = buildHoldings(input);
  assert.deepEqual(buildHoldings(input, first.data).data, first.data);
  const corrupt = structuredClone(input);
  corrupt.archives[0].selected.INFOTABLE[0].fields.VALUE = '999';
  assert.throws(() => buildHoldings(corrupt), /integrity/);
  const privateRow = structuredClone(input);
  mutate(privateRow, 'COVERPAGE', 0, 'FILINGMANAGER_STREET1', 'private');
  assert.throws(() => buildHoldings(privateRow), /privacy/);
  const duplicate = structuredClone(input);
  mutate(duplicate, 'SUBMISSION', 1, 'ACCESSION_NUMBER', accession(1));
  assert.throws(() => buildHoldings(duplicate), /Duplicate/);
  const root = await mkdtemp(join(tmpdir(), 'ltw-holdings-')),
    output = join(root, 'public');
  const published = await runHoldings({ input, workspace: join(root, 'job'), output });
  const replay = await runHoldings({
    input,
    workspace: join(root, 'replay'),
    output: join(root, 'replay-public'),
  });
  assert.equal(replay.release, published.release);
  const revision = structuredClone(input);
  revision.archives[0].source.observedAt = '2026-09-17T00:00:00.000Z';
  revision.archives[0].source.hash = 'b'.repeat(64);
  mutate(revision, 'INFOTABLE', 0, 'NAMEOFISSUER', 'Revised issuer');
  assert.deepEqual(buildHoldings(revision, first.data).data.changes.updated, [accession(1)]);
  const narrow = fixture();
  narrow.filing(1, '31-MAR-2026', [{}]);
  assert.throws(() => buildHoldings(narrow.finish(), first.data), /disappeared/);
  const before = await readFile(join(output, 'manifest.json'), 'utf8');
  await assert.rejects(
    () => runHoldings({ input: corrupt, workspace: join(root, 'job'), output }),
    /integrity/,
  );
  assert.equal(await readFile(join(output, 'manifest.json'), 'utf8'), before);
});
test('13F acquisition fully scans CRC-checked tables, strips contact fields, preserves literal quotes and replays offline', async () => {
  const f = fixture();
  f.filing(1, '30-JUN-2026', [{}]);
  const input = f.finish(),
    root = await mkdtemp(join(tmpdir(), 'ltw-holdings-source-'));
  const files = Object.fromEntries(
    holdingsTables.map((t) => {
      const rows = input.archives[0].selected[t].map((r) => ({ ...r.fields })),
        headers = [...holdingsColumns[t]] as string[];
      if (t === 'COVERPAGE') {
        headers.push('FILINGMANAGER_STREET1');
        rows[0].FILINGMANAGER_STREET1 = 'private-address';
      }
      return [
        `${t}.tsv`,
        [headers.join('\t'), ...rows.map((r) => headers.map((k) => r[k] ?? '').join('\t'))].join(
          '\n',
        ) + '\n',
      ];
    }),
  );
  files['SIGNATURE.tsv'] = 'NAME\tPHONE\nnot-published\t555-private\n';
  let calls = 0;
  const capture = await acquireHoldings(input.plan, root, false, null, (async () => {
    calls++;
    return new Response(zipFixture(files));
  }) as typeof fetch);
  assert.equal(calls, 1);
  assert.ok(!JSON.stringify(capture).includes('private-address'));
  assert.ok(!JSON.stringify(capture).includes('555-private'));
  assert.equal(buildHoldings(capture).data.filings[0].name, 'Fixture "Manager"');
  const replay = await acquireHoldings(input.plan, root, true, null, (() => {
    throw new Error('Offline network');
  }) as typeof fetch);
  assert.deepEqual(replay, capture);
  await writeFile(join(root, 'raw', `${capture.archives[0].source.hash}.zip`), 'corrupt');
  await assert.rejects(() => acquireHoldings(input.plan, root, true), /integrity/);
});
test('13F browser lazy evidence verifies hashes, retains row identities, retries failures and honors aborts', async () => {
  const f = fixture();
  f.filing(1, '30-JUN-2026', [{}]);
  const built = buildHoldings(f.finish()),
    h = hash(built.data),
    manifest = {
      formatVersion: 1,
      release: `hf-${h.slice(0, 24)}`,
      dataHash: h,
      publishedAt: '2026-09-16T00:00:00.000Z',
      files: Object.fromEntries(Object.entries(built.attachments).map(([k, v]) => [k, hash(v)])),
    };
  let calls = 0,
    fail = false;
  const fetcher = (async (url: unknown) => {
    calls++;
    if (fail) return Response.json({ corrupt: true });
    const p = String(url);
    return Response.json(
      p.endsWith('manifest.json')
        ? manifest
        : p.endsWith('data.json')
          ? built.data
          : built.attachments[p.split(`${manifest.release}/`)[1]],
    );
  }) as typeof fetch;
  const bundle = await loadHoldings(fetcher),
    reader = createHoldingsReader(fetcher),
    s = built.data.snapshots[0];
  fail = true;
  await assert.rejects(() => reader.positions(bundle, s.id), /integrity/);
  fail = false;
  const positions = await reader.positions(bundle, s.id);
  assert.equal(positions.length, 1);
  const count = calls;
  await reader.positions(bundle, s.id);
  assert.equal(calls, count);
  const detail = await reader.filing(bundle, accession(1));
  assert.equal(detail.rowPages.length, 1);
  const rows = await reader.rows(bundle, accession(1), 0);
  assert.equal(rows[0].fields.INFOTABLE_SK, '900000000000000100');
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(() => reader.positions(bundle, s.id, abort.signal), /abort/i);
  await assert.rejects(() => reader.rows(bundle, accession(1), 1), /outside/);
});
test('13F compact wire dictionaries round-trip all exact values, preserve legacy reads and reject invalid indexes', () => {
  const f = fixture();
  f.filing(
    1,
    '30-JUN-2026',
    Array.from({ length: 100 }, () => ({ quantity: '9007199254740993.25' })),
  );
  const built = buildHoldings(f.finish()),
    s = built.data.snapshots[0];
  const compact = holdingPositionsWireSchema.parse(built.attachments[`positions/${s.id}.json`]);
  const expanded = decodeHoldingPositions(compact);
  assert.equal(expanded.positions[0].refs.length, 100);
  assert.equal(expanded.positions[0].quantity, '900719925474099325');
  assert.deepEqual(
    decodeHoldingPositions(encodeHoldingPositions(s.id, expanded.positions)),
    expanded,
  );
  assert.deepEqual(decodeHoldingPositions(holdingPositionsWireSchema.parse(expanded)), expanded);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(expanded).length / 3);
  if (!('formatVersion' in compact)) throw Error('Expected compact wire');
  const invalid = structuredClone(compact);
  invalid.rows[0][7][0][0] = 999;
  assert.throws(() => decodeHoldingPositions(invalid), /dictionary reference/);
  // A codec-only projection upgrade can use the same frozen source capture;
  // it does not permit the source rows/receipts to change at the same timestamp.
  const legacy = structuredClone(built.data);
  legacy.pipelineVersion = 'holdings-v1';
  assert.equal(buildHoldings(f.input, legacy).data.pipelineVersion, 'holdings-v2');
  legacy.filings[0].name = 'Changed at same capture';
  assert.throws(() => buildHoldings(f.input, legacy), /same capture/);
});
test('13F cooperative comparisons match synchronous exact results, yield during large portfolios and cancel safely', async () => {
  const f = fixture(),
    items = Array.from({ length: 230 }, (_, i) => ({
      cusip: String(i).padStart(9, '0'),
      value: i === 0 ? '9007199254740993' : i === 1 ? '9007199254740992' : String(i + 1),
    }));
  f.filing(1, '31-MAR-2026', items);
  f.filing(
    2,
    '30-JUN-2026',
    items.map((i) => ({ ...i, quantity: '11' })),
  );
  const built = buildHoldings(f.finish()),
    [before, after] = built.data.snapshots;
  const positions = (id: string) =>
    decodeHoldingPositions(
      holdingPositionsWireSchema.parse(built.attachments[`positions/${id}.json`]),
    ).positions;
  const a = positions(before.id),
    b = positions(after.id);
  let yields = 0;
  const result = await compareHoldingsAsync(before, after, a, b, undefined, async () => {
    yields++;
  });
  assert.equal(yields, 2);
  assert.deepEqual(result, sortHoldingComparisons(compareHoldings(before, after, a, b)));
  assert.equal(result[0].key, '000000000|SH|');
  assert.equal(result[1].key, '000000001|SH|');
  const controller = new AbortController();
  await assert.rejects(
    () =>
      compareHoldingsAsync(before, after, a, b, controller.signal, async () => controller.abort()),
    /abort/i,
  );
});
