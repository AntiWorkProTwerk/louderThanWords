import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from '../scripts/said-did/engine';
import { paycheckCatalog, buildPaycheck, runPaycheck } from '../scripts/civic/paycheck';
import {
  analyzePaycheck,
  indexedPaycheck,
  paycheckSelection,
  paycheckRegions,
} from '../src/lib/civic/paycheck';
import { loadPaycheck } from '../src/lib/civic/paycheck-repository';
const states = [{ code: 'TX', name: 'Texas', fips: '48' }],
  at = '2026-09-16T00:00:00.000Z',
  later = '2026-09-17T00:00:00.000Z',
  plan = { id: 'test-regional-paycheck', startYear: 2016, endYear: 2017, states: ['TX'] };
function fixture(): any {
  const catalog = paycheckCatalog(states),
    raw = JSON.stringify({
      status: 'REQUEST_SUCCEEDED',
      message: [],
      Results: {
        series: catalog.map((s) => ({
          seriesID: s.id,
          data: [
            {
              year: '2016',
              period: 'M01',
              value: s.metric === 'employment' ? '1000' : '100',
              footnotes: [{}],
            },
            {
              year: '2017',
              period: 'M01',
              value: s.metric === 'employment' ? '900' : s.state ? '121' : '110',
              footnotes: [{ code: 'P', text: 'Preliminary' }],
            },
            { year: '2017', period: 'M13', value: '999', footnotes: [] },
          ],
        })),
      },
    });
  return {
    formatVersion: 1,
    plan: structuredClone(plan),
    states: structuredClone(states),
    observedAt: at,
    batches: [
      {
        raw,
        hash: hash(raw),
        observedAt: at,
        request: { seriesid: catalog.map((s) => s.id), startyear: '2016', endyear: '2017' },
      },
    ],
  };
}
function mutate(i: any, fn: (r: any) => void) {
  const b = i.batches[0],
    r = JSON.parse(b.raw);
  fn(r);
  b.raw = JSON.stringify(r);
  b.hash = hash(b.raw);
  return i;
}
const config = { state: 'TX', from: '2016-01', through: '2017-01' };
test('paycheck catalog binds state FIPS, private payroll concepts, units and NSA series identities', () => {
  const catalog = paycheckCatalog(states);
  assert.deepEqual(
    catalog.map((s) => s.id),
    [
      'CEU0500000003',
      'CEU0500000001',
      'SMU48000000500000003',
      'SMU48000000500000001',
      'CUUR0000SA0',
    ],
  );
  const data = buildPaycheck(fixture(), states);
  assert.equal(data.series[0].points.length, 24);
  assert.equal(data.series[0].points[1].value, null);
  assert.equal(data.series[0].points[12].footnotes[0], 'P: Preliminary');
  assert.equal(data.series[3].unit, 'thousands_of_jobs');
  const bad = fixture();
  bad.states[0].name = 'California';
  assert.throws(() => buildPaycheck(bad, states), /Unverified state/);
});
test('paycheck compares common-month endpoints and adjusts earnings, never employment, with national CPI', () => {
  const data = buildPaycheck(fixture(), states),
    r = analyzePaycheck(data, config);
  assert.ok(Math.abs(r.selected.nominal! - 21) < 1e-9);
  assert.ok(Math.abs(r.selected.real! - 10) < 1e-9);
  assert.ok(Math.abs(r.selected.employment! + 10) < 1e-9);
  assert.ok(Math.abs(r.gap! - 10) < 1e-9);
  assert.equal(r.national.real, 0);
  assert.equal(r.selected.startReal, 110);
  assert.equal(r.selected.endReal, 121);
  assert.equal(indexedPaycheck(r.selected.points, 'real')[0].value, 100);
  assert.equal(paycheckRegions(data, config).length, 1);
  assert.throws(
    () => analyzePaycheck(data, { ...config, through: '2017-02' }),
    /same calendar month/,
  );
  assert.throws(() => analyzePaycheck(data, { ...config, state: 'CA' }), /not in/);
  assert.equal(paycheckSelection(data, new URLSearchParams()).from, '2016-12');
});
test('missing CPI and endpoints stay unknown, zero baselines are not infinite growth, invalid API responses fail', () => {
  const i = mutate(fixture(), (r) => (r.Results.series[4].data[1].value = '-')),
    data = buildPaycheck(i, states),
    r = analyzePaycheck(data, config);
  assert.equal(r.selected.real, null);
  assert.equal(r.inflation, null);
  assert.ok(r.selected.nominal !== null);
  assert.equal(
    indexedPaycheck(r.selected.points, 'real').every((p) => p.value === null),
    true,
  );
  const zero = buildPaycheck(
    mutate(fixture(), (r) => (r.Results.series[2].data[0].value = '0')),
    states,
  );
  assert.equal(analyzePaycheck(zero, config).selected.nominal, null);
  assert.throws(
    () =>
      buildPaycheck(
        mutate(fixture(), (r) => r.Results.series.pop()),
        states,
      ),
    /Missing requested/,
  );
  assert.throws(
    () =>
      buildPaycheck(
        mutate(fixture(), (r) => (r.message = ['Rate limit exceeded'])),
        states,
      ),
    /BLS returned messages/,
  );
  assert.throws(
    () =>
      buildPaycheck(
        mutate(fixture(), (r) => r.Results.series[0].data.push(r.Results.series[0].data[0])),
        states,
      ),
    /Duplicate BLS month/,
  );
  assert.throws(
    () =>
      buildPaycheck(
        mutate(fixture(), (r) => (r.Results.series[0].data[0].value = 'not numeric')),
        states,
      ),
    /Unrecognized/,
  );
  const corrupt = fixture();
  corrupt.batches[0].raw += ' ';
  assert.throws(() => buildPaycheck(corrupt, states), /hash/);
});
test('revision receipts survive exact replay and numeric disappearance/conflicting captures are rejected', () => {
  const first = buildPaycheck(fixture(), states),
    i = mutate(fixture(), (r) => (r.Results.series[0].data[0].value = '105'));
  i.observedAt = later;
  i.batches[0].observedAt = later;
  const second = buildPaycheck(i, states, first);
  assert.equal(second.revisions.length, 1);
  assert.deepEqual(buildPaycheck(i, states, second), second);
  assert.throws(() => buildPaycheck(fixture(), states, second), /stale/);
  assert.throws(
    () =>
      buildPaycheck(
        mutate(fixture(), (r) => (r.Results.series[0].data[0].value = '-')),
        states,
        first,
      ),
    /disappeared/,
  );
  const conflict = mutate(fixture(), (r) => (r.Results.series[0].data[0].value = '101'));
  assert.throws(() => buildPaycheck(conflict, states, first), /same-time/);
});
test('paycheck job is portable, replays offline and public consumers verify pinned content', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ltw-paycheck-')),
    workspace = join(directory, 'work'),
    output = join(directory, 'public');
  let calls = 0;
  const first = await runPaycheck({
    plan,
    states,
    workspace,
    output,
    fetcher: async () => {
      calls++;
      return new Response(fixture().batches[0].raw);
    },
  });
  assert.equal(calls, 1);
  const offline = await runPaycheck({
    plan,
    states,
    workspace,
    output,
    offline: true,
    fetcher: async () => {
      throw new Error('Network in offline replay');
    },
  });
  assert.equal(first.release, offline.release);
  const fetcher = (async (url: unknown) =>
    new Response(
      await readFile(join(output, String(url).replace('/data/paycheck/', '')), 'utf8'),
    )) as typeof fetch;
  const loaded = await loadPaycheck(fetcher, '', first.release);
  assert.equal(loaded.data.states[0].code, 'TX');
  const corrupt = (async (url: unknown) => {
    const raw = await (await fetcher(url as RequestInfo)).json();
    if (String(url).endsWith('/data.json')) raw.series[0].points[0].value = 999;
    return Response.json(raw);
  }) as typeof fetch;
  await assert.rejects(() => loadPaycheck(corrupt, '', first.release), /integrity/);
  await assert.rejects(() => loadPaycheck(fetcher, '', '../../private'), /Invalid/);
});
