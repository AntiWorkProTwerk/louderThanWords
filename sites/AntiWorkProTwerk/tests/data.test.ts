import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareRelease, publishLocal } from '../scripts/pipeline';
import { createRepository } from '../src/lib/data/repository';
import { collectSource } from '../scripts/collect-source';

test('demo releases cover all states, have consistent totals, and are deterministic', async () => {
  const first = await prepareRelease(),
    second = await prepareRelease();
  assert.equal(first.manifest.states.length, 51);
  assert.equal(first.manifest.release, second.manifest.release);
  assert.deepEqual(first.files, second.files);
  for (const state of first.manifest.states) {
    const summary = JSON.parse(first.files[`states/${state.code}/summary.json`]);
    for (const p of summary.people) {
      const detail = JSON.parse(first.files[`politicians/${p.id}.json`]);
      assert.equal(detail.release, first.manifest.release);
      assert.equal(detail.state, state.code);
      assert.ok(
        Math.abs(
          detail.donors.reduce((sum: number, d: { amount: number }) => sum + d.amount, 0) -
            detail.donations,
        ) < 0.01,
      );
    }
  }
});
test('publishing is idempotent and a failed validation preserves the published manifest', async () => {
  const output = await mkdtemp(join(tmpdir(), 'ltw-publish-test-'));
  const manifest = await publishLocal(output);
  const before = await readFile(join(output, 'manifest.json'), 'utf8');
  await publishLocal(output);
  assert.equal(await readFile(join(output, 'manifest.json'), 'utf8'), before);
  await writeFile(
    join(output, 'releases', manifest.release, 'politicians/cruz.json'),
    'invalid fixture',
  );
  await assert.rejects(() => publishLocal(output), /Immutable release differs/);
  assert.equal(await readFile(join(output, 'manifest.json'), 'utf8'), before);
});
test('repository pins requests to a release and rejects stale or invalid results', async () => {
  const { manifest, files } = await prepareRelease();
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push(String(input));
    assert.ok(init?.signal);
    return Response.json(JSON.parse(files['politicians/cruz.json']));
  };
  const repository = createRepository('/test', fetcher),
    controller = new AbortController();
  const p = await repository.getPolitician(manifest.release, 'cruz', controller.signal);
  assert.equal(p.id, 'cruz');
  assert.equal(requests[0], `/test/data/releases/${manifest.release}/politicians/cruz.json`);
  await assert.rejects(
    () => repository.getPolitician('different-release', 'cruz', controller.signal),
    /version mismatch/,
  );
  await assert.rejects(() =>
    repository.getPolitician(manifest.release, '../private', controller.signal),
  );
});
test('collection refuses non-allowlisted sources before making a request', async () => {
  const archive = await mkdtemp(join(tmpdir(), 'ltw-source-test-'));
  await assert.rejects(
    () =>
      collectSource({
        id: 'source',
        url: 'https://example.com/data',
        allowedHosts: ['data.example.org'],
        archiveDirectory: archive,
        minIntervalMs: 0,
      }),
    /allowlisted/,
  );
});
