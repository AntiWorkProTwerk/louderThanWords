import { z } from 'zod';
import { paycheckDataSchema } from './paycheck';
export async function loadPaycheck(fetcher: typeof fetch, base = '', pinned?: string | null) {
  let release: string,
    expected: string | null = null;
  const id = z.string().regex(/^pc-[a-f0-9]{24}$/);
  if (pinned) release = id.parse(pinned);
  else {
    const pointer = await fetcher(`${base}/data/paycheck/manifest.json`, { cache: 'no-cache' });
    if (!pointer.ok) throw new Error('Paycheck index unavailable');
    const manifest = z
      .object({
        formatVersion: z.literal(1),
        release: id,
        dataHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .parse(await pointer.json());
    release = manifest.release;
    expected = manifest.dataHash;
  }
  const response = await fetcher(`${base}/data/paycheck/releases/${release}/data.json`);
  if (!response.ok) throw new Error('Frozen paycheck snapshot unavailable');
  const raw = await response.json(),
    digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw)));
  const dataHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  if ((expected && expected !== dataHash) || release !== `pc-${dataHash.slice(0, 24)}`)
    throw new Error('Paycheck snapshot integrity check failed');
  return { release, dataHash, data: paycheckDataSchema.parse(raw) };
}
