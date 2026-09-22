import { z } from 'zod';
import { echoDataSchema, echoDetailSchema, type EchoDetail } from './echo';
const manifestSchema = z.object({
  formatVersion: z.literal(1),
  release: z.string().regex(/^ep-[a-f0-9]{24}$/),
  dataHash: z.string().regex(/^[a-f0-9]{64}$/),
  publishedAt: z.string().datetime(),
  files: z.record(
    z.string().regex(/^facilities\/[a-z0-9]{2,20}\.json$/),
    z.string().regex(/^[a-f0-9]{64}$/),
  ),
});
async function verified(
  fetcher: typeof fetch,
  url: string,
  expected: string,
  signal?: AbortSignal,
) {
  if (!expected) throw new Error('EPA evidence hash missing');
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error('EPA evidence unavailable');
  const raw = await response.json(),
    digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw)));
  if (
    Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('') !== expected
  )
    throw new Error('EPA evidence integrity failure');
  signal?.throwIfAborted();
  return raw;
}
export async function loadEcho(fetcher: typeof fetch, base = '') {
  const response = await fetcher(`${base}/data/echo/manifest.json`, { cache: 'no-cache' });
  if (!response.ok) throw new Error('EPA collection unavailable');
  const manifest = manifestSchema.parse(await response.json());
  if (manifest.release !== `ep-${manifest.dataHash.slice(0, 24)}`)
    throw new Error('EPA release namespace mismatch');
  const data = echoDataSchema.parse(
    await verified(
      fetcher,
      `${base}/data/echo/releases/${manifest.release}/data.json`,
      manifest.dataHash,
    ),
  );
  if (data.facilities.some((f) => !manifest.files[`facilities/${f.id.toLowerCase()}.json`]))
    throw new Error('EPA detail reference missing');
  return { manifest, data };
}
export function createEchoReader(fetcher: typeof fetch, base = '') {
  const cache = new Map<string, EchoDetail>();
  return async (bundle: Awaited<ReturnType<typeof loadEcho>>, id: string, signal?: AbortSignal) => {
    const summary = bundle.data.facilities.find((f) => f.id === id);
    if (!summary) throw new Error('EPA facility outside loaded collection');
    const file = `facilities/${id.toLowerCase()}.json`,
      checksum = bundle.manifest.files[file],
      key = `${bundle.manifest.release}/${file}/${checksum}`;
    let detail = cache.get(key);
    if (!detail) {
      detail = echoDetailSchema.parse(
        await verified(
          fetcher,
          `${base}/data/echo/releases/${bundle.manifest.release}/${file}`,
          checksum,
          signal,
        ),
      );
      if (JSON.stringify(detail.facility) !== JSON.stringify(summary))
        throw new Error('EPA detail/index mismatch');
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
