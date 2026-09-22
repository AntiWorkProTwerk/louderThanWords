import { z } from 'zod';
import { lobbyingDataSchema } from './lobbying';
export async function loadLobbying(fetcher: typeof fetch, base = '') {
  const pointer = await fetcher(`${base}/data/lobbying/manifest.json`, { cache: 'no-cache' });
  if (!pointer.ok) throw new Error('Lobbying index unavailable');
  const manifest = z
    .object({
      formatVersion: z.literal(1),
      release: z.string().regex(/^la-[a-f0-9]{24}$/),
      dataHash: z.string().regex(/^[a-f0-9]{64}$/),
      publishedAt: z.string().datetime(),
    })
    .parse(await pointer.json());
  const response = await fetcher(`${base}/data/lobbying/releases/${manifest.release}/data.json`);
  if (!response.ok) throw new Error('Lobbying release unavailable');
  const raw = await response.json(),
    digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw))),
    checksum = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  if (checksum !== manifest.dataHash || manifest.release !== `la-${checksum.slice(0, 24)}`)
    throw new Error('Lobbying release integrity failure');
  return { manifest, data: lobbyingDataSchema.parse(raw) };
}
