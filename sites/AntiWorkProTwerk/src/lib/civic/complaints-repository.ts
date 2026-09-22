import { z } from 'zod';
import { complaintDataSchema } from './complaints';
export async function loadComplaints(fetcher: typeof fetch, base = '') {
  const pointer = await fetcher(`${base}/data/complaints/manifest.json`, { cache: 'no-cache' });
  if (!pointer.ok) throw new Error('Complaint index unavailable');
  const manifest = z
    .object({
      formatVersion: z.literal(1),
      release: z.string().regex(/^cr-[a-f0-9]{24}$/),
      dataHash: z.string().regex(/^[a-f0-9]{64}$/),
      publishedAt: z.string().datetime(),
    })
    .parse(await pointer.json());
  const response = await fetcher(`${base}/data/complaints/releases/${manifest.release}/data.json`);
  if (!response.ok) throw new Error('Complaint release unavailable');
  const raw = await response.json(),
    digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw))),
    hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  if (hash !== manifest.dataHash || manifest.release !== `cr-${hash.slice(0, 24)}`)
    throw new Error('Complaint release integrity failure');
  return { manifest, data: complaintDataSchema.parse(raw) };
}
