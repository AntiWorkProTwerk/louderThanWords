import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { patternDirections } from '../src/lib/civic/pattern-directions';
import {
  analyzePatterns,
  patternsDataSchema,
  patternColor,
  type PatternResult,
} from '../src/lib/civic/patterns';

async function snapshot() {
  const root = new URL('../public/data/patterns/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  return patternsDataSchema.parse(
    JSON.parse(await readFile(new URL(`releases/${manifest.release}/data.json`, root), 'utf8')),
  );
}

test('direction groups partition all frozen regions exactly once in every pair and year', async () => {
  const data = await snapshot();
  for (const pair of ['pay-jobs', 'pay-unemployment'] as const)
    for (const year of data.years) {
      const result = analyzePatterns(data, { pair, year });
      const before = JSON.stringify(result);
      const breakdown = patternDirections(result);
      assert.equal(breakdown.total, result.rows.length);
      assert.deepEqual(
        breakdown.groups.flatMap((group) => group.rows.map((row) => row.code)).sort(),
        result.rows.map((row) => row.code).sort(),
      );
      assert.ok(
        Math.abs(breakdown.groups.reduce((total, group) => total + group.share, 0) - 100) < 1e-10,
      );
      for (const group of breakdown.groups) {
        assert.deepEqual(
          group.rows.map((row) => row.name),
          group.rows.map((row) => row.name).sort((a, b) => a.localeCompare(b)),
        );
        for (const row of group.rows)
          if (row.x !== null && row.y !== null)
            assert.equal(group.color, patternColor(row.x, row.y));
      }
      assert.equal(JSON.stringify(result), before);
      assert.match(breakdown.groups[0].label, pair === 'pay-jobs' ? /jobs/ : /unemployment/);
    }
});

test('zeros, tiny changes and partial pairs keep distinct meaning without rounding before classification', async () => {
  const original = analyzePatterns(await snapshot(), { pair: 'pay-unemployment', year: 2025 });
  const values = [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
    [0, 1],
    [-1, 0],
    [-0, 0],
    [null, 1],
    [0, null],
    [0.000001, -0.000001],
  ];
  const rows = values.map(([x, y], i) => ({ ...original.rows[i], x, y }));
  const groups = patternDirections({ ...original, rows }).groups;
  assert.deepEqual(
    groups.map((group) => group.rows.length),
    [1, 1, 2, 1, 3, 2],
  );
  assert.equal(groups[2].rows.find((row) => row.code === rows[9].code)?.x, 0.000001);
  assert.equal(groups[5].rows.find((row) => row.code === rows[7].code)?.y, 1);
});

test('empty collections do not invent shares and invalid changes are rejected', () => {
  const result = { config: { pair: 'pay-jobs' as const, year: 2025 }, rows: [] };
  assert.ok(patternDirections(result).groups.every((group) => group.share === 0));
  for (const bad of [NaN, Infinity, -Infinity])
    assert.throws(
      () =>
        patternDirections({ ...result, rows: [{ x: bad, y: 1 } as PatternResult['rows'][number]] }),
      /finite/,
    );
});
