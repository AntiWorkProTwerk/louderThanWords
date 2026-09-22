import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzePatterns, patternsDataSchema } from '../src/lib/civic/patterns';
import { patternHistory, nextHistoryYear } from '../src/lib/civic/pattern-history';

const annual = (year: number, r: number | null, codes = ['CA', 'TX', 'WA']) => ({
  config: { year, pair: 'pay-jobs' as const },
  r,
  points: codes.map((code) => ({ code })),
  excluded: [],
});

test('annual history retains the independently calculated correlations from frozen sources', () => {
  const manifest = JSON.parse(readFileSync('public/data/patterns/manifest.json', 'utf8'));
  const data = patternsDataSchema.parse(
    JSON.parse(readFileSync(`public/data/patterns/releases/${manifest.release}/data.json`, 'utf8')),
  );
  for (const pair of ['pay-jobs', 'pay-unemployment'] as const) {
    const results = data.years.map((year) => analyzePatterns(data, { year, pair }));
    const history = patternHistory(results);
    assert.equal(history.rows.length, 9);
    assert.equal(history.sameCohort, true);
    for (const [i, row] of history.rows.entries()) {
      assert.equal(row.r, results[i].r);
      assert.equal(row.count, results[i].points.length);
      assert.equal(row.excluded, results[i].excluded.length);
    }
  }
});

test('missing correlations and absent years break the line; measured zero remains a real point', () => {
  const input = [
    annual(2022, -1),
    annual(2017, 0),
    annual(2018, 1),
    annual(2019, null),
    annual(2020, 0.5),
  ];
  const saved = structuredClone(input);
  const history = patternHistory(input);
  assert.deepEqual(
    history.segments.map((s) => s.map((r) => r.year)),
    [[2017, 2018], [2020], [2022]],
  );
  assert.equal(history.rows[0].r, 0);
  assert.equal(history.rows[2].r, null);
  assert.deepEqual(input, saved);
});

test('cohort equality compares identities rather than counts and rejects mixed or invalid estimates', () => {
  assert.equal(
    patternHistory([annual(2017, 0.2), annual(2018, 0.3, ['CA', 'TX', 'NY'])]).sameCohort,
    false,
  );
  assert.equal(
    patternHistory([annual(2017, 0.2), annual(2018, 0.3, ['WA', 'CA', 'TX'])]).sameCohort,
    true,
  );
  assert.equal(patternHistory([]).sameCohort, false);
  assert.throws(() => patternHistory([annual(2017, 0.2), annual(2017, 0.4)]), /unique years/);
  assert.throws(
    () =>
      patternHistory([
        { ...annual(2017, 0.2), config: { year: 2017, pair: 'pay-unemployment' } },
        annual(2018, 0.3),
      ]),
    /one comparison/,
  );
  for (const r of [NaN, Infinity, 1.01, -1.01])
    assert.throws(() => patternHistory([annual(2017, r)]), /Invalid/);
  assert.throws(() => patternHistory([annual(2017, 0.2, ['CA', 'CA'])]), /duplicate region/);
});

test('history keyboard browsing is bounded and leaves native activation keys untouched', () => {
  const years = [2017, 2018, 2020];
  assert.equal(nextHistoryYear(years, 2018, 'ArrowRight'), 2020);
  assert.equal(nextHistoryYear(years, 2017, 'ArrowLeft'), 2017);
  assert.equal(nextHistoryYear(years, 2020, 'ArrowRight'), 2020);
  assert.equal(nextHistoryYear(years, 2020, 'Home'), 2017);
  assert.equal(nextHistoryYear(years, 2017, 'End'), 2020);
  assert.equal(nextHistoryYear(years, 2017, 'Enter'), null);
  assert.equal(nextHistoryYear([], 2017, 'Home'), null);
});
