import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import { hash } from '../scripts/said-did/engine';
import { writeAtomic } from '../scripts/said-did/pipeline';
import {
  runWages,
  projectWageCase,
  wageNumber,
  wageDate,
  finalizeWages,
} from '../scripts/civic/wages';
import { wageArchiveUrl, wageMetadataUrl, scanWageCsv } from '../scripts/civic/wage-source';
import { filterWages, wageTotals, wageEmployers, wageSummarySchema } from '../src/lib/civic/wages';
import {
  loadWages,
  loadWageIndex,
  createWageDetailReader,
} from '../src/lib/civic/wages-repository';
import { wageShard } from '../src/lib/civic/wage-index';
import { publishSnapshot } from '../scripts/civic/snapshots';
const states = [{ code: 'TX' }],
  at = '2026-09-16T00:00:00.000Z';
const plan = {
  id: 'test-wage-ledger',
  title: 'Fixture only',
  from: '2023-01-01',
  through: '2025-12-31',
  states: [],
  industryPrefixes: ['722'],
  maxRecords: 10,
};
function raw(id = '100'): Record<string, string> {
  return {
    CASE_ID: id,
    TRADE_NM: 'Shared Franchise Brand',
    LEGAL_NAME: 'Example Legal, LLC',
    CTY_NM: 'Austin',
    ST_CD: 'TX',
    NAIC_CD: '722511',
    NAICS_CODE_DESCRIPTION: 'Full-Service Restaurants',
    CASE_VIOLTN_CNT: '2',
    CMP_ASSD: '123.45',
    EE_VIOLTD_CNT: '8',
    BW_ATP_AMT: '456.78',
    EE_ATP_CNT: '5',
    FINDINGS_START_DATE: '2022-01-01 00:00:00+00:00',
    FINDINGS_END_DATE: '2023-12-01 00:00:00+00:00',
    FLSA_REPEAT_VIOLATOR: 'R',
    FLSA_CMP_ASSD_AMT: '123.45',
    FLSA_CL_CMP_ASSD_AMT: '100.00',
    LOAD_DT: '2026-01-01 00:00:00+00:00',
  };
}
const member = 'LOADtest_chunk_1.csv';
function zipFile(name: string, body: string) {
  const data = Buffer.from(body),
    filename = Buffer.from(name),
    crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(filename.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12);
  end.writeUInt32LE(local.length + filename.length + data.length, 16);
  return Buffer.concat([local, filename, data, central, filename, end]);
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'ltw-wages-')),
    workspace = join(directory, 'work'),
    output = join(directory, 'public');
  await mkdir(join(workspace, 'raw'), { recursive: true });
  const records = [
      raw(),
      {
        ...raw('101'),
        LEGAL_NAME: 'Other Franchisee LLC',
        CASE_VIOLTN_CNT: '0',
        BW_ATP_AMT: '0.00',
        EE_ATP_CNT: '0',
      },
    ],
    headers = Object.keys(records[0]);
  const escape = (s: string) => `"${s.replaceAll('"', '""')}"`;
  const csv =
    [
      headers.map(escape).join(','),
      ...records.map((r) => headers.map((h) => escape(r[h])).join(',')),
    ].join('\r\n') + '\r\n';
  const zip = zipFile(member, csv),
    checksum = createHash('sha256').update(zip).digest('hex');
  await writeFile(join(workspace, 'raw', `${checksum}.zip`), zip);
  const metadata = JSON.stringify({
    dataset: {
      id: 10362,
      api_url: 'enforcement',
      agency: { abbr: 'WHD' },
      dataset_metadatum: headers.map((h) => ({
        column_name: h.toLowerCase(),
        column_desc: h,
        intended_datatype: h === 'CMP_ASSD' ? 'currency' : 'text',
      })),
    },
  });
  const source = {
    url: wageArchiveUrl,
    hash: checksum,
    bytes: zip.length,
    observedAt: at,
    lastModified: null,
    metadata: { url: wageMetadataUrl, raw: metadata, hash: hash(metadata) },
  };
  await writeAtomic(join(workspace, 'source.json'), source);
  return { directory, workspace, output, source, zip, csv };
}

test('WHD money is exact cents, unknown is not zero and dates are findings dates', () => {
  assert.equal(wageNumber('123.45', true), 12345);
  assert.equal(wageNumber('0', true), 0);
  assert.equal(wageNumber('', true), null);
  assert.throws(() => wageNumber('12.345', true), /Invalid/);
  assert.throws(() => wageNumber('-1'), /Invalid/);
  assert.throws(() => wageNumber('3.5'), /Invalid/);
  assert.equal(wageDate('2024-02-29 00:00:00+00:00'), '2024-02-29');
  assert.throws(() => wageDate('2025-02-29'), /Invalid/);
  const record = projectWageCase(raw(), states, member, 1);
  assert.equal(record.penalties, 12345);
  assert.equal(record.backWages, 45678);
  assert.equal(record.employeesAgreed, 5);
  assert.equal(record.employeesViolation, 8);
  assert.equal(record.facts.length, 2);
  assert.equal(record.repeatCode, 'R');
  assert.match(record.cautions[0], /October 2025/);
  assert.equal('street' in record, false);
  assert.equal(record.end, '2023-12-01');
  const reversed = projectWageCase(
    { ...raw(), FINDINGS_START_DATE: '2024-01-01' },
    states,
    member,
    1,
  );
  assert.match(reversed.cautions[0], /after findings end/);
});

test('exact legal-name grouping preserves franchisees, unknown names and case-summed worker semantics', () => {
  const records = [
    projectWageCase(raw(), states, member, 1),
    projectWageCase({ ...raw('101'), TRADE_NM: 'A different trading name' }, states, member, 2),
    projectWageCase({ ...raw('102'), LEGAL_NAME: 'Other Franchisee LLC' }, states, member, 3),
  ];
  const groups = wageEmployers(records);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].cases, 2);
  assert.equal(groups[0].employeesAgreed.known, 10);
  assert.equal(groups[0].penalties.known, 24690);
  const unknown = ['103', '104'].map((id) =>
    projectWageCase({ ...raw(id), LEGAL_NAME: '' }, states, member, 1),
  );
  assert.equal(wageEmployers(unknown).length, 2);
  assert.notEqual(
    projectWageCase({ ...raw(), LEGAL_NAME: 'EXAMPLE LEGAL, LLC' }, states, member, 1).employerKey,
    records[0].employerKey,
  );
  records[0].backWages = null;
  assert.deepEqual(wageTotals(records).backWages, { known: 91356, missing: 1, complete: false });
});

test('WHD full-archive job validates CSV/CRC, publishes offline, preserves identity and exposes hash-verified output', async () => {
  const f = await fixture();
  const first = await runWages({
    plan,
    states,
    workspace: f.workspace,
    output: f.output,
    offline: true,
  });
  assert.equal(first.records, 2);
  assert.equal(first.scannedRows, 2);
  const replay = await runWages({
    plan,
    states,
    workspace: f.workspace,
    output: f.output,
    offline: true,
  });
  assert.equal(replay.release, first.release);
  const fetcher = (async (url: unknown) =>
    new Response(
      await readFile(join(f.output, String(url).replace('/data/wages/', '')), 'utf8'),
    )) as typeof fetch;
  const loaded = await loadWages(fetcher),
    data = loaded.data;
  assert.equal(filterWages(data, { q: 'Other Franchisee' }).length, 1);
  assert.equal(filterWages(data, { outcome: 'zero' }).length, 1);
  assert.equal(filterWages(data, { state: 'CA' }).length, 0);
  assert.equal(filterWages(data, { year: '2024' }).length, 0);
  const changed = structuredClone(data);
  changed.observedAt = '2026-09-17T00:00:00.000Z';
  changed.records[0].backWages = 90000;
  const next = finalizeWages(changed, data);
  assert.equal(next.changes[0].kind, 'updated');
  assert.deepEqual(finalizeWages(next, next), next);
  assert.throws(() => finalizeWages(data, next), /stale/);
  const duplicate = structuredClone(data);
  duplicate.records[1].id = duplicate.records[0].id;
  assert.throws(() => finalizeWages(duplicate), /duplicate/);
  const incomplete = structuredClone(data);
  incomplete.coverage.scannedRows++;
  assert.throws(() => finalizeWages(incomplete), /coverage/);
  const corrupt = (async (url: unknown) => {
    const r = await (await fetcher(url as RequestInfo)).json();
    if (String(url).endsWith('data.json')) r.records[0].backWages = 123;
    return Response.json(r);
  }) as typeof fetch;
  await assert.rejects(() => loadWages(corrupt), /integrity/);
  const input = JSON.parse(await readFile(join(f.workspace, 'input.json'), 'utf8'));
  const imported = await runWages({
    input,
    states,
    archiveDirectory: f.workspace,
    workspace: join(f.directory, 'import'),
    output: join(f.directory, 'import-public'),
    offline: true,
  });
  assert.equal(imported.release, first.release);
  await assert.rejects(
    () =>
      runWages({
        plan: { ...plan, maxRecords: 1 },
        states,
        workspace: f.workspace,
        output: f.output,
        offline: true,
      }),
    /cap/,
  );
  assert.equal(
    JSON.parse(await readFile(join(f.output, 'manifest.json'), 'utf8')).release,
    first.release,
  );
  const damaged = Buffer.from(f.zip);
  damaged[30 + Buffer.byteLength(member) + f.csv.indexOf('123.45')] = 52;
  const brokenPath = join(f.workspace, 'broken.zip');
  await writeFile(brokenPath, damaged);
  await assert.rejects(() => scanWageCsv(brokenPath, member, () => {}), /CRC/);
});

test('compact wage index preserves every summary and lazy evidence is hash-bound, cached and abortable', async () => {
  const f = await fixture();
  await runWages({ plan, states, workspace: f.workspace, output: f.output, offline: true });
  const requests: string[] = [];
  const fetcher = (async (url: unknown) => {
    requests.push(String(url));
    return new Response(
      await readFile(join(f.output, String(url).replace('/data/wages/', '')), 'utf8'),
    );
  }) as typeof fetch;
  const full = await loadWages(fetcher);
  requests.length = 0;
  const index = await loadWageIndex(fetcher);
  assert.equal(requests.length, 2);
  assert.equal(
    requests.some((url) => url.endsWith('/data.json') || url.includes('/cases-v1/')),
    false,
  );
  assert.deepEqual(
    index.data.records,
    full.data.records.map((r) => wageSummarySchema.parse(r)),
  );
  assert.deepEqual(wageTotals(index.data.records), wageTotals(full.data.records));
  const read = createWageDetailReader(fetcher);
  const record = await read(index, '100');
  assert.deepEqual(record, full.data.records[0]);
  const afterFirst = requests.length;
  assert.deepEqual(await read(index, '100'), record);
  assert.equal(requests.length, afterFirst);
  assert.equal((await read(index, '101')).id, '101');
  await assert.rejects(() => read(index, '../../private'), /not in/);
  await assert.rejects(() => read(index, '100', AbortSignal.abort()), /abort/i);
  const corruptIndex = (async (url: unknown) => {
    const raw = await (await fetcher(url as RequestInfo)).json();
    if (String(url).endsWith('/index-v1.json')) raw.rows[0][10]++;
    return Response.json(raw);
  }) as typeof fetch;
  await assert.rejects(() => loadWageIndex(corruptIndex), /integrity/);
  const corruptDetail = (async (url: unknown) => {
    const raw = await (await fetcher(url as RequestInfo)).json();
    if (String(url).includes('/cases-v1/')) raw.records[0].backWages++;
    return Response.json(raw);
  }) as typeof fetch;
  await assert.rejects(() => createWageDetailReader(corruptDetail)(index, '100'), /integrity/);
  const shard = JSON.parse(
    await readFile(join(f.output, 'releases', index.manifest.release, wageShard('100')), 'utf8'),
  );
  shard.records[0].name = 'Wrong summary';
  const altered = structuredClone(index);
  altered.manifest.files[wageShard('100')] = hash(shard);
  await assert.rejects(
    () =>
      createWageDetailReader((async () => Response.json(shard)) as typeof fetch)(altered, '100'),
    /does not match/,
  );
  shard.dataHash = '0'.repeat(64);
  altered.manifest.files[wageShard('100')] = hash(shard);
  await assert.rejects(
    () =>
      createWageDetailReader((async () => Response.json(shard)) as typeof fetch)(altered, '100'),
    /identity mismatch/,
  );
});

test('snapshot attachments are immutable, path-bounded and complete before manifest publication', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ltw-attachments-'));
  const data = { test: 'attachments' },
    initial = await publishSnapshot(data, directory, 'test', null, {
      'index-v1.json': { version: 1 },
      'parts/00.json': { record: 1 },
    });
  assert.equal(initial.files?.['parts/00.json'], hash({ record: 1 }));
  assert.deepEqual(
    JSON.parse(
      await readFile(join(directory, 'releases', initial.release, 'parts/00.json'), 'utf8'),
    ),
    { record: 1 },
  );
  const before = await readFile(join(directory, 'manifest.json'), 'utf8');
  await assert.rejects(
    () =>
      publishSnapshot(data, directory, 'test', initial.release, {
        'index-v1.json': { version: 2 },
      }),
    /Immutable attachment/,
  );
  assert.equal(await readFile(join(directory, 'manifest.json'), 'utf8'), before);
  await assert.rejects(
    () => publishSnapshot(data, directory, 'test', initial.release, { '../escaped.json': {} }),
    /path/,
  );
  await assert.rejects(
    () => publishSnapshot(data, directory, 'test', initial.release, { 'data.json': {} }),
    /path/,
  );
  await assert.rejects(
    () =>
      publishSnapshot({ other: 1 }, directory, 'test', 'test-000000000000000000000000', {
        'index.json': {},
      }),
    /Publication changed/,
  );
  assert.equal(await readFile(join(directory, 'manifest.json'), 'utf8'), before);
});
