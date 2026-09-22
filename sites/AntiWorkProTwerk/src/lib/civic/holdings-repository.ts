import { z } from 'zod';
import {
  holdingsDataSchema,
  holdingDetailSchema,
  holdingPositionsWireSchema,
  decodeHoldingPositions,
  holdingRowsSchema,
} from './holdings';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const decodedPositionsSchema = holdingPositionsWireSchema.transform(decodeHoldingPositions);
const manifestSchema = z.object({
  formatVersion: z.literal(1),
  release: z.string().regex(/^hf-[a-f0-9]{24}$/),
  dataHash: digest,
  publishedAt: z.string().datetime(),
  files: z.record(
    z
      .string()
      .regex(
        /^(?:filings\/\d{10}-\d{2}-\d{6}|rows\/\d{10}-\d{2}-\d{6}-\d+|positions\/\d{10}-\d{4}-\d{2}-\d{2})\.json$/,
      ),
    digest,
  ),
});
async function verified(
  fetcher: typeof fetch,
  url: string,
  expected: string,
  signal?: AbortSignal,
) {
  if (!expected) throw new Error('Missing holdings evidence hash');
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error('Holdings evidence unavailable');
  const raw = await response.json(),
    bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw)));
  if (
    Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('') !== expected
  )
    throw new Error('Holdings evidence integrity failure');
  signal?.throwIfAborted();
  return raw;
}
export async function loadHoldings(fetcher: typeof fetch, base = '') {
  const r = await fetcher(`${base}/data/holdings/manifest.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error('Holdings collection unavailable');
  const manifest = manifestSchema.parse(await r.json());
  if (manifest.release !== `hf-${manifest.dataHash.slice(0, 24)}`)
    throw new Error('Holdings release mismatch');
  const data = holdingsDataSchema.parse(
    await verified(
      fetcher,
      `${base}/data/holdings/releases/${manifest.release}/data.json`,
      manifest.dataHash,
    ),
  );
  if (
    new Set(data.filings.map((f) => f.accession)).size !== data.filings.length ||
    new Set(data.snapshots.map((s) => s.id)).size !== data.snapshots.length ||
    data.filings.some((f) => !manifest.files[`filings/${f.accession}.json`]) ||
    data.snapshots.some(
      (s) =>
        manifest.files[`positions/${s.id}.json`] !== s.positionsHash ||
        s.filings.some(
          (id) =>
            !data.filings.some(
              (f) => f.accession === id && f.cik === s.cik && f.period === s.period,
            ),
        ),
    )
  )
    throw new Error('Holdings index references invalid');
  return { manifest, data };
}
type Bundle = Awaited<ReturnType<typeof loadHoldings>>;
export function createHoldingsReader(fetcher: typeof fetch, base = '') {
  const cache = new Map<string, unknown>();
  async function read<T>(
    bundle: Bundle,
    file: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    signal?.throwIfAborted();
    const checksum = bundle.manifest.files[file];
    if (!checksum) throw new Error('Holdings artifact outside collection');
    const key = `${bundle.manifest.release}/${file}/${checksum}`;
    if (cache.has(key)) {
      const value = cache.get(key) as T;
      cache.delete(key);
      cache.set(key, value);
      return value;
    }
    const value = schema.parse(
      await verified(
        fetcher,
        `${base}/data/holdings/releases/${bundle.manifest.release}/${file}`,
        checksum,
        signal,
      ),
    );
    cache.set(key, value);
    while (cache.size > 8) cache.delete(cache.keys().next().value!);
    return value;
  }
  return {
    async positions(bundle: Bundle, id: string, signal?: AbortSignal) {
      const s = bundle.data.snapshots.find((s) => s.id === id);
      if (!s) throw new Error('Snapshot outside collection');
      const p = await read(bundle, `positions/${id}.json`, decodedPositionsSchema, signal);
      if (
        p.id !== id ||
        p.positions.length !== s.positions ||
        new Set(p.positions.map((p) => p.key)).size !== p.positions.length ||
        p.positions.some(
          (p) =>
            p.key !== `${p.cusip}|${p.unit}|${p.option}` ||
            p.refs.some(
              (r) =>
                !s.activeFilings.includes(r.accession) ||
                r.index >=
                  (bundle.data.filings.find((f) => f.accession === r.accession)?.rows ?? 0),
            ),
        )
      ) {
        cache.clear();
        throw new Error('Holdings positions/index mismatch');
      }
      return p.positions;
    },
    async filing(bundle: Bundle, accession: string, signal?: AbortSignal) {
      const f = bundle.data.filings.find((f) => f.accession === accession);
      if (!f) throw new Error('Filing outside collection');
      const d = await read(bundle, `filings/${accession}.json`, holdingDetailSchema, signal);
      if (
        JSON.stringify(d.filing) !== JSON.stringify(f) ||
        d.rowPages.reduce((s, p) => s + p.count, 0) !== f.rows ||
        d.rowPages.some(
          (p, i) =>
            p.file !== `rows/${accession}-${i}.json` ||
            bundle.manifest.files[p.file] !== p.hash ||
            p.count !== Math.min(500, f.rows - i * 500),
        )
      ) {
        cache.clear();
        throw new Error('Holdings filing/index mismatch');
      }
      return d;
    },
    async rows(bundle: Bundle, accession: string, page: number, signal?: AbortSignal) {
      const f = bundle.data.filings.find((f) => f.accession === accession);
      if (!f || !Number.isInteger(page) || page < 0 || page * 500 >= f.rows)
        throw new Error('Holdings row page outside collection');
      const r = await read(bundle, `rows/${accession}-${page}.json`, holdingRowsSchema, signal);
      if (
        r.accession !== accession ||
        r.page !== page ||
        r.rows.length !== Math.min(500, f.rows - page * 500) ||
        r.rows.some((r) => r.fields.ACCESSION_NUMBER !== accession)
      ) {
        cache.clear();
        throw new Error('Holdings row identity mismatch');
      }
      return r.rows;
    },
  };
}
