import { z } from 'zod';
import { secCik, insiderAccession, insiderSourceSchema, insiderRowSchema } from './insiders';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const exactAmount = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?$/)
  .max(80);
// Integer arithmetic throughout acquisition/comparison. Number is only used for
// bounded display percentages, never monetary/quantity accumulation or equality.
function parts(value: string): [bigint, number] {
  exactAmount.parse(value);
  const [whole, fraction = ''] = value.split('.');
  return [BigInt(whole + fraction), fraction.length];
}
function decimal(value: bigint, scale: number): string {
  const sign = value < 0n ? '-' : '',
    digits = (value < 0n ? -value : value).toString().padStart(scale + 1, '0');
  const result = scale
    ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, '')
    : digits;
  return value === 0n ? '0' : sign + result;
}
export function amountAdd(a: string, b: string) {
  const [av, as] = parts(a),
    [bv, bs] = parts(b),
    s = Math.max(as, bs);
  return decimal(av * 10n ** BigInt(s - as) + bv * 10n ** BigInt(s - bs), s);
}
export const amountSubtract = (a: string, b: string) =>
  amountAdd(a, b.startsWith('-') ? b.slice(1) : `-${b}`);
export const amountCompare = (a: string, b: string) => {
  const [av, as] = parts(a),
    [bv, bs] = parts(b),
    s = Math.max(as, bs);
  const left = av * 10n ** BigInt(s - as),
    right = bv * 10n ** BigInt(s - bs);
  return left === right ? 0 : left < right ? -1 : 1;
};
export function valueDollars(value: string, filed: string) {
  const [v, s] = parts(value);
  return decimal(v * (filed < '2023-01-03' ? 1000n : 1n), s);
}
export function holdingWeight(value: string, total: string): number | null {
  if (amountCompare(total, '0') <= 0 || amountCompare(value, '0') < 0) return null;
  const [v, vs] = parts(value),
    [t, ts] = parts(total);
  return Number((v * 10n ** BigInt(ts) * 1_000_000n) / (t * 10n ** BigInt(vs))) / 10000;
}
export function compareConcentration(
  beforeValue: string,
  beforeTotal: string,
  afterValue: string,
  afterTotal: string,
): number | null {
  if (
    amountCompare(beforeTotal, '0') <= 0 ||
    amountCompare(afterTotal, '0') <= 0 ||
    amountCompare(beforeValue, '0') < 0 ||
    amountCompare(afterValue, '0') < 0
  )
    return null;
  const [bv, bs] = parts(beforeValue),
    [bt, bts] = parts(beforeTotal),
    [av, as] = parts(afterValue),
    [at, ats] = parts(afterTotal);
  const left = av * bt * 10n ** BigInt(bs + ats),
    right = bv * at * 10n ** BigInt(as + bts);
  return left === right ? 0 : left > right ? 1 : -1;
}
export const holdingsArchiveSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(60),
  url: z.string().url(),
});
export const holdingsPlanSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    selection: z.string().min(1),
    managers: z.array(secCik).min(1).max(50),
    archives: z.array(holdingsArchiveSchema).min(1).max(40),
    maxFilings: z.number().int().positive().max(25000),
    maxRows: z.number().int().positive().max(2_000_000),
  })
  .refine(
    (p) =>
      new Set(p.managers).size === p.managers.length &&
      new Set(p.archives.map((a) => a.id)).size === p.archives.length &&
      new Set(p.archives.map((a) => a.url)).size === p.archives.length,
    'Duplicate holdings scope',
  );
export type HoldingsPlan = z.infer<typeof holdingsPlanSchema>;
export const holdingsTableReceipt = z.object({
  member: z.string(),
  rows: z.number().int().nonnegative(),
  selected: z.number().int().nonnegative(),
  headers: z.array(z.string()),
});
export const holdingFilingSchema = z.object({
  accession: insiderAccession,
  archive: z.string(),
  cik: secCik,
  name: z.string().min(1),
  filed: z.string().date(),
  period: z.string().date(),
  form: z.enum(['13F-HR', '13F-HR/A', '13F-NT', '13F-NT/A']),
  reportType: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  amendment: z.enum(['original', 'restatement', 'addition', 'unknown']),
  amendmentNo: z.number().int().positive().nullable(),
  confidential: z.boolean().nullable(),
  confidentialRelease: z.boolean().nullable(),
  declaredRows: z.number().int().nonnegative().nullable(),
  rows: z.number().int().nonnegative(),
  declaredValue: exactAmount.nullable(),
  reportedValue: exactAmount,
  issues: z.array(z.string()),
  recordHash: digest,
});
export type HoldingFiling = z.infer<typeof holdingFilingSchema>;
export const holdingPositionSchema = z.object({
  key: z.string(),
  cusip: z.string(),
  unit: z.enum(['SH', 'PRN']),
  option: z.enum(['', 'Put', 'Call']),
  names: z.array(z.string()),
  classes: z.array(z.string()),
  quantity: exactAmount,
  value: exactAmount,
  // Filing-local row indexes refer to exact source rows in lazy evidence pages.
  refs: z.array(z.object({ accession: insiderAccession, index: z.number().int().nonnegative() })),
});
export type HoldingPosition = z.infer<typeof holdingPositionSchema>;
export const holdingSnapshotSchema = z.object({
  id: z.string().regex(/^\d{10}-\d{4}-\d{2}-\d{2}$/),
  cik: secCik,
  period: z.string().date(),
  name: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  filedThrough: z.string().date(),
  filings: z.array(insiderAccession),
  activeFilings: z.array(insiderAccession),
  status: z.enum(['reported', 'notice', 'unresolved']),
  issues: z.array(z.string()),
  cautions: z.array(z.string()),
  positions: z.number().int().nonnegative(),
  rows: z.number().int().nonnegative(),
  value: exactAmount,
  topTenWeight: z.number().nonnegative().nullable(),
  positionsHash: digest,
});
export type HoldingSnapshot = z.infer<typeof holdingSnapshotSchema>;
export const holdingsDataSchema = z.object({
  formatVersion: z.literal(1),
  pipelineVersion: z.enum(['holdings-v1', 'holdings-v2']),
  plan: holdingsPlanSchema,
  observedAt: z.string().datetime(),
  archives: z.array(
    z.object({
      id: z.string(),
      source: insiderSourceSchema,
      tables: z.array(holdingsTableReceipt),
    }),
  ),
  filings: z.array(holdingFilingSchema),
  snapshots: z.array(holdingSnapshotSchema),
  changes: z.object({
    baselineAt: z.string().datetime().nullable(),
    added: z.array(insiderAccession),
    updated: z.array(insiderAccession),
  }),
});
export type HoldingsData = z.infer<typeof holdingsDataSchema>;
export const holdingDetailSchema = z.object({
  filing: holdingFilingSchema,
  submission: insiderRowSchema,
  cover: insiderRowSchema,
  summary: insiderRowSchema.nullable(),
  reportingFor: z.array(insiderRowSchema),
  includedManagers: z.array(insiderRowSchema),
  rowPages: z.array(
    z.object({ file: z.string(), hash: digest, count: z.number().int().nonnegative() }),
  ),
});
export type HoldingDetail = z.infer<typeof holdingDetailSchema>;
export const holdingPositionsSchema = z.object({
  id: z.string(),
  positions: z.array(holdingPositionSchema),
});
// Dictionary/tuple wire format avoids repeating long accession IDs on tens of
// thousands of discretion rows. Decoding restores the same public domain model.
const wireIndex = z.number().int().nonnegative();
export const compactHoldingPositionsSchema = z.object({
  formatVersion: z.literal(2),
  id: z.string(),
  filings: z.array(insiderAccession),
  names: z.array(z.string()),
  classes: z.array(z.string()),
  rows: z.array(
    z.tuple([
      z.string(),
      z.enum(['SH', 'PRN']),
      z.enum(['', 'Put', 'Call']),
      z.array(wireIndex),
      z.array(wireIndex),
      exactAmount,
      exactAmount,
      z.array(z.tuple([wireIndex, wireIndex])),
    ]),
  ),
});
export const holdingPositionsWireSchema = z.union([
  compactHoldingPositionsSchema,
  holdingPositionsSchema,
]);
export function encodeHoldingPositions(id: string, positions: HoldingPosition[]) {
  const filings: string[] = [],
    names: string[] = [],
    classes: string[] = [];
  const fm = new Map<string, number>(),
    nm = new Map<string, number>(),
    cm = new Map<string, number>();
  function ref(value: string, values: string[], map: Map<string, number>) {
    if (!map.has(value)) {
      map.set(value, values.length);
      values.push(value);
    }
    return map.get(value)!;
  }
  return compactHoldingPositionsSchema.parse({
    formatVersion: 2,
    id,
    filings,
    names,
    classes,
    rows: positions.map((p) => [
      p.cusip,
      p.unit,
      p.option,
      p.names.map((n) => ref(n, names, nm)),
      p.classes.map((c) => ref(c, classes, cm)),
      p.quantity,
      p.value,
      p.refs.map((r) => [ref(r.accession, filings, fm), r.index]),
    ]),
  });
}
export function decodeHoldingPositions(raw: z.infer<typeof holdingPositionsWireSchema>) {
  if (!('formatVersion' in raw)) return raw;
  function lookup(values: string[], index: number) {
    if (index >= values.length) throw new Error('Holdings dictionary reference outside collection');
    return values[index];
  }
  return {
    id: raw.id,
    positions: raw.rows.map(
      ([cusip, unit, option, names, classes, quantity, value, refs]): HoldingPosition => ({
        key: `${cusip}|${unit}|${option}`,
        cusip,
        unit,
        option,
        names: names.map((i) => lookup(raw.names, i)),
        classes: classes.map((i) => lookup(raw.classes, i)),
        quantity,
        value,
        refs: refs.map(([i, index]) => ({ accession: lookup(raw.filings, i), index })),
      }),
    ),
  };
}
export const holdingRowsSchema = z.object({
  accession: insiderAccession,
  page: z.number().int().nonnegative(),
  rows: z.array(insiderRowSchema),
});
export const holdingFilingUrl = (f: Pick<HoldingFiling, 'cik' | 'accession'>) =>
  `https://www.sec.gov/Archives/edgar/data/${Number(f.cik)}/${f.accession.replaceAll('-', '')}/${f.accession}-index.html`;
export const holdingChangeNames = {
  new: 'Newly reported',
  missing: 'No longer reported',
  increased: 'Quantity increased',
  decreased: 'Quantity decreased',
  unchanged: 'Quantity unchanged',
} as const;
export type HoldingChange = keyof typeof holdingChangeNames;
export function compareHoldings(
  before: HoldingSnapshot,
  after: HoldingSnapshot,
  a: HoldingPosition[],
  b: HoldingPosition[],
) {
  if (
    before.cik !== after.cik ||
    before.period >= after.period ||
    before.status !== 'reported' ||
    after.status !== 'reported'
  )
    throw new Error(
      'Choose two resolved holdings reports for the same manager in chronological order',
    );
  const left = new Map(a.map((p) => [p.key, p])),
    right = new Map(b.map((p) => [p.key, p]));
  return [...new Set([...left.keys(), ...right.keys()])].sort().map((key) => {
    const prior = left.get(key) ?? null,
      next = right.get(key) ?? null;
    const delta = prior && next ? amountSubtract(next.quantity, prior.quantity) : null;
    const change: HoldingChange = !prior
      ? 'new'
      : !next
        ? 'missing'
        : delta === '0'
          ? 'unchanged'
          : delta!.startsWith('-')
            ? 'decreased'
            : 'increased';
    const priorWeight =
        prior && before.topTenWeight !== null ? holdingWeight(prior.value, before.value) : null,
      nextWeight =
        next && after.topTenWeight !== null ? holdingWeight(next.value, after.value) : null;
    return {
      key,
      prior,
      next,
      delta,
      change,
      priorWeight,
      nextWeight,
      weightChange: priorWeight !== null && nextWeight !== null ? nextWeight - priorWeight : null,
      concentrationDirection:
        prior && next && before.topTenWeight !== null && after.topTenWeight !== null
          ? compareConcentration(prior.value, before.value, next.value, after.value)
          : null,
    };
  });
}
export function holdingStateCounts(data: HoldingsData, params: URLSearchParams) {
  const latest = new Map<string, HoldingSnapshot>();
  for (const s of data.snapshots)
    if (!latest.has(s.cik) || latest.get(s.cik)!.period < s.period) latest.set(s.cik, s);
  const counts: Record<string, number> = {};
  for (const s of latest.values())
    if (s.state && (!params.get('manager') || params.get('manager') === s.cik))
      counts[s.state] = (counts[s.state] ?? 0) + 1;
  return counts;
}
export type HoldingComparison = ReturnType<typeof compareHoldings>[number];
export function sortHoldingComparisons(rows: HoldingComparison[]) {
  return rows.sort((a, b) => {
    const av = (a.next ?? a.prior)!.value,
      bv = (b.next ?? b.prior)!.value;
    // Floating-point conversion is monotone: a strict difference has the exact
    // same ordering. Equal/overflow approximations fall back to exact arithmetic.
    // This is only a sort shortcut; arithmetic and equality remain exact.
    const approx = Number(bv) - Number(av);
    return (
      (Number.isFinite(approx) && approx !== 0 ? approx : amountCompare(bv, av)) ||
      a.key.localeCompare(b.key)
    );
  });
}
export async function compareHoldingsAsync(
  before: HoldingSnapshot,
  after: HoldingSnapshot,
  a: HoldingPosition[],
  b: HoldingPosition[],
  signal?: AbortSignal,
  yieldTask: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0)),
) {
  signal?.throwIfAborted();
  // Validate even an empty pair before scheduling batches.
  compareHoldings(before, after, [], []);
  const left = new Map(a.map((p) => [p.key, p])),
    right = new Map(b.map((p) => [p.key, p]));
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort(),
    result: HoldingComparison[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    signal?.throwIfAborted();
    const chunk = keys.slice(i, i + 100);
    result.push(
      ...compareHoldings(
        before,
        after,
        chunk.map((k) => left.get(k)).filter((p) => p !== undefined),
        chunk.map((k) => right.get(k)).filter((p) => p !== undefined),
      ),
    );
    if (i + 100 < keys.length) await yieldTask();
  }
  signal?.throwIfAborted();
  return sortHoldingComparisons(result);
}
