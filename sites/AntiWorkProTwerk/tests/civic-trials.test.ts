import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from '../scripts/said-did/engine';
import { buildTrialData, collectTrials, runTrials } from '../scripts/civic/trials';
import { filterTrials, trialGroups } from '../src/lib/civic/trials';
import { publishSnapshot } from '../scripts/civic/snapshots';
import { loadTrials } from '../src/lib/civic/repository';

const states = [
  { code: 'TX', name: 'Texas' },
  { code: 'CA', name: 'California' },
];
const plan = { id: 'test-asthma', condition: 'asthma', pageSize: 1, maxPages: 1, maxTracked: 100 };
const at = '2026-09-01T12:00:00.000Z',
  later = '2026-09-02T12:00:00.000Z';
function study(id = 'NCT00000001', posted: boolean | undefined = false): any {
  return {
    protocolSection: {
      identificationModule: { nctId: id, briefTitle: 'A registered asthma study' },
      statusModule: {
        overallStatus: 'COMPLETED',
        completionDateStruct: { date: '2025-02', type: 'ACTUAL' },
        lastUpdatePostDateStruct: { date: '2026-08-30', type: 'ACTUAL' },
      },
      sponsorCollaboratorsModule: { leadSponsor: { name: 'Example Sponsor', class: 'OTHER' } },
      conditionsModule: { conditions: ['Asthma', 'Respiratory disease'] },
      contactsLocationsModule: {
        locations: [
          {
            facility: 'A',
            city: 'Austin',
            state: 'Texas',
            country: 'United States',
            geoPoint: { lat: 30.2, lon: -97.7 },
          },
          { facility: 'B', city: 'Austin', state: 'Texas', country: 'United States' },
          {
            facility: 'C',
            city: 'Los Angeles',
            state: 'California',
            country: 'United States',
            geoPoint: { lat: 999, lon: 20 },
          },
        ],
      },
      referencesModule: { references: [{ pmid: '12345678', type: 'BACKGROUND' }] },
    },
    hasResults: posted,
  };
}
function input(records = [study()], observedAt = at): any {
  return {
    formatVersion: 1,
    plan,
    observedAt,
    totalMatches: 200,
    discoveryTruncated: true,
    records: records.map((s) => ({
      study: s,
      source: { url: 'https://clinicaltrials.gov/api/v2/studies', hash: hash(s), observedAt },
    })),
  };
}
const temp = () => mkdtemp(join(tmpdir(), 'ltw-trials-'));

test('trial projection preserves date precision, unknown flags, identifiers and unique state counts', () => {
  const unknown = study('NCT00000002');
  delete unknown.hasResults;
  const data = buildTrialData(input([study(), unknown]), null, states);
  assert.equal(data.studies[0].completion!.precision, 'month');
  assert.equal(data.studies[0].completion!.value, '2025-02');
  assert.equal(data.studies[1].results, 'unknown');
  assert.deepEqual(data.states, { CA: 2, TX: 2 });
  assert.equal(data.studies[0].locations[2].lat, null);
  assert.equal(data.studies[0].publications[0].type, 'BACKGROUND');
  assert.equal(filterTrials(data, { results: 'not_posted' }).length, 1);
  assert.equal(trialGroups(data.studies, 'sponsor')[0].unknown, 1);
  assert.equal(trialGroups(data.studies, 'topic').length, 2);
});

test('history detects results arrivals between observations without calling baseline results new', () => {
  const baseline = buildTrialData(
    input([study('NCT00000001', true), study('NCT00000002')]),
    null,
    states,
  );
  assert.equal(baseline.events.length, 0);
  const now = input([study('NCT00000001', true), study('NCT00000002', true)], later);
  const updated = buildTrialData(now, baseline, states);
  assert.equal(updated.events.length, 1);
  assert.equal(updated.events[0].kind, 'results_appeared');
  assert.equal(updated.events[0].previousObservedAt, at);
  assert.equal(updated.trackingStartedAt, at);
  assert.deepEqual(buildTrialData(now, updated, states), updated);
  const changed = study('NCT00000001', true);
  changed.protocolSection.statusModule.overallStatus = 'ACTIVE_NOT_RECRUITING';
  const statusData = buildTrialData(
    input([changed, study('NCT00000002', true)], '2026-09-03T12:00:00.000Z'),
    updated,
    states,
  );
  assert.equal(filterTrials(statusData, {}).length, 1);
  assert.equal(filterTrials(statusData, {}, true).length, 2);
  assert.equal(statusData.events.at(-1)!.kind, 'status_changed');
});

test('projection rejects corrupt, stale, duplicate or incomplete tracking inputs', () => {
  const raw = input(),
    baseline = buildTrialData(raw, null, states);
  const corrupt = structuredClone(raw);
  corrupt.records[0].study.hasResults = true;
  assert.throws(() => buildTrialData(corrupt, null, states), /hash mismatch/);
  assert.throws(() => buildTrialData(input([study(), study()]), null, states), /Duplicate/);
  assert.throws(() => buildTrialData(input([], later), baseline, states), /not refreshed/);
  assert.throws(
    () => buildTrialData(input([study()], '2026-08-01T12:00:00.000Z'), baseline, states),
    /older/,
  );
  assert.throws(
    () => buildTrialData(input([study('NCT00000001', true)]), baseline, states),
    /Conflicting/,
  );
  const credential = structuredClone(raw);
  credential.records[0].source.url += '?api_key=private';
  assert.throws(() => buildTrialData(credential, null, states), /credentials/);
});

test('collector follows the discovery window and refreshes tracked records outside it', async () => {
  const previous = buildTrialData(input([study('NCT00000002')]), null, states),
    urls: string[] = [];
  const fetcher = (async (url: any) => {
    const u = new URL(String(url));
    urls.push(u.href);
    return new Response(
      JSON.stringify(
        u.searchParams.has('filter.ids')
          ? { studies: [study('NCT00000002', true)] }
          : { studies: [study()], totalCount: 200, nextPageToken: 'next-page' },
      ),
    );
  }) as typeof fetch;
  const result = await collectTrials(plan, previous, await temp(), fetcher);
  assert.equal(result.records.length, 2);
  assert.equal(result.discoveryTruncated, true);
  assert.ok(urls[0].includes('query.locn=United+States'));
  assert.ok(urls[1].includes('filter.ids=NCT00000002'));
  assert.equal(buildTrialData(result, previous, states).events[0].kind, 'results_appeared');
});

test('local job publishes repeatably, preserves the pointer on failure and honors optimistic publication', async () => {
  const workspace = await temp(),
    output = await temp();
  const first = await runTrials({ input: input(), workspace, output, states });
  const second = await runTrials({ input: input(), workspace, output, states });
  assert.equal(first.manifest.release, second.manifest.release);
  const before = await readFile(join(output, 'manifest.json'), 'utf8');
  await assert.rejects(
    runTrials({ input: input([], later), workspace, output, states }),
    /not refreshed/,
  );
  assert.equal(await readFile(join(output, 'manifest.json'), 'utf8'), before);
  await assert.rejects(publishSnapshot({}, output, 'tr', null), /changed during/);
  const loaded = await loadTrials(
    (async (url: any) =>
      new Response(
        await readFile(join(output, String(url).replace('/test/data/trials/', '')), 'utf8'),
      )) as typeof fetch,
    '/test',
  );
  assert.equal(loaded.data.studies.length, 1);
});
