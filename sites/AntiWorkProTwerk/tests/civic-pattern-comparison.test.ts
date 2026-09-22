import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzePatterns, patternsDataSchema } from '../src/lib/civic/patterns';
import { comparePatternStates, comparisonDomain } from '../src/lib/civic/pattern-comparison';

function snapshot() {
  const manifest = JSON.parse(readFileSync('public/data/patterns/manifest.json', 'utf8'));
  return patternsDataSchema.parse(
    JSON.parse(readFileSync(`public/data/patterns/releases/${manifest.release}/data.json`, 'utf8')),
  );
}

test('state comparison retains the exact rows, periods and full correlation sample', () => {
  for (const pair of ['pay-jobs', 'pay-unemployment'] as const) {
    const result = analyzePatterns(snapshot(), { year: 2025, pair });
    const saved = structuredClone(result);
    const { comparison: c, error } = comparePatternStates(result, 'TX', 'CA');
    assert.equal(error, '');
    assert.ok(c);
    assert.equal(
      c.primary,
      result.rows.find((r) => r.code === 'TX'),
    );
    assert.equal(
      c.secondary,
      result.rows.find((r) => r.code === 'CA'),
    );
    assert.equal(c.from, '2024-12');
    assert.equal(c.through, '2025-12');
    assert.equal(c.measures[0].gap, c.primary.x! - c.secondary.x!);
    assert.equal(c.measures[1].gap, c.primary.y! - c.secondary.y!);
    assert.equal(c.measures[0].unit, pair === 'pay-jobs' ? '%' : 'pp');
    assert.ok(c.measures.every((m) => m.gapUnit === 'pp'));
    const swapped = comparePatternStates(result, 'CA', 'TX').comparison!;
    assert.equal(swapped.measures[1].gap, -c.measures[1].gap!);
    assert.deepEqual(result, saved);
    assert.equal(result.points.length, 51);
  }
});

test('absent and identical comparison choices do not fabricate another observation', () => {
  const r = analyzePatterns(snapshot(), { year: 2025, pair: 'pay-jobs' });
  assert.deepEqual(comparePatternStates(r, 'TX', null), { comparison: null, error: '' });
  for (const [a, b] of [
    ['TX', 'TX'],
    ['ZZ', 'CA'],
    ['TX', 'ZZ'],
  ]) {
    const c = comparePatternStates(r, a, b);
    assert.equal(c.comparison, null);
    assert.ok(c.error);
  }
});

test('missing endpoints suppress only the unavailable difference while measured zero stays zero', () => {
  const data = snapshot();
  const tx = data.states.find((s) => s.code === 'TX')!;
  tx.jobs!.points.find((p) => p.month === '2025-12')!.value = null;
  const r = analyzePatterns(data, { year: 2025, pair: 'pay-jobs' });
  const c = comparePatternStates(r, 'TX', 'CA').comparison!;
  assert.equal(c.measures[0].primary, null);
  assert.equal(c.measures[0].gap, null);
  assert.notEqual(c.measures[0].secondary, null);
  assert.notEqual(c.measures[1].gap, null);
  assert.equal(r.points.length, 50);
  tx.unemployment!.points.find((p) => p.month === '2025-12')!.value = 4;
  tx.unemployment!.points.find((p) => p.month === '2024-12')!.value = 4;
  const zero = comparePatternStates(
    analyzePatterns(data, { year: 2025, pair: 'pay-unemployment' }),
    'TX',
    'CA',
  ).comparison!;
  assert.equal(zero.measures[0].primary, 0);
  assert.equal(zero.measures[0].gap, -zero.measures[0].secondary!);
});

test('comparison axes include zero and all available years without treating missing values as zero', () => {
  assert.equal(comparisonDomain([null, null]), null);
  assert.deepEqual(comparisonDomain([0, null]), { low: -0.25, high: 0.25 });
  const values = [2, 5, null, -3],
    saved = [...values];
  const d = comparisonDomain(values)!;
  assert.ok(d.low < -3 && d.high > 5);
  assert.deepEqual(values, saved);
  const positive = comparisonDomain([2, 5])!;
  assert.ok(positive.low < 0);
  for (const bad of [NaN, Infinity, -Infinity])
    assert.throws(() => comparisonDomain([bad]), /finite/);
});
