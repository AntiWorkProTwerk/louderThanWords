import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hash } from '../scripts/said-did/engine';
import {
  buildNursing,
  cmsFixedId,
  nursingMetadataUrls,
  nursingResources,
  runNursing,
} from '../scripts/civic/nursing';
import {
  filterNursing,
  nursingComparison,
  ownershipRole,
  partyFacilities,
} from '../src/lib/civic/nursing';
import {
  nursingAttachments,
  decodeNursingIndex,
  nursingShard,
} from '../src/lib/civic/nursing-index';
import { createNursingReader, loadNursing } from '../src/lib/civic/nursing-repository';

const csv = (rows: Record<string, string>[]) => {
  const headers = Object.keys(rows[0]),
    quote = (v: string) => JSON.stringify(v).replaceAll('\\"', '""');
  return [
    headers.map(quote).join(','),
    ...rows.map((r) => headers.map((k) => quote(r[k] ?? '')).join(',')),
  ].join('\r\n');
};
const sourceUrl = (kind: string) => `https://data.cms.gov/sites/default/files/2026-08/${kind}.csv`;
function provider(id: string, name: string, rn = '1.5'): Record<string, string> {
  return {
    'CMS Certification Number (CCN)': id,
    'Provider Name': name,
    'Legal Business Name': `${name} LLC`,
    State: 'TX',
    'City/Town': 'Test Town',
    Latitude: '30.2',
    Longitude: '-97.7',
    'Overall Rating': '3',
    'Health Inspection Rating': '2',
    'Staffing Rating': '4',
    'Number of Certified Beds': '80',
    'Reported RN Staffing Hours per Resident per Day': rn,
    'Reported Total Nurse Staffing Hours per Resident per Day': '3.8',
    'Rating Cycle 1 Total Number of Health Deficiencies': '8',
    'Total Amount of Fines in Dollars': '10.25',
    'Total Number of Penalties': '1',
    'Processing Date': '2026-08-01',
    'Provider Address': 'Public facility address',
    'ZIP Code': '78701',
    'Provider Changed Ownership in Last 12 Months': 'N',
    'Geocoding Footnote': '',
    'Reported Staffing Footnote': '',
    'Rating Cycle 1 Standard Survey Health Date': '2026-02-01',
    'Rating Cycle 2 Standard Health Survey Date': '2024-01-01',
    'Rating Cycle 2/3 Total Number of Health Deficiencies': '5',
  };
}
function fixture(): any {
  const catalog = {
    dataset: ['enrollments', 'owners'].map((kind) => ({
      title:
        kind === 'owners'
          ? 'Skilled Nursing Facility All Owners'
          : 'Skilled Nursing Facility Enrollments',
      distribution: [
        {
          mediaType: 'text/csv',
          downloadURL: sourceUrl(kind),
          temporal: '2026-08-01/2026-08-31',
          title: kind,
          modified: '2026-08-17',
        },
      ],
    })),
  };
  const meta = [
    catalog,
    ...['providers', 'intervals', 'penalties'].map((kind, i) => ({
      identifier: ['4pq5-n9py', 'qmdc-9999', 'g6vv-u9sr'][i],
      title: kind,
      modified: '2026-08-01',
      released: '2026-08-26',
      distribution: [{ mediaType: 'text/csv', downloadURL: sourceUrl(kind) }],
    })),
  ];
  const enrollments = ['012345', '012346'].map((ccn, i) => ({
    'ENROLLMENT ID': `O2002080100000${i}`,
    CCN: ccn,
    'ASSOCIATE ID': '0000000008',
    'ORGANIZATION NAME': `Facility ${i}`,
    STATE: 'TX',
  }));
  const owner = (enrollment: string, pac: string, role: string, name: string) => ({
    'ENROLLMENT ID': enrollment,
    'ASSOCIATE ID': '8',
    'ASSOCIATE ID - OWNER': pac,
    'TYPE - OWNER': 'O',
    'FIRST NAME - OWNER': '',
    'MIDDLE NAME - OWNER': '',
    'LAST NAME - OWNER': '',
    'ORGANIZATION NAME - OWNER': name,
    'ROLE CODE - OWNER': role,
    'ROLE TEXT - OWNER': role === '34' ? '5% OR GREATER DIRECT OWNERSHIP INTEREST' : 'OFFICER',
    'ASSOCIATION DATE - OWNER': '3/8/2024',
    'PERCENTAGE OWNERSHIP': role === '34' ? '50' : '',
    'ADDRESS LINE 1 - OWNER': 'DO NOT PUBLISH THIS OWNER ADDRESS',
  });
  const content: Record<string, string> = {
    providers: csv([
      provider('012345', 'First Home'),
      provider('012346', 'Different Brand', ''),
      provider('012347', 'Unmatched Home', '0'),
    ]),
    enrollments: csv(enrollments),
    owners: csv([
      owner(enrollments[0]['ENROLLMENT ID'], '7', '34', 'Shared Organization'),
      owner(enrollments[0]['ENROLLMENT ID'], '7', '40', 'Shared Organization'),
      owner(enrollments[1]['ENROLLMENT ID'], '0000000007', '34', 'Shared Org.'),
      owner(enrollments[1]['ENROLLMENT ID'], '9', '40', 'Shared Organization'),
    ]),
    intervals: csv([
      {
        'Measure Code': 'STAFFING_LEVELS',
        'Measure Description': 'Staffing levels',
        'Data Collection Period From Date': '01/01/2026',
        'Data Collection Period Through Date': '03/31/2026',
        'Measure Date Range': '',
        'Processing Date': '20260801',
      },
    ]),
    penalties: csv([
      {
        'CMS Certification Number (CCN)': '012345',
        'Penalty Date': '2026-05-01',
        'Penalty Type': 'Fine',
        'Fine Amount': '10.25',
        'Payment Denial Start Date': '',
        'Payment Denial Length in Days': '',
        'Processing Date': '2026-08-01',
      },
    ]),
  };
  return {
    formatVersion: 1,
    plan: { id: 'nursing-test', title: 'Fixture', states: ['TX'], maxFacilities: 10 },
    observedAt: '2026-09-16T00:00:00.000Z',
    metadata: meta.map((m, i) => {
      const raw = JSON.stringify(m);
      return { url: nursingMetadataUrls[i], raw, hash: hash(raw) };
    }),
    files: Object.entries(content).map(([kind, raw]) => {
      const bytes = Buffer.from(raw);
      return {
        kind,
        url: sourceUrl(kind),
        bytesBase64: bytes.toString('base64'),
        hash: createHash('sha256').update(bytes).digest('hex'),
        encoding: 'utf-8',
      };
    }),
  };
}
function replaceCsv(input: any, kind: string, change: (text: string) => string) {
  const f = input.files.find((f: any) => f.kind === kind),
    bytes = Buffer.from(change(Buffer.from(f.bytesBase64, 'base64').toString()));
  f.bytesBase64 = bytes.toString('base64');
  f.hash = createHash('sha256').update(bytes).digest('hex');
}

test('CMS joins use enrollment/CCN/PAC identities, preserve source names and separate roles without exposing owner addresses', async () => {
  const { data, details } = await buildNursing(fixture());
  assert.equal(data.facilities.length, 3);
  assert.equal(data.coverage.matchedProviders, 2);
  assert.equal(data.parties.length, 2);
  assert.deepEqual(data.parties[0].names, ['Shared Org.', 'Shared Organization']);
  assert.equal(partyFacilities(data.parties[0]).size, 2);
  assert.equal(partyFacilities(data.parties[1]).size, 0);
  assert.equal(details[0].associations.length, 2);
  assert.equal(details[0].facility.ownerCount, 1);
  assert.equal(details[0].associations[0].associated, '2024-03-08');
  assert.equal(details[0].penalties[0].fineCents, 1025);
  assert.equal(data.intervals[0].from, '2026-01-01');
  assert.ok(!JSON.stringify({ data, details }).includes('DO NOT PUBLISH'));
  assert.equal(ownershipRole('72'), 'other');
  assert.equal(ownershipRole('40'), 'management');
  assert.equal(ownershipRole('36'), 'financial');
});
test('unknown measurements are not zero and portfolio summaries use distinct facilities with explicit denominators', async () => {
  const { data } = await buildNursing(fixture());
  const rows = filterNursing(data, new URLSearchParams('owner=0000000007'));
  assert.equal(rows.length, 2);
  assert.deepEqual(nursingComparison(rows).rnHours, { value: 1.5, available: 1, total: 2 });
  assert.equal(nursingComparison(data.facilities).rnHours.value, 0.75);
  assert.equal(filterNursing(data, new URLSearchParams('owner=0000000009')).length, 0);
  assert.equal(
    filterNursing(data, new URLSearchParams('owner=0000000009&role=management')).length,
    1,
  );
  assert.equal(filterNursing(data, new URLSearchParams('q=Shared')).length, 2);
});
test('source conflicts, hashes, duplicate CCNs and mismatched release periods fail before publication', async () => {
  const input = fixture();
  const corrupt = structuredClone(input);
  corrupt.files[0].bytesBase64 = 'YQ==';
  await assert.rejects(() => buildNursing(corrupt), /hash/);
  const conflict = structuredClone(input);
  replaceCsv(conflict, 'owners', (s) => s.replaceAll('"8"', '"10"'));
  await assert.rejects(() => buildNursing(conflict), /PAC mismatch/);
  const duplicate = structuredClone(input);
  replaceCsv(duplicate, 'providers', (s) => s.replaceAll('012346', '012345'));
  await assert.rejects(() => buildNursing(duplicate), /Duplicate CMS facility/);
  const dates = structuredClone(input),
    m = JSON.parse(dates.metadata[0].raw);
  m.dataset[1].distribution[0].temporal = '2026-07-01/2026-07-31';
  dates.metadata[0].raw = JSON.stringify(m);
  dates.metadata[0].hash = hash(dates.metadata[0].raw);
  assert.throws(() => nursingResources(dates.metadata), /different source periods/);
  assert.equal(cmsFixedId('12345', 6), '012345');
  assert.equal(cmsFixedId('7', 10), '0000000007');
  assert.throws(() => cmsFixedId('012345B', 6, true), /Invalid/);
  const suffix = structuredClone(input);
  replaceCsv(suffix, 'enrollments', (s) => s.replace('012345', '012345B'));
  const result = await buildNursing(suffix);
  assert.equal(result.data.coverage.unresolvedEnrollments.length, 1);
  assert.equal(result.details[0].associations.length, 0);
  assert.ok(result.data.coverage.selectedEnrollmentCcnsWithoutProvider.includes('012345B'));
  const encoding = structuredClone(input);
  encoding.files[0].encoding = 'windows-1252';
  await assert.rejects(() => buildNursing(encoding), /encoding mismatch/);
});
test('nursing captures replay exactly, detect evidence changes and preserve old snapshots on failure', async () => {
  const input = fixture(),
    { data } = await buildNursing(input);
  assert.deepEqual((await buildNursing(input, data)).data, data);
  const changed = structuredClone(input);
  replaceCsv(changed, 'providers', (s) => s.replace('First Home', 'Renamed Home'));
  await assert.rejects(() => buildNursing(changed, data), /same capture/);
  changed.observedAt = '2026-09-17T00:00:00.000Z';
  assert.deepEqual((await buildNursing(changed, data)).data.changes.changedFacilities, ['012345']);
  const workspace = await mkdtemp(join(tmpdir(), 'ltw-nursing-')),
    output = join(workspace, 'public');
  const a = await runNursing({ input, workspace, output, offline: true });
  const b = await runNursing({ input, workspace, output, offline: true });
  assert.equal(a.release, b.release);
  const before = await readFile(join(output, 'manifest.json'), 'utf8');
  const invalid = structuredClone(input);
  invalid.files = [];
  await assert.rejects(() => runNursing({ input: invalid, workspace, output, offline: true }));
  assert.equal(await readFile(join(output, 'manifest.json'), 'utf8'), before);
});

async function browserFixture() {
  const { data, details } = await buildNursing(fixture()),
    dataHash = hash(data),
    release = `nh-${dataHash.slice(0, 24)}`;
  const attachments = nursingAttachments(data, details, dataHash);
  const manifest = {
    formatVersion: 1,
    release,
    dataHash,
    publishedAt: data.observedAt,
    files: Object.fromEntries(
      Object.entries(attachments).map(([file, value]) => [file, hash(value)]),
    ),
  };
  const requests: string[] = [];
  const fetcher = (async (url: string | URL | Request, options?: RequestInit) => {
    options?.signal?.throwIfAborted();
    const path = String(url);
    requests.push(path);
    const file = path.split(`/releases/${release}/`)[1];
    const body = path.endsWith('/manifest.json') ? manifest : attachments[file];
    return new Response(JSON.stringify(body ?? null), { status: body ? 200 : 404 });
  }) as typeof fetch;
  return { data, details, attachments, manifest, requests, fetcher };
}

test('compact nursing index round-trips scope and loads no full dataset, party catalog or facility details initially', async () => {
  const f = await browserFixture(),
    bundle = await loadNursing(f.fetcher, '/AntiWorkProTwerk');
  assert.equal(f.requests.length, 2);
  assert.ok(f.requests.every((url) => !url.endsWith('/data.json')));
  assert.equal(bundle.data.facilities.length, 3);
  assert.equal(bundle.data.partyCount, 2);
  assert.ok(!('recordHash' in bundle.data.facilities[0]));
  assert.equal(bundle.data.featured[0].id, '0000000007');
  const bad = structuredClone(f.attachments['index-v1.json']) as any;
  bad.fields.reverse();
  assert.throws(() => decodeNursingIndex(bad), /columns/);
  const duplicate = structuredClone(f.attachments['index-v1.json']) as any;
  duplicate.rows[1] = duplicate.rows[0];
  assert.throws(() => decodeNursingIndex(duplicate), /scope/);
});

test('lazy nursing readers verify identities, deduplicate portfolios, preserve roles and cache bounded evidence', async () => {
  const f = await browserFixture(),
    bundle = await loadNursing(f.fetcher),
    reader = createNursingReader(f.fetcher);
  assert.deepEqual(await reader.facility(bundle, '012345'), f.details[0]);
  const count = f.requests.length;
  await reader.facility(bundle, '012345');
  assert.equal(f.requests.length, count);
  const party = await reader.party(bundle, '0000000007');
  assert.equal(partyFacilities(party).size, 2);
  assert.equal((await reader.catalog(bundle)).length, 2);
  assert.equal(
    filterNursing(
      { facilities: bundle.data.facilities, parties: [party] },
      new URLSearchParams('owner=0000000007'),
    ).length,
    2,
  );
  await assert.rejects(() => reader.facility(bundle, '999999'), /outside/);
  await assert.rejects(() => reader.party(bundle, '../bad'), /Invalid/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => reader.facility(bundle, '012345', controller.signal), /abort/i);
});

test('nursing evidence readers reject corrupt bytes, cross-release data, wrong partitions and summary disagreement', async () => {
  const f = await browserFixture(),
    bundle = await loadNursing(f.fetcher),
    file = nursingShard('facilities', '012345');
  const original = structuredClone(f.attachments[file]) as any;
  (f.attachments[file] as any).records[0].facility.name = 'Corrupted name';
  await assert.rejects(
    () => createNursingReader(f.fetcher).facility(bundle, '012345'),
    /integrity/,
  );
  bundle.manifest.files[file] = hash(f.attachments[file]);
  await assert.rejects(
    () => createNursingReader(f.fetcher).facility(bundle, '012345'),
    /index mismatch/,
  );
  f.attachments[file] = structuredClone(original);
  (f.attachments[file] as any).dataHash = '0'.repeat(64);
  bundle.manifest.files[file] = hash(f.attachments[file]);
  await assert.rejects(
    () => createNursingReader(f.fetcher).facility(bundle, '012345'),
    /release mismatch/,
  );
  f.attachments[file] = structuredClone(original);
  (f.attachments[file] as any).records[0].facility.id = '999999';
  bundle.manifest.files[file] = hash(f.attachments[file]);
  await assert.rejects(
    () => createNursingReader(f.fetcher).facility(bundle, '012345'),
    /identity mismatch/,
  );
});

test('failed nursing evidence requests are retryable and cannot poison a later success', async () => {
  const f = await browserFixture(),
    bundle = await loadNursing(f.fetcher);
  let fail = true;
  const reader = createNursingReader((async (...args: Parameters<typeof fetch>) => {
    if (fail) {
      fail = false;
      throw new Error('temporary outage');
    }
    return f.fetcher(...args);
  }) as typeof fetch);
  await assert.rejects(() => reader.facility(bundle, '012345'), /temporary outage/);
  assert.equal((await reader.facility(bundle, '012345')).facility.id, '012345');
});
