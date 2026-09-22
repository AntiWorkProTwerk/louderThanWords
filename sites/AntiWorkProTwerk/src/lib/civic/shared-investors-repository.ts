import { z } from 'zod';
import { sharedDataSchema, sharedEvidenceSchema } from './shared-investors';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema = z.object({
  formatVersion: z.literal(1),
  release: z.string().regex(/^si-[a-f0-9]{24}$/),
  dataHash: digest,
  publishedAt: z.string().datetime(),
  files: z.record(z.string().regex(/^evidence\/\d{10}-\d{10}-\d{4}-\d{2}-\d{2}\.json$/), digest),
});
async function verified(
  fetcher: typeof fetch,
  url: string,
  expected: string,
  signal?: AbortSignal,
) {
  const r = await fetcher(url, { signal });
  if (!r.ok) throw new Error('Shared-investor evidence unavailable');
  const raw = await r.json(),
    actual = Array.from(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw))),
      ),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
  if (actual !== expected) throw new Error('Shared-investor evidence integrity failure');
  signal?.throwIfAborted();
  return raw;
}
export async function loadSharedInvestors(fetcher: typeof fetch, base = '') {
  const r = await fetcher(`${base}/data/shared-investors/manifest.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error('Shared-investor collection unavailable');
  const manifest = manifestSchema.parse(await r.json());
  if (manifest.release !== `si-${manifest.dataHash.slice(0, 24)}`)
    throw new Error('Shared-investor release mismatch');
  const data = sharedDataSchema.parse(
    await verified(
      fetcher,
      `${base}/data/shared-investors/releases/${manifest.release}/data.json`,
      manifest.dataHash,
    ),
  );
  if (
    data.companies.length !== data.catalog.companies.length ||
    new Set(data.companies.map((c) => c.cik)).size !== data.companies.length ||
    data.catalog.companies.some((c) => !data.companies.some((p) => p.cik === c.cik)) ||
    new Set(data.managers.map((m) => m.cik)).size !== data.managers.length ||
    new Set(data.periods).size !== data.periods.length ||
    data.cells.length !== data.companies.length * data.managers.length * data.periods.length ||
    new Set(data.cells.map((c) => c.id)).size !== data.cells.length ||
    Object.keys(manifest.files).length !== data.cells.length ||
    data.cells.some(
      (c) =>
        c.id !== `${c.manager}-${c.company}-${c.period}` ||
        !data.companies.some((p) => p.cik === c.company) ||
        !data.managers.some((m) => m.cik === c.manager) ||
        !data.periods.includes(c.period) ||
        !manifest.files[`evidence/${c.id}.json`],
    )
  )
    throw new Error('Shared-investor index references invalid');
  return { manifest, data };
}
export type SharedBundle = Awaited<ReturnType<typeof loadSharedInvestors>>;
export async function readSharedEvidence(
  fetcher: typeof fetch,
  bundle: SharedBundle,
  id: string,
  base = '',
  signal?: AbortSignal,
) {
  const cell = bundle.data.cells.find((c) => c.id === id),
    file = `evidence/${id}.json`;
  if (!cell || !bundle.manifest.files[file])
    throw new Error('Cell outside shared-investor collection');
  const e = sharedEvidenceSchema.parse(
    await verified(
      fetcher,
      `${base}/data/shared-investors/releases/${bundle.manifest.release}/${file}`,
      bundle.manifest.files[file],
      signal,
    ),
  );
  if (
    JSON.stringify(e.cell) !== JSON.stringify(cell) ||
    e.upstreamRelease !== bundle.data.upstream.release ||
    e.positions.length !== cell.positions ||
    e.filings.some((f) => f.filing.cik !== cell.manager || f.filing.period !== cell.period) ||
    e.positions.some(
      (p) =>
        p.unit !== 'SH' ||
        p.option !== '' ||
        !bundle.data.catalog.companies
          .find((c) => c.cik === cell.company)!
          .securities.some((s) => s.cusip === p.cusip) ||
        p.refs.some(
          (r) =>
            !e.rows.some(
              (x) =>
                x.accession === r.accession &&
                x.index === r.index &&
                x.row.fields.CUSIP === p.cusip,
            ),
        ),
    )
  )
    throw new Error('Shared-investor evidence identity mismatch');
  return e;
}
