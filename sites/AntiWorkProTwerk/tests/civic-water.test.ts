import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from '../scripts/said-did/engine';
import {
  buildWater,
  acquireWater,
  capturedWaterRow,
  waterMembers,
  waterInventoryFields,
  waterSearchFields,
  waterOverlaps,
  waterDate,
  runWater,
  type WaterInput,
} from '../scripts/civic/water';
import { waterArchiveUrl, waterSearchUrl } from '../scripts/civic/water-source';
import {
  waterKind,
  waterYears,
  filterWater,
  waterStateCounts,
  waterStatusHelp,
  type WaterPlan,
} from '../src/lib/civic/water';
import { loadWater, createWaterReader } from '../src/lib/civic/water-repository';
import { zipFixture, csvFixture } from './helpers/zip';
const at = '2026-09-16T00:00:00.000Z',
  quarter = '2026Q2';
const plan: WaterPlan = {
  id: 'test-water',
  title: 'Fixture',
  selection: 'Test only',
  counties: [{ state: 'TX', county: 'Harris' }],
  types: ['CWS'],
  active: 'A',
  from: '2020-01-01',
  through: '2026-06-30',
  maxSystems: 10,
};
const row = (fields: Record<string, string>, n = 1) => capturedWaterRow(fields, n);
function fixture(): WaterInput {
  const inventory = Object.fromEntries(waterInventoryFields.map((k) => [k, '']));
  Object.assign(inventory, {
    SUBMISSIONYEARQUARTER: quarter,
    PWSID: 'TX1010001',
    PWS_NAME: 'Fixture Water',
    PWS_TYPE_CODE: 'CWS',
    PWS_ACTIVITY_CODE: 'A',
    POPULATION_SERVED_COUNT: '0',
  });
  const search = Object.fromEntries(waterSearchFields.map((k) => [k, '']));
  Object.assign(search, { PWSID: 'TX1010001', REGISTRY_ID: '110000000001' });
  const common = {
    SUBMISSIONYEARQUARTER: quarter,
    PWSID: 'TX1010001',
    VIOLATION_ID: 'V1',
    VIOLATION_CATEGORY_CODE: 'MR',
    VIOLATION_CODE: '03',
    NON_COMPL_PER_BEGIN_DATE: '01/01/2024',
    NON_COMPL_PER_END_DATE: '12/31/2024',
    VIOLATION_STATUS: 'Resolved',
    IS_HEALTH_BASED_IND: 'N',
    CONTAMINANT_CODE: '1005',
    RULE_CODE: '332',
    VIOL_MEASURE: '',
    UNIT_OF_MEASURE: '',
    FEDERAL_MCL: '',
    STATE_MCL: '',
    CALCULATED_RTC_DATE: '12/31/2024',
    VIOL_FIRST_REPORTED_DATE: '04/01/2024',
    VIOL_LAST_REPORTED_DATE: '06/30/2026',
    ENFORCEMENT_ID: 'A1',
    ENFORCEMENT_DATE: '06/01/2024',
    ENFORCEMENT_ACTION_TYPE_CODE: 'SIA',
    ENF_ACTION_CATEGORY: 'Informal',
    ENF_FIRST_REPORTED_DATE: '07/01/2024',
    ENF_LAST_REPORTED_DATE: '06/30/2026',
  };
  const codes = [
    ['CONTAMINANT_CODE', '1005', 'Arsenic'],
    ['VIOLATION_CODE', '03', 'Monitoring, routine'],
    ['RULE_CODE', '332', 'Arsenic'],
    ['ENFORCEMENT_ACTION_TYPE_CODE', 'SIA', 'State informal action'],
    ['PWS_TYPE_CODE', 'CWS', 'Community water system'],
  ].map(([VALUE_TYPE, VALUE_CODE, VALUE_DESCRIPTION], i) =>
    row({ VALUE_TYPE, VALUE_CODE, VALUE_DESCRIPTION }, i + 1),
  );
  const selected = {
    inventory: [row(inventory)],
    search: [row(search)],
    geography: [
      row({
        SUBMISSIONYEARQUARTER: quarter,
        PWSID: 'TX1010001',
        GEO_ID: 'G1',
        COUNTY_SERVED: 'Harris',
        STATE_SERVED: '',
      }),
    ],
    codes,
    violations: [
      row(common),
      row(
        {
          ...common,
          ENFORCEMENT_ID: 'A2',
          ENFORCEMENT_DATE: '12/31/2024',
          ENF_ACTION_CATEGORY: 'Resolving',
        },
        2,
      ),
    ],
  };
  const receipt = {
    hash: 'a'.repeat(64),
    bytes: 500,
    observedAt: at,
    lastModified: null,
    etag: null,
  };
  return {
    formatVersion: 1,
    plan,
    quarter,
    sources: {
      records: { ...receipt, url: waterArchiveUrl },
      search: { ...receipt, url: waterSearchUrl },
    },
    retainedIds: [],
    discoveredIds: ['TX1010001'],
    tables: (Object.keys(waterMembers) as (keyof typeof waterMembers)[]).map((key) => ({
      member: waterMembers[key],
      rows: selected[key].length,
      selected: selected[key].length,
      headers: Object.keys(selected[key][0].fields),
    })),
    selected,
  };
}
function edit(
  input: WaterInput,
  table: keyof WaterInput['selected'],
  index: number,
  changes: Record<string, string>,
) {
  const r = input.selected[table][index];
  Object.assign(r.fields, changes);
  r.hash = hash(r.fields);
}
test('water categories explain missing monitoring separately from limits and treatment; multiple actions are one violation', () => {
  assert.equal(waterDate('--->'), null);
  assert.throws(() => waterDate('unexpected date code'));
  const { data, details } = buildWater(fixture()),
    v = details[0].violations[0];
  assert.equal(data.systems[0].violations, 1);
  assert.equal(v.actions.length, 2);
  assert.equal(v.contaminant.label, 'Arsenic');
  assert.equal(v.kind, 'monitoring');
  assert.equal(v.measure, null);
  assert.equal(data.systems[0].population, 0);
  assert.equal(waterKind('MCL'), 'contaminant');
  assert.equal(waterKind('MRDL'), 'contaminant');
  assert.equal(waterKind('TT'), 'treatment');
  assert.equal(waterKind('MON'), 'monitoring');
  assert.equal(waterKind('RPT'), 'reporting');
  assert.equal(waterKind('future-code'), 'other');
  assert.match(waterStatusHelp.Archived, /not necessarily resolved/);
  assert.deepEqual(waterYears(details[0].violations), [
    { year: '2024', contaminant: 0, treatment: 0, monitoring: 1, reporting: 0, other: 0, total: 1 },
  ]);
  assert.equal(filterWater(data, new URLSearchParams('kind=contaminant')).length, 0);
  assert.equal(filterWater(data, new URLSearchParams('q=Harris&kind=monitoring')).length, 1);
  assert.deepEqual(waterStateCounts(data, new URLSearchParams('state=CA')), { TX: 1 });
  assert.equal(
    waterOverlaps(plan, { NON_COMPL_PER_BEGIN_DATE: '01/01/2018', NON_COMPL_PER_END_DATE: '' }),
    true,
  );
  assert.equal(
    waterOverlaps(plan, {
      NON_COMPL_PER_BEGIN_DATE: '01/01/2018',
      NON_COMPL_PER_END_DATE: '12/31/2019',
    }),
    false,
  );
});
test('water projection rejects changed hashes, conflicting IDs, mixed snapshots, scope/coverage failures and contact leaks', () => {
  for (const mutate of [
    (f: WaterInput) => (f.selected.inventory[0].fields.PWS_NAME = 'tampered'),
    (f: WaterInput) => edit(f, 'violations', 1, { VIOLATION_CATEGORY_CODE: 'MCL' }),
    (f: WaterInput) => edit(f, 'violations', 0, { SUBMISSIONYEARQUARTER: '2026Q1' }),
    (f: WaterInput) => f.tables[0].selected++,
    (f: WaterInput) => edit(f, 'inventory', 0, { EMAIL_ADDR: 'private-contact@example.org' }),
    (f: WaterInput) => edit(f, 'geography', 0, { COUNTY_SERVED: 'Other' }),
    (f: WaterInput) => f.selected.violations.push(f.selected.violations[0]),
    (f: WaterInput) => (f.sources.records.url = waterSearchUrl),
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(() => buildWater(f));
  }
  const missing = fixture();
  edit(missing, 'inventory', 0, { POPULATION_SERVED_COUNT: '' });
  assert.equal(buildWater(missing).data.systems[0].population, null);
});
test('water retained systems and updates preserve older snapshots and exact replay', async () => {
  const input = fixture(),
    first = buildWater(input).data;
  assert.deepEqual(buildWater(input, first).data, first);
  const changed = fixture();
  edit(changed, 'inventory', 0, { PWS_NAME: 'Updated' });
  assert.throws(() => buildWater(changed, first), /same capture/);
  changed.sources.records.observedAt = '2026-09-17T00:00:00.000Z';
  changed.retainedIds = changed.discoveredIds;
  changed.discoveredIds = [];
  edit(changed, 'inventory', 0, { PWS_ACTIVITY_CODE: 'I' });
  const next = buildWater(changed, first);
  assert.deepEqual(next.data.changes.updated, ['TX1010001']);
  assert.equal(next.data.systems[0].retained, true);
  const workspace = await mkdtemp(join(tmpdir(), 'ltw-water-')),
    output = join(workspace, 'public');
  const published = await runWater({ input, workspace, output });
  const replay = await runWater({ input, workspace, output });
  assert.equal(published.release, replay.release);
  const before = await readFile(join(output, 'manifest.json'), 'utf8');
  input.selected.inventory = [];
  await assert.rejects(() => runWater({ input, workspace, output }));
  assert.equal(await readFile(join(output, 'manifest.json'), 'utf8'), before);
});
test('water lazy repository pins hashes and identities, caches successes only, retries and cancels', async () => {
  const { data, details } = buildWater(fixture()),
    detail = details[0],
    manifest = {
      formatVersion: 1,
      release: `sw-${hash(data).slice(0, 24)}`,
      dataHash: hash(data),
      publishedAt: at,
      files: { 'systems/tx1010001.json': hash(detail) },
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
  const bundle = await loadWater(fetcher, '/site');
  assert.equal(count, 2);
  const reader = createWaterReader(fetcher, '/site');
  broken = true;
  await assert.rejects(() => reader(bundle, 'TX1010001'), /integrity/);
  broken = false;
  assert.deepEqual(await reader(bundle, 'TX1010001'), detail);
  const before = count;
  await reader(bundle, 'TX1010001');
  assert.equal(count, before);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => reader(bundle, 'TX1010001', controller.signal), {
    name: 'AbortError',
  });
  const wrong = structuredClone(bundle);
  wrong.data.systems[0].name = 'Wrong';
  await assert.rejects(() => createWaterReader(fetcher)(wrong, 'TX1010001'), /mismatch/);
});

test('water collector scans complete archives, projects away contacts, verifies CRCs and exactly replays retained coverage', async () => {
  const f = fixture(),
    workspace = await mkdtemp(join(tmpdir(), 'ltw-water-acquire-'));
  // Extra city/geography rows must not appear only on subsequent retained-ID captures.
  f.selected.geography.push(
    row({ ...f.selected.geography[0].fields, GEO_ID: 'G2', COUNTY_SERVED: 'Other' }, 2),
  );
  const rawInventory = f.selected.inventory.map((r) => ({
    ...r.fields,
    EMAIL_ADDR: 'not-for-publication@example.org',
  }));
  const records = zipFixture(
    Object.fromEntries(
      (Object.keys(waterMembers) as (keyof typeof waterMembers)[])
        .filter((k) => k !== 'search')
        .map((k) => [
          waterMembers[k],
          csvFixture(k === 'inventory' ? rawInventory : f.selected[k].map((r) => r.fields)),
        ]),
    ),
  );
  const search = zipFixture({
    [waterMembers.search]: csvFixture(f.selected.search.map((r) => r.fields)),
  });
  const urls: string[] = [];
  const fetcher = (async (url: unknown) => {
    urls.push(String(url));
    return new Response(String(url) === waterArchiveUrl ? records : search, {
      headers: { 'content-type': 'application/zip' },
    });
  }) as typeof fetch;
  const capture = await acquireWater(plan, workspace, false, null, fetcher),
    first = buildWater(capture);
  assert.deepEqual(urls, [waterArchiveUrl, waterSearchUrl]);
  assert.ok(!JSON.stringify(capture).includes('not-for-publication'));
  assert.equal(capture.tables.find((t) => t.member === waterMembers.geography)?.rows, 2);
  const replay = await acquireWater(plan, workspace, true, first.data, (() => {
    throw new Error('Offline network request');
  }) as typeof fetch);
  assert.deepEqual(buildWater(replay, first.data).data, first.data);
  assert.equal(first.details[0].geography.length, 1);
});

test('inconsistent source intervals stay visible and uncertain instead of being silently corrected or dropped', () => {
  const f = fixture();
  for (let i = 0; i < 2; i++)
    edit(f, 'violations', i, {
      NON_COMPL_PER_BEGIN_DATE: '01/01/2025',
      NON_COMPL_PER_END_DATE: '12/31/2024',
    });
  const { details } = buildWater(f),
    v = details[0].violations[0];
  assert.equal(v.intervalIssue, 'reversed');
  assert.equal(v.from, '2025-01-01');
  assert.equal(v.through, '2024-12-31');
  assert.equal(waterYears(details[0].violations)[0].year, 'Unknown');
});

test('action-only SDWA rows never become invented violations and preserve their own date window', () => {
  const f = fixture();
  const base = Object.fromEntries(Object.keys(f.selected.violations[0].fields).map((k) => [k, '']));
  Object.assign(base, {
    SUBMISSIONYEARQUARTER: quarter,
    PWSID: 'TX1010001',
    ENFORCEMENT_ID: 'standalone',
    ENFORCEMENT_DATE: '06/01/2024',
    ENFORCEMENT_ACTION_TYPE_CODE: 'SIA',
  });
  f.selected.violations.push(
    row(base, 3),
    row({ ...base, ENFORCEMENT_ID: 'old-action', ENFORCEMENT_DATE: '01/01/1994' }, 4),
  );
  const table = f.tables.find((t) => t.member === waterMembers.violations)!;
  table.rows = 4;
  table.selected = 4;
  const { data, details } = buildWater(f);
  assert.equal(data.systems[0].violations, 1);
  assert.equal(details[0].standaloneActions.length, 1);
  assert.equal(details[0].standaloneActions[0].action.id, 'standalone');
  assert.equal(details[0].outsideWindowActionRows, 1);
});
