import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildResearch, runResearch } from '../scripts/civic/research';
import {
  researchPlanSchema,
  fundingGroups,
  fundingTotal,
  filterResearch,
  researchTrialLinks,
} from '../src/lib/civic/research';
import { loadResearch } from '../src/lib/civic/research-repository';
import { hash } from '../scripts/said-did/engine';
import type { TrialData } from '../src/lib/civic/trials';
const at = '2026-09-16T12:00:00.000Z',
  states = [{ code: 'MA' }, { code: 'PA' }];
const plan = researchPlanSchema.parse({
  id: 'test-research-funding',
  years: [2023, 2024],
  titleTerms: 'childhood asthma',
  institute: 'NHLBI',
});
function project(id = 1, year = 2023, amount: number | null = 100): any {
  return {
    appl_id: id,
    subproject_id: null,
    fiscal_year: year,
    project_num: `5K01HL123456-${year}`,
    core_project_num: 'K01HL123456',
    project_title: 'Childhood asthma',
    award_amount: amount,
    agency_code: 'NIH',
    agency_ic_admin: { abbreviation: 'NHLBI' },
    organization: {
      org_name: 'Example Institute',
      org_city: 'Boston',
      org_state: 'MA',
      org_country: 'UNITED STATES',
      org_ipf_code: '123',
      primary_uei: 'EXAMPLE',
    },
    geo_lat_lon: { lat: 42, lon: -71 },
    spending_categories_desc: 'Asthma; Pediatric; Asthma',
    project_start_date: '2020-01-01T00:00:00',
    project_end_date: '2026-12-31T00:00:00',
    budget_start: '2023-01-01T00:00:00',
    budget_end: '2023-12-31T00:00:00',
  };
}
function batch(kind: string, key: string, records: unknown[]): any {
  const criteria =
    kind === 'projects'
      ? {
          fiscal_years: [Number(key)],
          advanced_text_search: {
            operator: 'and',
            search_field: 'projecttitle',
            search_text: plan.titleTerms,
          },
          org_countries: ['UNITED STATES'],
          agencies: [plan.institute],
          is_agency_admin: true,
          use_relevance: false,
        }
      : { core_project_nums: [key] };
  const raw = JSON.stringify({
    meta: { total: records.length, offset: 0, search_id: null },
    results: records,
  });
  return {
    kind,
    key,
    pages: [{ request: { criteria, offset: 0, limit: 500 }, raw, hash: hash(raw), observedAt: at }],
  };
}
function input(): any {
  return {
    formatVersion: 1,
    plan: structuredClone(plan),
    observedAt: at,
    batches: [
      batch('projects', '2023', [project()]),
      batch('projects', '2024', [project(2, 2024, 200)]),
      batch('publications', 'K01HL123456', [
        { coreproject: 'K01HL123456', pmid: 1234, applid: 99 },
      ]),
    ],
  };
}
function mutatePage(i: any, index: number, change: (r: any) => void) {
  const p = i.batches[index].pages[0],
    r = JSON.parse(p.raw);
  change(r);
  p.raw = JSON.stringify(r);
  p.hash = hash(p.raw);
  return i;
}
test('NIH projection preserves application/core identities, source organization coordinates and whole-amount overlapping topics', () => {
  const i = input();
  mutatePage(i, 1, (r) => (r.results[0].organization.org_name = 'Renamed Institute'));
  const d = buildResearch(i, states);
  assert.equal(d.projects.length, 2);
  assert.equal(d.projects[0].organization.lat, 42);
  assert.deepEqual(d.projects[0].topics, ['Asthma', 'Pediatric']);
  const org = fundingGroups(d.projects, 'organization', 2023, 2024);
  assert.equal(org.length, 1);
  assert.equal(org[0].change, 100);
  assert.equal(fundingGroups(d.projects, 'topic', 2023, 2024).length, 2);
  assert.equal(d.publications[0].latestApplicationId, '99');
  assert.equal(filterResearch(d, { year: 2024, state: 'MA' }).length, 1);
});
test('NIH subprojects do not inflate funding and missing amounts suppress changes', () => {
  const i = input();
  mutatePage(i, 0, (r) => {
    const child = project(3);
    child.subproject_id = 4;
    r.results.push(child);
    r.meta.total = 2;
  });
  mutatePage(i, 1, (r) => (r.results[0].award_amount = null));
  const d = buildResearch(i, states);
  assert.equal(d.exclusions.length, 1);
  assert.deepEqual(fundingTotal(d.projects), { amount: 100, unknown: 1, count: 2 });
  assert.equal(fundingGroups(d.projects, 'organization', 2023, 2024)[0].change, null);
  const empty = input();
  empty.batches[1] = batch('projects', '2024', []);
  assert.equal(
    fundingGroups(buildResearch(empty, states).projects, 'organization', 2023, 2024)[0].change,
    -100,
  );
});
test('NIH rejects partial totals, changed queries, duplicate applications, out-of-scope rows and corrupt raw sources', () => {
  assert.throws(
    () =>
      buildResearch(
        mutatePage(input(), 0, (r) => (r.meta.total = 2)),
        states,
      ),
    /Incomplete/,
  );
  const bad = input();
  bad.batches[0].pages[0].request.criteria.fiscal_years = [2022];
  assert.throws(() => buildResearch(bad, states), /query/);
  assert.throws(
    () =>
      buildResearch(
        mutatePage(input(), 1, (r) => (r.results[0].appl_id = 1)),
        states,
      ),
    /Duplicate/,
  );
  assert.throws(
    () =>
      buildResearch(
        mutatePage(input(), 0, (r) => (r.results[0].fiscal_year = 2024)),
        states,
      ),
    /scope/,
  );
  const hashBad = input();
  hashBad.batches[0].pages[0].raw += ' ';
  assert.throws(() => buildResearch(hashBad, states), /hash/);
  const missing = input();
  missing.batches.pop();
  assert.throws(() => buildResearch(missing, states), /Missing NIH batch/);
  assert.throws(
    () =>
      buildResearch(
        mutatePage(input(), 2, (r) => (r.results[0].coreproject = 'WRONG')),
        states,
      ),
    /different NIH core/,
  );
});
test('NIH validates contiguous multi-page search identity and exact totals', () => {
  const i = input(),
    p = i.batches[0].pages[0],
    first = JSON.parse(p.raw);
  first.meta.total = 2;
  first.meta.search_id = 'stable';
  p.raw = JSON.stringify(first);
  p.hash = hash(p.raw);
  p.request.limit = 1;
  const raw = JSON.stringify({
    meta: { total: 2, offset: 1, search_id: 'stable' },
    results: [project(3)],
  });
  i.batches[0].pages.push({
    request: { search_id: 'stable', offset: 1, limit: 1 },
    raw,
    hash: hash(raw),
    observedAt: at,
  });
  assert.equal(buildResearch(i, states).projects.length, 3);
  i.batches[0].pages[1].request.search_id = 'changed';
  assert.throws(() => buildResearch(i, states), /pagination search/);
});
test('cross-product links require exact PMID and retain background vs results reference types', () => {
  const d = buildResearch(input(), states),
    t = {
      studies: [
        {
          id: 'NCT00000001',
          title: 'Trial A',
          publications: [
            { pmid: '1234', type: 'BACKGROUND' },
            { pmid: '9999', type: 'RESULT' },
          ],
        },
        { id: 'NCT00000002', title: 'Childhood asthma', publications: [] },
      ],
    } as TrialData;
  const links = researchTrialLinks(d, t);
  assert.equal(links.length, 1);
  assert.equal(links[0].referenceType, 'BACKGROUND');
  assert.equal(links[0].core, 'K01HL123456');
});
test('local NIH acquisition publishes immutable output, replays offline, refuses stale/scope changes and validates public integrity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ltw-research-')),
    workspace = join(directory, 'work'),
    output = join(directory, 'public');
  let calls = 0;
  const fetcher = (async (url: unknown, init: RequestInit) => {
    calls++;
    const request = JSON.parse(String(init.body));
    assert.equal(request.limit, 500);
    const criteria = request.criteria;
    const records = String(url).includes('publications')
      ? [{ coreproject: 'K01HL123456', pmid: 1234, applid: 99 }]
      : [project(criteria.fiscal_years[0] === 2023 ? 1 : 2, criteria.fiscal_years[0])];
    return new Response(
      JSON.stringify({ meta: { total: 1, offset: 0, search_id: null }, results: records }),
    );
  }) as typeof fetch;
  const first = await runResearch({ plan, states, workspace, output, fetcher });
  assert.equal(calls, 3);
  const second = await runResearch({
    plan,
    states,
    workspace,
    output,
    offline: true,
    fetcher: async () => {
      throw new Error('Offline made network call');
    },
  });
  assert.equal(first.release, second.release);
  const localFetch = (async (url: unknown) =>
    new Response(
      await readFile(join(output, String(url).replace('/data/research/', '')), 'utf8'),
    )) as typeof fetch;
  const loaded = await loadResearch(localFetch);
  assert.equal(loaded.data.projects.length, 2);
  const badFetch = (async (url: unknown) => {
    const response = await localFetch(url as RequestInfo),
      raw = await response.json();
    if (String(url).endsWith('/data.json')) raw.projects[0].amount = 9999;
    return Response.json(raw);
  }) as typeof fetch;
  await assert.rejects(() => loadResearch(badFetch), /integrity/);
  await assert.rejects(() => runResearch({ input: input(), states, workspace, output }), /stale/);
  const changed = input();
  changed.plan.id = 'different-research-scope';
  changed.observedAt = '2027-01-01T00:00:00.000Z';
  await assert.rejects(
    () => runResearch({ input: changed, states, workspace, output }),
    /collection changed/,
  );
  const capped = { ...plan, maxProjectsPerYear: 1 };
  const cappedFetch = (async () =>
    Response.json({ meta: { total: 2, offset: 0 }, results: [project()] })) as typeof fetch;
  await assert.rejects(
    () =>
      runResearch({
        plan: capped,
        states,
        workspace: join(directory, 'cap'),
        output: join(directory, 'cap-output'),
        fetcher: cappedFetch,
      }),
    /scope exceeds/,
  );
});
