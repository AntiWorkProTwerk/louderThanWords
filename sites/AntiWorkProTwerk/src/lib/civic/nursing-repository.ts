import { z } from 'zod';
import { facilitySummarySchema, type NursingDetail, type NursingParty } from './nursing';
import {
  decodeNursingIndex,
  nursingShard,
  nursingPartyShardSchema,
  nursingFacilityShardSchema,
  validateParties,
} from './nursing-index';

const manifestSchema = z.object({
  formatVersion: z.literal(1),
  release: z.string().regex(/^nh-[a-f0-9]{24}$/),
  dataHash: z.string().regex(/^[a-f0-9]{64}$/),
  publishedAt: z.string().datetime(),
  files: z.record(
    z.string().regex(/^(?:index-v1|parties-v1|(?:facilities|parties)-v1\/[0-3][0-9a-f])\.json$/),
    z.string().regex(/^[a-f0-9]{64}$/),
  ),
});
async function verified(
  fetcher: typeof fetch,
  url: string,
  expected: string,
  signal?: AbortSignal,
) {
  if (!expected) throw new Error('Nursing evidence hash missing');
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error('Nursing evidence unavailable');
  const raw = await response.json();
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(raw)),
  );
  if (
    Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('') !== expected
  )
    throw new Error('Nursing evidence integrity failure');
  signal?.throwIfAborted();
  return raw;
}
export async function loadNursing(fetcher: typeof fetch, base = '') {
  const response = await fetcher(`${base}/data/nursing/manifest.json`, { cache: 'no-cache' });
  if (!response.ok) throw new Error('Nursing collection unavailable');
  const manifest = manifestSchema.parse(await response.json());
  if (manifest.release !== `nh-${manifest.dataHash.slice(0, 24)}`)
    throw new Error('Nursing release mismatch');
  const data = decodeNursingIndex(
    await verified(
      fetcher,
      `${base}/data/nursing/releases/${manifest.release}/index-v1.json`,
      manifest.files['index-v1.json'],
    ),
  );
  if (
    data.dataHash !== manifest.dataHash ||
    data.facilities.some((f) => !manifest.files[nursingShard('facilities', f.id)])
  )
    throw new Error('Nursing index release mismatch');
  return { manifest, data };
}
export type NursingBundle = Awaited<ReturnType<typeof loadNursing>>;
export function createNursingReader(fetcher: typeof fetch, base = '') {
  const cache = new Map<string, NursingDetail[] | NursingParty[]>();
  async function read(
    bundle: NursingBundle,
    file: string,
    kind: 'facilities' | 'parties',
    signal?: AbortSignal,
  ) {
    const key = `${bundle.manifest.release}/${file}/${bundle.manifest.files[file]}`;
    let records = cache.get(key);
    if (!records) {
      const raw = await verified(
        fetcher,
        `${base}/data/nursing/releases/${bundle.manifest.release}/${file}`,
        bundle.manifest.files[file],
        signal,
      );
      const shard =
        kind === 'facilities'
          ? nursingFacilityShardSchema.parse(raw)
          : nursingPartyShardSchema.parse(raw);
      if (shard.dataHash !== bundle.manifest.dataHash)
        throw new Error('Nursing shard release mismatch');
      const ids = shard.records.map((r) => ('facility' in r ? r.facility.id : r.id));
      if (
        new Set(ids).size !== ids.length ||
        (file !== 'parties-v1.json' && ids.some((id) => nursingShard(kind, id) !== file))
      )
        throw new Error('Nursing shard identity mismatch');
      if (kind === 'parties')
        validateParties(
          shard.records as NursingParty[],
          new Set(bundle.data.facilities.map((f) => f.id)),
        );
      else
        for (const detail of shard.records as NursingDetail[]) {
          const summary = bundle.data.facilities.find((f) => f.id === detail.facility.id);
          if (
            !summary ||
            JSON.stringify(facilitySummarySchema.parse(detail.facility)) !== JSON.stringify(summary)
          )
            throw new Error('Nursing detail index mismatch');
        }
      records = shard.records;
      cache.set(key, records);
      while (cache.size > 8) cache.delete(cache.keys().next().value!);
    } else {
      cache.delete(key);
      cache.set(key, records);
    }
    signal?.throwIfAborted();
    return records;
  }
  return {
    async facility(bundle: NursingBundle, id: string, signal?: AbortSignal) {
      if (!bundle.data.facilities.some((f) => f.id === id))
        throw new Error('Facility outside this collection');
      const records = (await read(
        bundle,
        nursingShard('facilities', id),
        'facilities',
        signal,
      )) as NursingDetail[];
      const detail = records.find((r) => r.facility.id === id);
      if (!detail) throw new Error('Nursing facility missing from shard');
      return detail;
    },
    async party(bundle: NursingBundle, id: string, signal?: AbortSignal) {
      const records = (await read(
        bundle,
        nursingShard('parties', id),
        'parties',
        signal,
      )) as NursingParty[];
      const party = records.find((r) => r.id === id);
      if (!party) throw new Error('Disclosed party is not in this collection');
      return party;
    },
    async catalog(bundle: NursingBundle, signal?: AbortSignal) {
      const records = (await read(bundle, 'parties-v1.json', 'parties', signal)) as NursingParty[];
      if (records.length !== bundle.data.partyCount)
        throw new Error('Nursing party catalog count mismatch');
      return records;
    },
  };
}
