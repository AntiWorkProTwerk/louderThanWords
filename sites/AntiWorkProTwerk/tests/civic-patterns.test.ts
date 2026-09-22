import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from '../scripts/said-did/engine';
import { buildPatterns, runPatterns } from '../scripts/civic/patterns';
import { paycheckDataSchema } from '../src/lib/civic/paycheck';
import { economyDataSchema } from '../src/lib/civic/economy';
import {
  patternsDataSchema,
  analyzePatterns,
  pearson,
  patternSelection,
  patternMapMetrics,
} from '../src/lib/civic/patterns';
import { loadPatterns } from '../src/lib/civic/patterns-repository';

async function snapshot(kind: string) {
  const root = new URL(`../public/data/${kind}/`, import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const data = JSON.parse(
    await readFile(new URL(`releases/${manifest.release}/data.json`, root), 'utf8'),
  );
  assert.equal(hash(data), manifest.dataHash);
  return { manifest, data };
}
test('patterns reproduce exact dated state/series joins from two immutable upstream collections', async () => {
  const [a, b, c] = await Promise.all(['paycheck', 'economy', 'patterns'].map(snapshot));
  const pay = paycheckDataSchema.parse(a.data),
    economy = economyDataSchema.parse(b.data),
    saved = patternsDataSchema.parse(c.data);
  assert.deepEqual(buildPatterns(pay, economy, saved.upstream), saved);
  assert.equal(saved.states.length, 51);
  assert.deepEqual(saved.years, [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
  for (const s of saved.states)
    for (const [field, source] of [
      ['earnings', pay],
      ['jobs', pay],
      ['unemployment', economy],
    ] as const) {
      const series = s[field]!;
      assert.ok(series);
      const original = source.series.find((p) => p.id === series.id)!;
      for (const point of series.points)
        assert.deepEqual(
          point,
          original.points.find((p) => p.month === point.month),
        );
    }
  const result = analyzePatterns(saved, { year: 2025, pair: 'pay-unemployment' }),
    tx = result.rows.find((s) => s.code === 'TX')!;
  const txPay = pay.series.find((s) => s.id === 'SMU48000000500000003')!;
  const txUnemployment = economy.series.find((s) => s.id === 'LASST480000000000003')!;
  const at = (s: typeof txPay | typeof txUnemployment, m: string) =>
    s.points.find((p) => p.month === m)!.value!;
  assert.equal(tx.x, at(txUnemployment, '2025-12') - at(txUnemployment, '2024-12'));
  assert.equal(tx.y, (at(txPay, '2025-12') / at(txPay, '2024-12') - 1) * 100);
  assert.equal(result.points.length, 51);
  const duplicate = structuredClone(economy);
  duplicate.series.push(duplicate.series.find((s) => s.state === 'TX')!);
  assert.throws(() => buildPatterns(pay, duplicate, saved.upstream), /Ambiguous/);
  const wrongId = structuredClone(economy);
  wrongId.series.find((s) => s.state === 'TX')!.id = 'LASST060000000000003';
  assert.throws(() => buildPatterns(pay, wrongId, saved.upstream), /Unexpected/);
});
test('Pearson uses complete finite pairs and refuses constant or insufficient samples', () => {
  assert.equal(
    pearson([
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 7 },
    ]),
    1,
  );
  assert.equal(
    pearson([
      { x: 1, y: 7 },
      { x: 2, y: 5 },
      { x: 3, y: 3 },
    ]),
    -1,
  );
  assert.equal(
    pearson([
      { x: -1, y: 1 },
      { x: 0, y: -2 },
      { x: 1, y: 1 },
    ]),
    0,
  );
  assert.equal(
    pearson([
      { x: 1, y: 3 },
      { x: 1, y: 5 },
      { x: 1, y: 7 },
    ]),
    null,
  );
  assert.equal(
    pearson([
      { x: 1, y: 3 },
      { x: 2, y: 4 },
    ]),
    null,
  );
  assert.throws(
    () =>
      pearson([
        { x: 1, y: NaN },
        { x: 2, y: 3 },
        { x: 3, y: 4 },
      ]),
    /finite/,
  );
});
test('missing endpoints never become zero, unemployment uses point differences, and selection does not shrink the cohort', async () => {
  const { data } = await snapshot('patterns');
  const input = patternsDataSchema.parse(data);
  const tx = input.states.find((s) => s.code === 'TX')!;
  tx.earnings!.points.find((p) => p.month === '2025-12')!.value = null;
  let result = analyzePatterns(input, { year: 2025, pair: 'pay-unemployment' });
  assert.equal(result.points.length, 50);
  assert.ok(result.excluded.some((s) => s.code === 'TX'));
  assert.equal(
    patternMapMetrics(input, new URLSearchParams('state=TX&pair=pay-unemployment')).TX,
    undefined,
  );
  tx.earnings!.points.find((p) => p.month === '2025-12')!.value = 0;
  tx.unemployment!.points.find((p) => p.month === '2024-12')!.value = 0;
  tx.unemployment!.points.find((p) => p.month === '2025-12')!.value = 2;
  result = analyzePatterns(input, { year: 2025, pair: 'pay-unemployment' });
  assert.equal(result.rows.find((s) => s.code === 'TX')!.x, 2);
  assert.equal(result.rows.find((s) => s.code === 'TX')!.y, -100);
  assert.equal(result.points.length, 51);
  tx.jobs!.points.find((p) => p.month === '2024-12')!.value = 0;
  assert.equal(
    analyzePatterns(input, { year: 2025, pair: 'pay-jobs' }).rows.find((s) => s.code === 'TX')!.x,
    null,
  );
  assert.deepEqual(
    patternSelection(input, new URLSearchParams('state=TX')),
    patternSelection(input, new URLSearchParams('state=CA')),
  );
  assert.deepEqual(
    patternMapMetrics(input, new URLSearchParams('state=TX')),
    patternMapMetrics(input, new URLSearchParams('state=CA')),
  );
  assert.throws(() => patternSelection(input, new URLSearchParams('year=2050')), /year/);
  assert.throws(() => patternSelection(input, new URLSearchParams('pair=secret')));
});
test('patterns publish reproducibly without services and pinned readers reject corrupted or unavailable data', async () => {
  const output = await mkdtemp(join(tmpdir(), 'ltw-patterns-'));
  const root = new URL('../public/data/', import.meta.url);
  const { fileURLToPath } = await import('node:url');
  const one = await runPatterns(fileURLToPath(root), output),
    two = await runPatterns(fileURLToPath(root), output);
  assert.deepEqual(one, two);
  const { manifest, data } = await snapshot('patterns');
  const fetcher = (async (url: RequestInfo | URL) =>
    new Response(
      JSON.stringify(String(url).endsWith('manifest.json') ? manifest : data),
    )) as typeof fetch;
  assert.deepEqual((await loadPatterns(fetcher)).data, data);
  assert.equal((await loadPatterns(fetcher, '', manifest.release)).release, manifest.release);
  const corrupt = structuredClone(data);
  corrupt.states[0].earnings.points[0].value++;
  await assert.rejects(
    () =>
      loadPatterns(
        (async () => new Response(JSON.stringify(corrupt))) as typeof fetch,
        '',
        manifest.release,
      ),
    /integrity/,
  );
  await assert.rejects(
    () =>
      loadPatterns(
        (async () => new Response('', { status: 404 })) as typeof fetch,
        '',
        manifest.release,
      ),
    /unavailable/,
  );
  await assert.rejects(() => loadPatterns(fetcher, '', '../../escape'), /Invalid/);
});
