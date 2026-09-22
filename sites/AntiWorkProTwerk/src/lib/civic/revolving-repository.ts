import { z } from 'zod';
import { revolvingDataSchema } from './revolving';
export async function loadRevolving(fetcher: typeof fetch, base = '') {
  const pointer = await fetcher(`${base}/data/revolving/manifest.json`, { cache: 'no-cache' });
  if (!pointer.ok) throw new Error('Career index unavailable');
  const manifest = z
    .object({
      formatVersion: z.literal(1),
      release: z.string().regex(/^rd-[a-f0-9]{24}$/),
      dataHash: z.string().regex(/^[a-f0-9]{64}$/),
      publishedAt: z.string().datetime(),
    })
    .parse(await pointer.json());
  const response = await fetcher(`${base}/data/revolving/releases/${manifest.release}/data.json`);
  if (!response.ok) throw new Error('Career release unavailable');
  const raw = await response.json(),
    digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw))),
    checksum = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  if (checksum !== manifest.dataHash || manifest.release !== `rd-${checksum.slice(0, 24)}`)
    throw new Error('Career release integrity failure');
  return { manifest, data: revolvingDataSchema.parse(raw) };
}
