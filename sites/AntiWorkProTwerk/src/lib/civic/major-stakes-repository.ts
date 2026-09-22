import { z } from 'zod';
import { stakeDataSchema, stakeDetailSchema } from './major-stakes';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema = z.object({
  formatVersion: z.literal(1),
  release: z.string().regex(/^ms-[a-f0-9]{24}$/),
  dataHash: digest,
  publishedAt: z.string().datetime(),
  files: z.record(z.string().regex(/^filings\/\d{10}-\d{2}-\d{6}\.json$/), digest),
});
async function verified(
  fetcher: typeof fetch,
  url: string,
  expected: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error('Stake evidence unavailable');
  const raw = await response.json(),
    actual = Array.from(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw))),
      ),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
  if (actual !== expected) throw new Error('Stake evidence integrity failure');
  signal?.throwIfAborted();
  return raw;
}
export async function loadStakes(fetcher: typeof fetch, base = '') {
  const r = await fetcher(`${base}/data/major-stakes/manifest.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error('Stake collection unavailable');
  const manifest = manifestSchema.parse(await r.json());
  if (manifest.release !== `ms-${manifest.dataHash.slice(0, 24)}`)
    throw new Error('Stake release mismatch');
  const data = stakeDataSchema.parse(
    await verified(
      fetcher,
      `${base}/data/major-stakes/releases/${manifest.release}/data.json`,
      manifest.dataHash,
    ),
  );
  const ids = data.series.flatMap((s) => s.filings);
  if (
    new Set(data.filings.map((f) => f.accession)).size !== data.filings.length ||
    new Set(data.series.map((s) => s.id)).size !== data.series.length ||
    new Set(data.issuers.map((i) => i.cik)).size !== data.issuers.length ||
    data.issuers.length !== data.plan.issuers.length ||
    data.plan.issuers.some((c) => !data.issuers.some((i) => i.cik === c)) ||
    Object.keys(manifest.files).length !== data.filings.length ||
    ids.length !== data.filings.length ||
    new Set(ids).size !== ids.length ||
    data.filings.some(
      (f) =>
        !manifest.files[`filings/${f.accession}.json`] ||
        !data.plan.issuers.includes(f.issuerCik) ||
        f.filed < data.plan.from ||
        f.filed > data.plan.through,
    ) ||
    data.series.some(
      (s) =>
        s.filings.some((id) => {
          const f = data.filings.find((f) => f.accession === id);
          return (
            !f ||
            f.issuerCik !== s.issuerCik ||
            f.filerCik !== s.filerCik ||
            JSON.stringify(f.cusips) !== JSON.stringify(s.cusips)
          );
        }) ||
        s.initialSchedules.some(
          (id) =>
            !s.filings.includes(id) ||
            data.filings.find((f) => f.accession === id)!.form.endsWith('/A'),
        ),
    )
  )
    throw new Error('Stake index references invalid');
  return { manifest, data };
}
export type StakeBundle = Awaited<ReturnType<typeof loadStakes>>;
export async function readStakeDetail(
  fetcher: typeof fetch,
  bundle: StakeBundle,
  accession: string,
  base = '',
  signal?: AbortSignal,
) {
  const f = bundle.data.filings.find((f) => f.accession === accession),
    file = `filings/${accession}.json`;
  if (!f || !bundle.manifest.files[file]) throw new Error('Filing outside stake collection');
  const detail = stakeDetailSchema.parse(
    await verified(
      fetcher,
      `${base}/data/major-stakes/releases/${bundle.manifest.release}/${file}`,
      bundle.manifest.files[file],
      signal,
    ),
  );
  if (
    JSON.stringify(detail.filing) !== JSON.stringify(f) ||
    new Set(detail.fields.map((f) => f.path)).size !== detail.fields.length
  )
    throw new Error('Stake filing/index identity mismatch');
  return detail;
}
