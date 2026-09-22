import { z } from 'zod';
import { insiderDataSchema, insiderDetailSchema, type InsiderDetail } from './insiders';
const manifestSchema = z.object({
  formatVersion: z.literal(1),
  release: z.string().regex(/^it-[a-f0-9]{24}$/),
  dataHash: z.string().regex(/^[a-f0-9]{64}$/),
  publishedAt: z.string().datetime(),
  files: z.record(
    z.string().regex(/^filings\/\d{10}-\d{2}-\d{6}\.json$/),
    z.string().regex(/^[a-f0-9]{64}$/),
  ),
});
async function verified(
  fetcher: typeof fetch,
  url: string,
  expected: string,
  signal?: AbortSignal,
) {
  if (!expected) throw new Error('Insider evidence hash missing');
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error('Insider evidence unavailable');
  const raw = await response.json(),
    digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw)));
  if (
    Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('') !== expected
  )
    throw new Error('Insider evidence integrity failure');
  signal?.throwIfAborted();
  return raw;
}
export async function loadInsiders(fetcher: typeof fetch, base = '') {
  const response = await fetcher(`${base}/data/insiders/manifest.json`, { cache: 'no-cache' });
  if (!response.ok) throw new Error('Insider collection unavailable');
  const manifest = manifestSchema.parse(await response.json());
  if (manifest.release !== `it-${manifest.dataHash.slice(0, 24)}`)
    throw new Error('Insider release namespace mismatch');
  const data = insiderDataSchema.parse(
    await verified(
      fetcher,
      `${base}/data/insiders/releases/${manifest.release}/data.json`,
      manifest.dataHash,
    ),
  );
  if (
    data.filings.some(
      (f) =>
        !manifest.files[`filings/${f.accession}.json`] ||
        !data.issuers.some((i) => i.cik === f.issuerCik),
    )
  )
    throw new Error('Insider detail/issuer reference missing');
  return { manifest, data };
}
export function createInsiderReader(fetcher: typeof fetch, base = '') {
  const cache = new Map<string, InsiderDetail>();
  return async (
    bundle: Awaited<ReturnType<typeof loadInsiders>>,
    accession: string,
    signal?: AbortSignal,
  ) => {
    const summary = bundle.data.filings.find((f) => f.accession === accession);
    if (!summary) throw new Error('Insider filing outside collection');
    signal?.throwIfAborted();
    const file = `filings/${accession}.json`,
      checksum = bundle.manifest.files[file],
      key = `${bundle.manifest.release}/${file}/${checksum}`;
    let detail = cache.get(key);
    if (!detail) {
      detail = insiderDetailSchema.parse(
        await verified(
          fetcher,
          `${base}/data/insiders/releases/${bundle.manifest.release}/${file}`,
          checksum,
          signal,
        ),
      );
      if (JSON.stringify(detail.filing) !== JSON.stringify(summary))
        throw new Error('Insider detail/index mismatch');
      cache.set(key, detail);
      while (cache.size > 6) cache.delete(cache.keys().next().value!);
    } else {
      cache.delete(key);
      cache.set(key, detail);
    }
    signal?.throwIfAborted();
    return detail;
  };
}
