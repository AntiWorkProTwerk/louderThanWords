import { z } from 'zod';
import { wageDataSchema, wageSummarySchema, type WageCase } from './wages';
import { decodeWageIndex, wageShard, wageShardSchema } from './wage-index';
export async function loadWages(fetcher: typeof fetch, base = '') {
  const pointer = await fetcher(`${base}/data/wages/manifest.json`, { cache: 'no-cache' });
  if (!pointer.ok) throw new Error('Wage ledger index unavailable');
  const manifest = z
    .object({
      formatVersion: z.literal(1),
      release: z.string().regex(/^wl-[a-f0-9]{24}$/),
      dataHash: z.string().regex(/^[a-f0-9]{64}$/),
      publishedAt: z.string().datetime(),
    })
    .parse(await pointer.json());
  const response = await fetcher(`${base}/data/wages/releases/${manifest.release}/data.json`);
  if (!response.ok) throw new Error('Wage ledger release unavailable');
  const raw = await response.json(),
    digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw))),
    checksum = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  if (checksum !== manifest.dataHash || manifest.release !== `wl-${checksum.slice(0, 24)}`)
    throw new Error('Wage ledger release integrity failure');
  return { manifest, data: wageDataSchema.parse(raw) };
}

const indexedManifestSchema = z.object({
  formatVersion: z.literal(1),
  release: z.string().regex(/^wl-[a-f0-9]{24}$/),
  dataHash: z.string().regex(/^[a-f0-9]{64}$/),
  publishedAt: z.string().datetime(),
  files: z.record(
    z.string().regex(/^(?:index-v1|cases-v1\/[0-3][0-9a-f])\.json$/),
    z.string().regex(/^[a-f0-9]{64}$/),
  ),
});
async function readVerified(
  fetcher: typeof fetch,
  url: string,
  expected: string,
  signal?: AbortSignal,
) {
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error('Wage evidence file unavailable');
  const raw = await response.json(),
    digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw)));
  const checksum = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  if (checksum !== expected) throw new Error('Wage evidence integrity failure');
  signal?.throwIfAborted();
  return raw;
}
export async function loadWageIndex(fetcher: typeof fetch, base = '') {
  const response = await fetcher(`${base}/data/wages/manifest.json`, { cache: 'no-cache' });
  if (!response.ok) throw new Error('Wage ledger index unavailable');
  const manifest = indexedManifestSchema.parse(await response.json()),
    expected = manifest.files['index-v1.json'];
  if (!expected || manifest.release !== `wl-${manifest.dataHash.slice(0, 24)}`)
    throw new Error('Wage index manifest integrity failure');
  const data = decodeWageIndex(
    await readVerified(
      fetcher,
      `${base}/data/wages/releases/${manifest.release}/index-v1.json`,
      expected,
    ),
  );
  if (data.dataHash !== manifest.dataHash)
    throw new Error('Wage index belongs to a different release');
  for (const record of data.records)
    if (!manifest.files[wageShard(record.id)]) throw new Error('Wage case shard reference missing');
  return { manifest, data };
}
export function createWageDetailReader(fetcher: typeof fetch, base = '') {
  const cache = new Map<string, WageCase[]>();
  return async (
    bundle: Awaited<ReturnType<typeof loadWageIndex>>,
    id: string,
    signal?: AbortSignal,
  ) => {
    const summary = bundle.data.records.find((r) => r.id === id);
    if (!summary) throw new Error('This case is not in the loaded collection');
    const file = wageShard(id),
      checksum = bundle.manifest.files[file];
    if (!checksum) throw new Error('Wage case evidence reference missing');
    const key = `${bundle.manifest.release}/${file}/${checksum}`;
    let records = cache.get(key);
    if (!records) {
      const raw = await readVerified(
        fetcher,
        `${base}/data/wages/releases/${bundle.manifest.release}/${file}`,
        checksum,
        signal,
      );
      const shard = wageShardSchema.parse(raw);
      if (
        shard.dataHash !== bundle.manifest.dataHash ||
        shard.records.some((r) => wageShard(r.id) !== file) ||
        new Set(shard.records.map((r) => r.id)).size !== shard.records.length
      )
        throw new Error('Wage shard identity mismatch');
      records = shard.records;
      cache.set(key, records);
      while (cache.size > 8) cache.delete(cache.keys().next().value!);
    } else {
      cache.delete(key);
      cache.set(key, records);
    }
    signal?.throwIfAborted();
    const record = records.find((r) => r.id === id);
    if (!record || JSON.stringify(wageSummarySchema.parse(record)) !== JSON.stringify(summary))
      throw new Error('Wage case does not match the loaded index');
    return record;
  };
}
