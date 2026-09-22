import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildConnections } from '../scripts/civic/connections';
import {
  connectionStateCounts,
  connectionsDataSchema,
  filterConnections,
} from '../src/lib/civic/connections';
import { loadConnections } from '../src/lib/civic/connections-repository';
import { insiderDataSchema } from '../src/lib/civic/insiders';
import { stakeDataSchema } from '../src/lib/civic/major-stakes';
import { sharedDataSchema } from '../src/lib/civic/shared-investors';
import { hash } from '../scripts/said-did/engine';

async function snapshot(kind: string) {
  const root = new URL(`../public/data/${kind}/`, import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const data = JSON.parse(
    await readFile(new URL(`releases/${manifest.release}/data.json`, root), 'utf8'),
  );
  assert.equal(hash(data), manifest.dataHash);
  return { manifest, data };
}
test('connections reproduce only exact issuer-ID intersections with separate source dates and units', async () => {
  const [a, b, c, d] = await Promise.all(
    ['insiders', 'major-stakes', 'shared-investors', 'connections'].map(snapshot),
  );
  const insiders = insiderDataSchema.parse(a.data),
    stakes = stakeDataSchema.parse(b.data),
    shared = sharedDataSchema.parse(c.data);
  const saved = connectionsDataSchema.parse(d.data),
    built = buildConnections(insiders, stakes, shared, saved.upstream);
  assert.deepEqual(built, saved);
  assert.equal(built.entities.length, 3);
  const microsoft = built.entities.find((e) => e.cik === '0000789019')!;
  assert.equal(microsoft.views.length, 3);
  assert.equal(microsoft.state, 'WA');
  for (const e of built.entities)
    for (const view of e.views) {
      const url = new URL(view.href, 'https://local.example');
      assert.equal(
        url.searchParams.get(view.kind === 'shared-investors' ? 'company' : 'issuer'),
        e.cik,
      );
      assert.ok(view.from <= view.through);
    }
  // Identical company names do not join unrelated IDs; unavailable cells are not records.
  const unrelated = structuredClone(shared);
  unrelated.companies.forEach((c) => (c.name = 'MICROSOFT CORP'));
  assert.deepEqual(
    buildConnections(insiders, stakes, unrelated, saved.upstream).entities.map((e) => e.cik),
    built.entities.map((e) => e.cik),
  );
  const absent = structuredClone(shared);
  absent.cells.forEach((cell) => (cell.status = 'unavailable'));
  const reduced = buildConnections(insiders, stakes, absent, saved.upstream);
  assert.deepEqual(
    reduced.entities.map((e) => e.cik),
    ['0000789019'],
  );
  assert.ok(reduced.entities.every((e) => e.views.length === 2));
  const conflict = structuredClone(insiders);
  conflict.issuers.find((i) => i.cik === '0000789019')!.state = 'NY';
  const changed = buildConnections(conflict, stakes, shared, saved.upstream).entities.find(
    (e) => e.cik === '0000789019',
  )!;
  assert.equal(changed.state, null);
  assert.match(changed.geography, /differ/);
});
test('connection filters and map counts use companies rather than adding incompatible record counts', async () => {
  const { data } = await snapshot('connections');
  const parsed = connectionsDataSchema.parse(data);
  assert.equal(filterConnections(parsed, new URLSearchParams('q=msft')).length, 1);
  assert.equal(filterConnections(parsed, new URLSearchParams('state=TX')).length, 0);
  assert.deepEqual(connectionStateCounts(parsed, new URLSearchParams('state=TX')), {
    NY: 1,
    WA: 1,
    CA: 1,
  });
  assert.deepEqual(connectionStateCounts(parsed, new URLSearchParams('depth=3')), { WA: 1 });
});
test('connection reader rejects tampered frozen data and malformed manifests', async () => {
  const { manifest, data } = await snapshot('connections');
  const fetcher = (async (url: RequestInfo | URL) =>
    new Response(
      JSON.stringify(String(url).endsWith('manifest.json') ? manifest : data),
    )) as typeof fetch;
  const valid = await loadConnections(fetcher);
  assert.deepEqual(valid.data, connectionsDataSchema.parse(data));
  const bad = structuredClone(data);
  bad.entities[0].views[0].count++;
  await assert.rejects(
    () =>
      loadConnections(
        (async (url: RequestInfo | URL) =>
          new Response(
            JSON.stringify(String(url).endsWith('manifest.json') ? manifest : bad),
          )) as typeof fetch,
      ),
    /verification/,
  );
  await assert.rejects(
    () =>
      loadConnections(
        (async () =>
          new Response(JSON.stringify({ ...manifest, release: '../../secret' }))) as typeof fetch,
      ),
    /Invalid/,
  );
});
