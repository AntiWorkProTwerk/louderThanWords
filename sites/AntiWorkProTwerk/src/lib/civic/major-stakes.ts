import { z } from 'zod';
import { secCik, insiderAccession, insiderSourceSchema } from './insiders';
import { exactAmount, amountCompare, amountSubtract } from './holdings';
const digest = z.string().regex(/^[a-f0-9]{64}$/),
  id = z.string().regex(/^[a-z0-9-]+$/);
export const stakeFormSchema = z.enum([
  'SCHEDULE 13D',
  'SCHEDULE 13D/A',
  'SCHEDULE 13G',
  'SCHEDULE 13G/A',
]);
export const stakePlanSchema = z
  .object({
    id,
    title: z.string().min(1),
    selection: z.string().min(1),
    issuers: z.array(secCik).min(1).max(50),
    from: z.string().date(),
    through: z.string().date(),
    maxFilings: z.number().int().positive().max(10000),
    maxIndexPages: z.number().int().positive().max(500),
  })
  .refine(
    (p) =>
      new Set(p.issuers).size === p.issuers.length && p.from >= '2025-01-01' && p.from <= p.through,
    'Use unique issuers and a structured-era filing window beginning in 2025 or later',
  );
export type StakePlan = z.infer<typeof stakePlanSchema>;
export const stakeReporterSchema = z.object({
  id,
  cik: secCik.nullable(),
  name: z.string().min(1),
  identity: z.enum(['explicit-cik', 'filer-scoped-name']),
  quantity: exactAmount.nullable(),
  percent: exactAmount.nullable(),
  soleVoting: exactAmount.nullable(),
  sharedVoting: exactAmount.nullable(),
  soleDispositive: exactAmount.nullable(),
  sharedDispositive: exactAmount.nullable(),
  group: z.enum(['a', 'b']).nullable(),
  excludesShares: z.boolean().nullable(),
  types: z.array(z.string()),
  fundTypes: z.array(z.string()),
});
export type StakeReporter = z.infer<typeof stakeReporterSchema>;
export const stakeFilingSchema = z.object({
  accession: insiderAccession,
  form: stakeFormSchema,
  filed: z.string().date(),
  accepted: z.string().datetime({ offset: true }),
  event: z.string().date(),
  issuerCik: secCik,
  issuerName: z.string().min(1),
  filerCik: secCik,
  cusips: z.array(z.string()),
  securityClass: z.string().min(1),
  amendmentNo: z.number().int().nonnegative().nullable(),
  previousAccession: insiderAccession.nullable(),
  previouslyFiledG: z.boolean().nullable(),
  rules: z.array(z.string()),
  reporters: z.array(stakeReporterSchema).min(1).max(100),
  purpose: z.enum(['13d-purpose', '13g-certification', 'not-restated', 'not-supplied']),
  belowThreshold: z.boolean().nullable(),
  issues: z.array(z.string()),
  source: insiderSourceSchema,
  recordHash: digest,
});
export type StakeFiling = z.infer<typeof stakeFilingSchema>;
export const stakeFieldSchema = z.object({
  path: z.string(),
  label: z.string(),
  raw: z.string(),
  text: z.string(),
});
export const stakeDetailSchema = z.object({
  filing: stakeFilingSchema,
  fields: z.array(stakeFieldSchema),
});
export type StakeDetail = z.infer<typeof stakeDetailSchema>;
export const stakeSeriesSchema = z.object({
  id,
  issuerCik: secCik,
  filerCik: secCik,
  cusips: z.array(z.string()),
  securityClass: z.string(),
  filings: z.array(insiderAccession).min(1),
  initialSchedules: z.array(insiderAccession),
  issues: z.array(z.string()),
});
export type StakeSeries = z.infer<typeof stakeSeriesSchema>;
export const stakeDataSchema = z.object({
  formatVersion: z.literal(1),
  pipelineVersion: z.literal('major-stakes-v1'),
  plan: stakePlanSchema,
  observedAt: z.string().datetime(),
  issuers: z.array(
    z.object({
      cik: secCik,
      name: z.string(),
      state: z.string().nullable(),
      tickers: z.array(z.string()),
      source: insiderSourceSchema,
      indexRows: z.number().int().nonnegative(),
      historyPages: z.number().int().nonnegative(),
    }),
  ),
  indexes: z.array(
    z.object({
      cik: secCik,
      key: z.string(),
      source: insiderSourceSchema,
      rows: z.number().int().nonnegative(),
    }),
  ),
  exclusions: z.array(
    z.object({
      accession: insiderAccession,
      indexedBy: z.array(secCik),
      actualIssuer: secCik,
      reason: z.literal('different-subject-issuer'),
      source: insiderSourceSchema,
    }),
  ),
  filings: z.array(stakeFilingSchema),
  series: z.array(stakeSeriesSchema),
  changes: z.object({
    baselineAt: z.string().datetime().nullable(),
    added: z.array(insiderAccession),
    updated: z.array(insiderAccession),
  }),
});
export type StakeData = z.infer<typeof stakeDataSchema>;
export function stakeComparison(before: StakeFiling, after: StakeFiling) {
  const issues: string[] = [];
  if (before.event > before.filed || after.event > after.filed)
    issues.push(
      'An event date follows its filing date; resolve the source chronology before comparing.',
    );
  if (
    before.issuerCik !== after.issuerCik ||
    before.filerCik !== after.filerCik ||
    !before.cusips.length ||
    JSON.stringify([...before.cusips].sort()) !== JSON.stringify([...after.cusips].sort())
  )
    issues.push('Different or unresolved issuer, filer or security set.');
  if (Date.parse(before.accepted) >= Date.parse(after.accepted) || before.event >= after.event)
    issues.push(
      'Event dates do not advance, or filing order is ambiguous. This may revise an earlier disclosure.',
    );
  if (before.form.includes('13D') !== after.form.includes('13D'))
    issues.push('Filing type changed between 13D and 13G. Read the basis before comparing.');
  const values = after.reporters.map((current) => {
    const prior = before.reporters.find((p) => p.id === current.id),
      reasons = [...issues];
    if (!prior) reasons.push('No matching reporter identity in the previous collected filing.');
    return {
      id: current.id,
      name: current.name,
      identity: current.identity,
      reasons,
      quantityDelta:
        !reasons.length && prior?.quantity !== null && current.quantity !== null
          ? amountSubtract(current.quantity, prior!.quantity)
          : null,
      percentagePointDelta:
        !reasons.length && prior?.percent !== null && current.percent !== null
          ? amountSubtract(current.percent, prior!.percent)
          : null,
    };
  });
  return {
    before: before.accession,
    after: after.accession,
    values,
    notRepeated: before.reporters
      .filter((p) => !after.reporters.some((n) => n.id === p.id))
      .map((p) => ({ id: p.id, name: p.name })),
    issues,
  };
}
export function stakeSelection(data: StakeData, params: URLSearchParams) {
  const query = (params.get('q') ?? '').trim().toLowerCase(),
    kind = params.get('form');
  return data.series.filter((s) => {
    const issuer = data.issuers.find((i) => i.cik === s.issuerCik)!,
      files = s.filings.map((id) => data.filings.find((f) => f.accession === id)!);
    return (
      (!params.get('state') || issuer.state === params.get('state')) &&
      (!params.get('issuer') || s.issuerCik === params.get('issuer')) &&
      (!kind || files.some((f) => f.form.includes(kind))) &&
      (params.get('initial') !== '1' || files.some((f) => !f.form.endsWith('/A'))) &&
      (!query ||
        [
          issuer.name,
          ...issuer.tickers,
          s.issuerCik,
          s.filerCik,
          ...s.cusips,
          ...files.flatMap((f) => f.reporters.flatMap((p) => [p.name, p.cik ?? ''])),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query))
    );
  });
}
export function stakeStateCounts(data: StakeData, params: URLSearchParams) {
  const unscoped = new URLSearchParams(params);
  unscoped.delete('state');
  unscoped.delete('series');
  unscoped.delete('filing');
  const ids = new Set(stakeSelection(data, unscoped).map((s) => s.issuerCik)),
    counts: Record<string, number> = {};
  for (const i of data.issuers)
    if (ids.has(i.cik) && i.state) counts[i.state] = (counts[i.state] ?? 0) + 1;
  return counts;
}
export function stakeLargestReported(f: StakeFiling) {
  const values = f.reporters.flatMap((p) => (p.percent === null ? [] : [p.percent]));
  return values.length ? values.reduce((a, b) => (amountCompare(a, b) >= 0 ? a : b)) : null;
}
export const stakeFilingUrl = (f: Pick<StakeFiling, 'issuerCik' | 'accession'>) =>
  `https://www.sec.gov/Archives/edgar/data/${Number(f.issuerCik)}/${f.accession.replaceAll('-', '')}/${f.accession}-index.htm`;
