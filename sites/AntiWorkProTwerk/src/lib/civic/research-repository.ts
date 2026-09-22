import { z } from 'zod';
import { researchDataSchema } from './research';

export async function loadResearch(fetcher: typeof fetch, base = '') {
  const pointer = await fetcher(`${base}/data/research/manifest.json`, { cache: 'no-cache' });
  if (!pointer.ok) throw new Error('Research funding index unavailable');
  const manifest = z
    .object({
      formatVersion: z.literal(1),
      release: z.string().regex(/^rf-[a-f0-9]{24}$/),
      dataHash: z.string().regex(/^[a-f0-9]{64}$/),
      publishedAt: z.string().datetime(),
    })
    .parse(await pointer.json());
  const response = await fetcher(`${base}/data/research/releases/${manifest.release}/data.json`);
  if (!response.ok) throw new Error('Research funding release unavailable');
  const raw = await response.json();
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(raw)),
  );
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  if (hash !== manifest.dataHash || manifest.release !== `rf-${hash.slice(0, 24)}`)
    throw new Error('Research funding integrity check failed');
  return { manifest, data: researchDataSchema.parse(raw) };
}
