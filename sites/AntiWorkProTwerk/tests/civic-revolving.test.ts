import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hash } from '../scripts/said-did/engine';
import { lobbyingUrl } from '../scripts/civic/lobbying';
import { buildRevolving, runRevolving } from '../scripts/civic/revolving';
import {
  careerPeople,
  careerRelationships,
  careerStateCounts,
  coveredPositionStatus,
  revolvingDataSchema,
} from '../src/lib/civic/revolving';
import { loadRevolving } from '../src/lib/civic/revolving-repository';

const at = '2026-09-16T00:00:00.000Z';
function fixture(): any {
  const rows = [1, 2, 3].map((n) => {
    const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    return {
      filing_uuid: id,
      url: `https://lda.gov/api/v1/filings/${id}/`,
      filing_document_url: `https://lda.gov/filings/public/filing/${id}/print/`,
      filing_type: `Q${n}`,
      filing_type_display: 'Quarterly Report',
      filing_year: 2025,
      filing_period: ['first_quarter', 'second_quarter', 'third_quarter'][n - 1],
      filing_period_display: `Quarter ${n}`,
      dt_posted: `2025-${String(n * 3 + 1).padStart(2, '0')}-21T12:00:00-05:00`,
      income: null,
      expenses: '100.00',
      client: {
        id: 42,
        name: 'Test Client',
        state: 'TX',
        country: 'US',
        address: 'PRIVATE ADDRESS',
      },
      registrant: { id: 9, name: 'Test Firm' },
      lobbying_activities: [
        {
          general_issue_code: 'SCI',
          general_issue_code_display: 'Science',
          description: 'Research policy',
          government_entities: [],
          lobbyists: [
            {
              lobbyist: {
                id: 7,
                first_name: 'ALEX',
                middle_name: null,
                last_name: 'SMITH',
                suffix_display: null,
                telephone: 'PRIVATE PHONE',
              },
              covered_position:
                n === 1 ? 'Counsel, Senate Committee (2018–2020)' : n === 2 ? '' : null,
              new: n === 1,
            },
            {
              lobbyist: {
                id: 8,
                first_name: 'ALEX',
                middle_name: null,
                last_name: 'SMITH',
                suffix_display: null,
              },
              covered_position: 'N/A',
              new: false,
            },
          ],
        },
      ],
    };
  });
  const raw = JSON.stringify({ count: rows.length, results: rows, next: null, previous: null });
  return {
    formatVersion: 1,
    plan: {
      id: 'career-test',
      title: 'Career test',
      clientIds: [42],
      fromYear: 2025,
      throughYear: 2025,
      maxPerClientYear: 200,
    },
    observedAt: at,
    batches: [
      {
        clientId: 42,
        year: 2025,
        pages: [{ url: lobbyingUrl(42, 2025), raw, hash: hash(raw), observedAt: at }],
      },
    ],
  };
}
function mutate(value: any, change: (rows: any[]) => void) {
  const p = value.batches[0].pages[0],
    raw = JSON.parse(p.raw);
  change(raw.results);
  p.raw = JSON.stringify(raw);
  p.hash = hash(p.raw);
  return value;
}

test('career projection preserves exact roles and blank/none distinctions without leaking contact fields', () => {
  const data = buildRevolving(fixture());
  assert.equal(data.observations.length, 6);
  assert.deepEqual(
    data.observations.filter((o) => o.personId === 7).map((o) => o.positionStatus),
    ['disclosed', 'blank', 'blank'],
  );
  assert.equal(data.observations[0].coveredPosition, 'Counsel, Senate Committee (2018–2020)');
  assert.equal(JSON.stringify(data).includes('PRIVATE'), false);
  assert.equal(coveredPositionStatus(' '), 'blank');
  assert.equal(coveredPositionStatus('None.'), 'reported_none');
  assert.equal(coveredPositionStatus('None; previously Counsel'), 'disclosed');
  assert.equal('employmentStart' in data.observations[0], false);
});
test('career identities stay source-ID distinct and later blank filings retain earlier role context', () => {
  const data = buildRevolving(fixture()),
    all = careerPeople(data, new URLSearchParams('positions=all'));
  assert.equal(all.length, 2);
  assert.equal(all[0].names[0], all[1].names[0]);
  assert.equal(careerPeople(data).length, 1);
  const last = data.filings.at(-1)!.id,
    filtered = careerPeople(data, new URLSearchParams(`filing=${last}`));
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].reports.length, 1);
  assert.equal(filtered[0].positions.length, 1);
  assert.equal(filtered[0].history.length, 3);
  assert.deepEqual(careerStateCounts(data), { TX: 1 });
  assert.deepEqual(careerStateCounts(data, new URLSearchParams('positions=all')), { TX: 2 });
  assert.deepEqual(careerStateCounts(data, new URLSearchParams('state=CA')), { TX: 1 });
  assert.equal(careerPeople(data, new URLSearchParams('state=CA')).length, 0);
  assert.equal(careerPeople(data, new URLSearchParams('q=Senate')).length, 1);
  const relationships = careerRelationships(data, 7);
  assert.equal(relationships.length, 1);
  assert.equal(relationships[0].reports.length, 3);
  assert.equal(relationships[0].firstPosted, data.filings[0].posted);
});
test('career pipeline rejects missing arrays, duplicate observations, corrupt scopes and dangling evidence', () => {
  for (const change of [
    (r: any[]) => delete r[0].lobbying_activities[0].lobbyists,
    (r: any[]) =>
      r[0].lobbying_activities[0].lobbyists.push(r[0].lobbying_activities[0].lobbyists[0]),
    (r: any[]) => delete r[0].lobbying_activities[0].lobbyists[0].covered_position,
    (r: any[]) => r[0].client.id++,
  ])
    assert.throws(() => buildRevolving(mutate(fixture(), change)));
  const corrupt = fixture();
  corrupt.batches[0].pages[0].hash = '0'.repeat(64);
  assert.throws(() => buildRevolving(corrupt), /hash/);
  const dangling = buildRevolving(fixture());
  dangling.observations[0].activityIndex = 99;
  assert.throws(() => revolvingDataSchema.parse(dangling), /bound/);
  const status = buildRevolving(fixture());
  status.observations[0].positionStatus = 'blank';
  assert.throws(() => revolvingDataSchema.parse(status), /bound/);
});
test('career history retains conflicting statements and counts people rather than repeated activity rows', () => {
  const input = mutate(fixture(), (rows) => {
    rows[0].lobbying_activities.push(structuredClone(rows[0].lobbying_activities[0]));
    rows[1].lobbying_activities[0].lobbyists[0].covered_position = 'None';
    rows[2].lobbying_activities[0].lobbyists[0].covered_position = 'Different position description';
    rows[2].registrant = { id: 10, name: 'Other firm' };
  });
  const data = buildRevolving(input),
    p = careerPeople(data)[0];
  assert.equal(p.positions.length, 2);
  assert.equal(p.reports.length, 3);
  assert.equal(p.history.length, 4);
  assert.deepEqual(careerStateCounts(data), { TX: 1 });
  assert.equal(careerRelationships(data, 7).length, 2);
});
test('career portable publication replays identically, detects changes and preserves pointers on failures', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ltw-career-')),
    workspace = join(directory, 'job'),
    output = join(directory, 'public');
  const first = await runRevolving({ input: fixture(), workspace, output, offline: true });
  const again = await runRevolving({ input: fixture(), workspace, output, offline: true });
  assert.equal(first.release, again.release);
  const before = await readFile(join(output, 'manifest.json'), 'utf8');
  const changed = mutate(
    fixture(),
    (r) => (r[0].lobbying_activities[0].lobbyists[0].covered_position = 'Revised source field'),
  );
  await assert.rejects(
    runRevolving({ input: changed, workspace, output, offline: true }),
    /same capture/,
  );
  assert.equal(await readFile(join(output, 'manifest.json'), 'utf8'), before);
  changed.observedAt = '2026-09-17T00:00:00.000Z';
  const revised = await runRevolving({ input: changed, workspace, output, offline: true });
  const raw = JSON.parse(
    await readFile(join(output, 'releases', revised.release, 'data.json'), 'utf8'),
  );
  assert.equal(raw.changes.updated.length, 1);
  const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
  const serve: typeof fetch = async (url) =>
    Response.json(String(url).endsWith('manifest.json') ? manifest : raw);
  assert.equal((await loadRevolving(serve)).data.observations.length, 6);
  raw.observations[0].coveredPosition = 'Tampered';
  await assert.rejects(loadRevolving(serve), /integrity/);
});
