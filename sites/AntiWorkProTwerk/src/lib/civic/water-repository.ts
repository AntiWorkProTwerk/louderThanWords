import { z } from 'zod';
import { waterDataSchema, waterDetailSchema, type WaterDetail } from './water';
const manifestSchema = z.object({
  formatVersion: z.literal(1),
  release: z.string().regex(/^sw-[a-f0-9]{24}$/),
  dataHash: z.string().regex(/^[a-f0-9]{64}$/),
  publishedAt: z.string().datetime(),
  files: z.record(
    z.string().regex(/^systems\/[a-z0-9]{9}\.json$/),
    z.string().regex(/^[a-f0-9]{64}$/),
  ),
});
async function verified(
  fetcher: typeof fetch,
  url: string,
  expected: string,
  signal?: AbortSignal,
) {
  if (!expected) throw new Error('Water evidence hash missing');
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error('Water evidence unavailable');
  const raw = await response.json(),
    digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw)));
  if (
    Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('') !== expected
  )
    throw new Error('Water evidence integrity failure');
  signal?.throwIfAborted();
  return raw;
}
export async function loadWater(fetcher: typeof fetch, base = '') {
  const response = await fetcher(`${base}/data/water/manifest.json`, { cache: 'no-cache' });
  if (!response.ok) throw new Error('Water collection unavailable');
  const manifest = manifestSchema.parse(await response.json());
  if (manifest.release !== `sw-${manifest.dataHash.slice(0, 24)}`)
    throw new Error('Water release namespace mismatch');
  const data = waterDataSchema.parse(
    await verified(
      fetcher,
      `${base}/data/water/releases/${manifest.release}/data.json`,
      manifest.dataHash,
    ),
  );
  if (data.systems.some((s) => !manifest.files[`systems/${s.id.toLowerCase()}.json`]))
    throw new Error('Water detail reference missing');
  return { manifest, data };
}
export function createWaterReader(fetcher: typeof fetch, base = '') {
  const cache = new Map<string, WaterDetail>();
  return async (
    bundle: Awaited<ReturnType<typeof loadWater>>,
    id: string,
    signal?: AbortSignal,
  ) => {
    const summary = bundle.data.systems.find((s) => s.id === id);
    if (!summary) throw new Error('Water system outside collection');
    signal?.throwIfAborted();
    const file = `systems/${id.toLowerCase()}.json`,
      checksum = bundle.manifest.files[file],
      key = `${bundle.manifest.release}/${file}/${checksum}`;
    let detail = cache.get(key);
    if (!detail) {
      detail = waterDetailSchema.parse(
        await verified(
          fetcher,
          `${base}/data/water/releases/${bundle.manifest.release}/${file}`,
          checksum,
          signal,
        ),
      );
      if (
        JSON.stringify(detail.system) !== JSON.stringify(summary) ||
        detail.quarter !== bundle.data.quarter
      )
        throw new Error('Water detail/index mismatch');
      cache.set(key, detail);
      while (cache.size > 8) cache.delete(cache.keys().next().value!);
    } else {
      cache.delete(key);
      cache.set(key, detail);
    }
    signal?.throwIfAborted();
    return detail;
  };
}
