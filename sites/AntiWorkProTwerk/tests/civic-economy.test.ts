import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from '../scripts/said-did/engine';
import { buildEconomy, collectEconomy, runEconomy } from '../scripts/civic/economy';
import {
  analyzeChart,
  alternativeWindows,
  chartPath,
  stateUnemployment,
  shiftMonth,
} from '../src/lib/civic/economy';
import { loadEconomy } from '../src/lib/civic/economy-repository';
const at = '2017-01-10T00:00:00.000Z',
  later = '2017-01-11T00:00:00.000Z';
const ids = ['CES0500000003', 'CUSR0000SA0', 'LNS14000000'];
const plan = { id: 'test-economic-windows', startYear: 2016, endYear: 2016, includeStates: false };
function input(observedAt = at): any {
  const response = {
    status: 'REQUEST_SUCCEEDED',
    message: [],
    Results: {
      series: ids.map((seriesID, i) => ({
        seriesID,
        data: [
          { year: '2016', period: 'M01', value: ['100', '100', '5'][i], footnotes: [] },
          { year: '2016', period: 'M02', value: '-', footnotes: [{ text: 'Not available' }] },
          {
            year: '2016',
            period: 'M03',
            value: ['121', '110', '6'][i],
            footnotes: [{ code: 'P', text: 'Preliminary' }],
          },
          { year: '2016', period: 'M13', value: '100', footnotes: [] },
        ],
      })),
    },
  };
  return {
    formatVersion: 1,
    plan: { ...plan },
    observedAt,
    states: [],
    area: null,
    batches: [
      {
        url: 'https://api.bls.gov/publicAPI/v2/timeseries/data/',
        request: { seriesid: ids, startyear: '2016', endyear: '2016' },
        response,
        hash: hash(response),
        observedAt,
      },
    ],
  };
}
function rehash(i: any) {
  i.batches[0].hash = hash(i.batches[0].response);
  return i;
}
const config = {
  seriesId: ids[0],
  from: '2016-01',
  through: '2016-03',
  adjustment: 'nominal',
  axis: 'zero',
};
const temp = () => mkdtemp(join(tmpdir(), 'ltw-economy-'));
test('monthly projection preserves gaps and preliminary footnotes, and excludes annual averages', () => {
  const data = buildEconomy(input());
  assert.equal(data.series.length, 3);
  assert.equal(data.series[0].points.length, 12);
  assert.equal(data.series[0].points[1].value, null);
  assert.equal(data.series[0].points[3].sourceHash, null);
  assert.deepEqual(data.series[0].points[2].footnotes, ['P: Preliminary']);
  assert.equal(data.warnings.length, 3);
  assert.equal(data.through, '2016-12');
  assert.equal(shiftMonth('2016-01', -1), '2015-12');
});
test('calculations distinguish percent, percentage points, elapsed months and aligned real dollars without interpolation', () => {
  const data = buildEconomy(input()),
    nominal = analyzeChart(data, config),
    real = analyzeChart(data, { ...config, adjustment: 'real' }),
    rate = analyzeChart(data, { ...config, seriesId: ids[2] });
  assert.equal(nominal.change, 21);
  assert.ok(Math.abs(real.change! - 10) < 1e-10);
  assert.equal(real.startValue, 110);
  assert.equal(real.endValue, 121);
  assert.equal(rate.change, 1);
  assert.equal(rate.changeUnit, 'percentage points');
  assert.equal(nominal.elapsedMonths, 2);
  assert.deepEqual(real.missingMonths, ['2016-02']);
  const path = chartPath(real.points, config.from, config.through, 0, 130);
  assert.equal((path.match(/M/g) ?? []).length, 2);
  assert.equal(path.includes('L'), false);
  assert.equal(alternativeWindows(data, nominal.configuration)[0].result, null);
  assert.throws(
    () => analyzeChart(data, { ...config, through: '2016-02', adjustment: 'real' }),
    /CPI/,
  );
  assert.throws(
    () => analyzeChart(data, { ...config, seriesId: ids[2], adjustment: 'real' }),
    /Only dollar/,
  );
  assert.throws(() => analyzeChart(data, { ...config, from: '2016-04' }), /distinct/);
  assert.equal(analyzeChart(data, { ...config, from: '2016-02' }).change, null);
});
test('BLS failure messages, duplicates, unknown series, corrupt data and partial requests fail closed', () => {
  const bad = input();
  bad.batches[0].response.Results.series[0].data[0].value = '100 dollars';
  assert.throws(() => buildEconomy(rehash(bad)), /numeric/);
  const duplicate = input();
  duplicate.batches[0].response.Results.series[0].data.push(
    duplicate.batches[0].response.Results.series[0].data[0],
  );
  assert.throws(() => buildEconomy(rehash(duplicate)), /Duplicate monthly/);
  const message = input();
  message.batches[0].response.message = ['Request limited to 10 years'];
  assert.throws(() => buildEconomy(rehash(message)), /incomplete/);
  const missing = input();
  missing.batches[0].response.Results.series.pop();
  assert.throws(() => buildEconomy(rehash(missing)), /series missing/);
  const corrupt = input();
  corrupt.batches[0].hash = '0'.repeat(64);
  assert.throws(() => buildEconomy(corrupt), /checksum/);
  const foreign = input();
  foreign.batches[0].url = 'https://example.com';
  assert.throws(() => buildEconomy(foreign));
  const overlap = input();
  overlap.batches.push(overlap.batches[0]);
  assert.throws(() => buildEconomy(overlap), /Overlapping/);
});
test('state unemployment is joined through verified BLS areas and an independent geographic crosswalk', () => {
  const states = [{ code: 'TX', name: 'Texas', fips: '48' }],
    i = input();
  i.plan.includeStates = true;
  i.states = states;
  const area = 'area_type_code\tarea_code\tarea_text\nA\tST4800000000000\tTexas';
  i.area = {
    url: 'https://download.bls.gov/pub/time.series/la/la.area',
    raw: area,
    hash: hash(area),
  };
  const id = 'LASST480000000000003';
  i.batches[0].request.seriesid = [...ids, id];
  i.batches[0].response.Results.series.push({
    ...structuredClone(i.batches[0].response.Results.series[2]),
    seriesID: id,
  });
  rehash(i);
  const data = buildEconomy(i, null, states);
  assert.deepEqual(stateUnemployment(data, '2016-01', '2016-03')[0], {
    code: 'TX',
    name: 'Texas',
    seriesId: id,
    start: 5,
    end: 6,
    change: 1,
    footnotes: ['P: Preliminary'],
  });
  const wrong = structuredClone(i);
  wrong.states[0].code = 'CA';
  assert.throws(() => buildEconomy(wrong, null, states), /crosswalk/);
  const wrongArea = structuredClone(i);
  wrongArea.area.raw = area.replace('Texas', 'California');
  wrongArea.area.hash = hash(wrongArea.area.raw);
  assert.throws(() => buildEconomy(wrongArea, null, states), /Unverified/);
});
test('economic snapshots preserve numeric revisions and refuse disappearance or stale replacement', () => {
  const first = buildEconomy(input());
  assert.deepEqual(buildEconomy(input(), first), first);
  const revised = input(later);
  revised.batches[0].response.Results.series[0].data[0].value = '101';
  rehash(revised);
  const next = buildEconomy(revised, first);
  assert.equal(next.revisions.length, 1);
  assert.deepEqual(buildEconomy(revised, next), next);
  assert.throws(() => buildEconomy(input(), next), /Stale/);
  const gone = input(later);
  gone.batches[0].response.Results.series[0].data.shift();
  gone.batches[0].response.Results.series[0].data.push({
    year: '2016',
    period: 'M04',
    value: '130',
    footnotes: [],
  });
  assert.throws(() => buildEconomy(rehash(gone), first), /disappeared/);
});
test('collector batches ten-year windows without credentials and supports immutable offline-compatible outputs', async () => {
  const workspace = await temp(),
    output = join(workspace, 'public'),
    requests: any[] = [];
  const fetcher = async (_url: any, opts: any) => {
    const request = JSON.parse(opts.body);
    requests.push(request);
    const response = structuredClone(input().batches[0].response);
    for (const series of response.Results.series)
      for (const point of series.data) point.year = request.startyear;
    return Response.json(response);
  };
  const acquired = await collectEconomy(
    { ...plan, startYear: 1996, endYear: 2015 },
    [],
    workspace,
    fetcher as typeof fetch,
  );
  assert.equal(requests.length, 2);
  assert.equal(requests[0].endyear, '2005');
  assert.equal(Object.hasOwn(requests[0], 'registrationkey'), false);
  assert.equal(buildEconomy(acquired).series.length, 3);
  const first = await runEconomy({ input: input(), workspace, output });
  assert.equal(
    (await runEconomy({ input: input(), workspace, output })).manifest.release,
    first.manifest.release,
  );
  await assert.rejects(() => runEconomy({ input: {}, workspace, output }));
  assert.equal(
    JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')).release,
    first.manifest.release,
  );
  const paths: string[] = [];
  const read = async (url: any) => {
    paths.push(String(url));
    return new Response(
      await readFile(join(output, String(url).replace('/person/data/economy/', '')), 'utf8'),
    );
  };
  const loaded = await loadEconomy(read as typeof fetch, '/person');
  assert.equal(loaded.release, first.manifest.release);
  paths.length = 0;
  await loadEconomy(read as typeof fetch, '/person', first.manifest.release);
  assert.equal(paths.length, 1);
  assert.ok(!paths[0].endsWith('manifest.json'));
  await assert.rejects(() => loadEconomy(read as typeof fetch, '/person', '../../private'));
  await assert.rejects(
    () =>
      loadEconomy(
        (async () => Response.json({})) as typeof fetch,
        '/person',
        first.manifest.release,
      ),
    /integrity/,
  );
});
