import { z } from 'zod';
import { economyDataSchema } from './economy';
const releaseSchema = z.string().regex(/^ec-[a-f0-9]{24}$/);
export async function loadEconomy(fetcher: typeof fetch, base = '', pinned?: string | null) {
  let release: string,
    expected: string | null = null;
  if (pinned) release = releaseSchema.parse(pinned);
  else {
    const pointer = await fetcher(`${base}/data/economy/manifest.json`, { cache: 'no-cache' });
    if (!pointer.ok) throw new Error('Economic snapshot unavailable');
    const manifest = z
      .object({
        formatVersion: z.literal(1),
        release: releaseSchema,
        dataHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .parse(await pointer.json());
    release = manifest.release;
    expected = manifest.dataHash;
  }
  const response = await fetcher(`${base}/data/economy/releases/${release}/data.json`);
  if (!response.ok) throw new Error('Frozen economic snapshot unavailable');
  const raw = await response.json(),
    digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw)));
  const dataHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  if ((expected && expected !== dataHash) || release !== `ec-${dataHash.slice(0, 24)}`)
    throw new Error('Economic snapshot integrity check failed');
  return { release, dataHash, data: economyDataSchema.parse(raw) };
}
