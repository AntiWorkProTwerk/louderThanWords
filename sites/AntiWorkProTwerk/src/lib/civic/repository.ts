import { voteDataSchema, voteManifestSchema } from './votes';
import { trialDataSchema } from './trials';
import { z } from 'zod';

export async function loadTrials(fetcher: typeof fetch, base = '') {
  const pointer = await fetcher(`${base}/data/trials/manifest.json`, { cache: 'no-cache' });
  if (!pointer.ok) throw new Error('Trial index is unavailable.');
  const manifest = z
    .object({
      formatVersion: z.literal(1),
      release: z.string().regex(/^tr-[a-f0-9]{24}$/),
      dataHash: z.string().regex(/^[a-f0-9]{64}$/),
      publishedAt: z.string().datetime(),
    })
    .parse(await pointer.json());
  const response = await fetcher(`${base}/data/trials/releases/${manifest.release}/data.json`);
  if (!response.ok) throw new Error('Trial release is unavailable.');
  const raw = await response.json();
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(raw)),
  );
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  if (hash !== manifest.dataHash || manifest.release !== `tr-${hash.slice(0, 24)}`)
    throw new Error('Trial release integrity check failed');
  return { manifest, data: trialDataSchema.parse(raw) };
}

export async function loadVotes(fetcher: typeof fetch, base = '') {
  const pointer = await fetcher(`${base}/data/votes/manifest.json`, { cache: 'no-cache' });
  if (!pointer.ok) throw new Error('Vote receipt index is unavailable.');
  const manifest = voteManifestSchema.parse(await pointer.json());
  const response = await fetcher(`${base}/data/votes/releases/${manifest.release}/data.json`);
  if (!response.ok) throw new Error('This vote receipt release is unavailable.');
  const raw = await response.json();
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(raw)),
  );
  const checksum = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  if (checksum !== manifest.dataHash || manifest.release !== `vr-${checksum.slice(0, 24)}`)
    throw new Error('Vote receipt release integrity check failed.');
  const data = voteDataSchema.parse(raw);
  return { manifest, data };
}
