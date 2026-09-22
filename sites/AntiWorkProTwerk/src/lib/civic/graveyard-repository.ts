import { z } from 'zod';
import { graveyardDataSchema, billDetailSchema, type BillDetail } from './graveyard';

const manifestSchema = z.object({
  formatVersion: z.literal(1),
  release: z.string().regex(/^bg-[a-f0-9]{24}$/),
  dataHash: z.string().regex(/^[a-f0-9]{64}$/),
  publishedAt: z.string().datetime(),
  files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
});
async function checksum(value: unknown) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
export async function loadGraveyard(fetcher: typeof fetch, base = '') {
  const pointer = await fetcher(`${base}/data/graveyard/manifest.json`, { cache: 'no-cache' });
  if (!pointer.ok) throw new Error('Bill index unavailable');
  const manifest = manifestSchema.parse(await pointer.json());
  const response = await fetcher(`${base}/data/graveyard/releases/${manifest.release}/data.json`);
  if (!response.ok) throw new Error('Bill release unavailable');
  const raw = await response.json(),
    digest = await checksum(raw);
  if (digest !== manifest.dataHash || manifest.release !== `bg-${digest.slice(0, 24)}`)
    throw new Error('Bill index integrity failure');
  const data = graveyardDataSchema.parse(raw);
  for (const b of data.bills)
    if (!manifest.files[`bills/${b.id}.json`]) throw new Error('Missing bill detail reference');
  return { manifest, data };
}
export type GraveyardSnapshot = Awaited<ReturnType<typeof loadGraveyard>>;
const cache = new Map<string, BillDetail>();
export async function loadBillDetail(
  snapshot: GraveyardSnapshot,
  id: string,
  fetcher: typeof fetch,
  base = '',
  signal?: AbortSignal,
) {
  const bill = snapshot.data.bills.find((b) => b.id === id);
  if (!bill) throw new Error('Bill is outside this collection');
  const key = `${snapshot.manifest.release}:${id}`,
    cached = cache.get(key);
  if (cached) return cached;
  const file = `bills/${id}.json`,
    response = await fetcher(
      `${base}/data/graveyard/releases/${snapshot.manifest.release}/${file}`,
      { signal },
    );
  if (!response.ok) throw new Error('Bill detail unavailable');
  const raw = await response.json();
  if ((await checksum(raw)) !== snapshot.manifest.files[file])
    throw new Error('Bill detail integrity failure');
  const detail = billDetailSchema.parse(raw);
  if (JSON.stringify(detail.bill) !== JSON.stringify(bill))
    throw new Error('Bill detail does not match this index');
  cache.set(key, detail);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  return detail;
}
