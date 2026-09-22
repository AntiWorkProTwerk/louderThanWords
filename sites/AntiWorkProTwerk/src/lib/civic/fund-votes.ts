import { z } from 'zod';
import { secCik, insiderAccession, insiderSourceSchema } from './insiders';
import { exactAmount, amountCompare } from './holdings';
export const fundSeriesId = z.string().regex(/^S\d{9}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const fundVotePlanSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    selection: z.string().min(1),
    period: z.string().date(),
    filedThrough: z.string().date(),
    funds: z
      .array(z.object({ cik: secCik, series: fundSeriesId }))
      .min(1)
      .max(100),
    maxFilings: z.number().int().positive().max(1000),
    maxIndexPages: z.number().int().positive().max(500),
    maxVotes: z.number().int().positive().max(500000),
    maxFileBytes: z.number().int().positive().max(100000000),
  })
  .refine(
    (p) =>
      p.period >= '2024-06-30' &&
      p.period.endsWith('-06-30') &&
      p.filedThrough >= p.period &&
      new Set(p.funds.map((f) => f.series)).size === p.funds.length,
    'Unique selected series and an annual June 30 period are required',
  );
export type FundVotePlan = z.infer<typeof fundVotePlanSchema>;
export const fundVoteCoverSchema = z.object({
  accession: insiderAccession,
  cik: secCik,
  filed: z.string().date(),
  accepted: z.string().datetime({ offset: true }),
  form: z.enum(['N-PX', 'N-PX/A']),
  period: z.string().date(),
  duration: z.enum(['YEAR', 'QUARTER']),
  reportType: z.string(),
  name: z.string().min(1),
  state: z.string().nullable(),
  amendment: z.enum(['RESTATEMENT', 'NEW PROXY']).nullable(),
  amendmentNo: z.number().int().positive().nullable(),
  confidential: z.boolean().nullable(),
  noticeExplanation: z.string(),
  explanation: z.string(),
  series: z.array(
    z.object({ id: fundSeriesId, name: z.string().min(1), lei: z.string().nullable() }),
  ),
  managers: z.array(
    z.object({ number: z.string(), name: z.string(), file13f: z.string().nullable() }),
  ),
  reportedBy: z.array(
    z.object({ name: z.string(), file: z.string().nullable(), lei: z.string().nullable() }),
  ),
  source: insiderSourceSchema,
});
export type FundVoteCover = z.infer<typeof fundVoteCoverSchema>;
export const fundVoteRecordSchema = z.object({
  id: z.string().regex(/^vr-[a-f0-9]{24}$/),
  accession: insiderAccession,
  file: z.string(),
  ordinal: z.number().int().positive(),
  rawHash: digest,
  series: fundSeriesId.nullable(),
  issuer: z.string().min(1),
  cusip: z.string().nullable(),
  isin: z.string().nullable(),
  figi: z.string().nullable(),
  meetingRaw: z.string(),
  meeting: z.string().date().nullable(),
  description: z.string().min(1),
  categories: z.array(z.string()),
  otherCategory: z.string(),
  source: z.string().nullable(),
  shares: exactAmount.nullable(),
  loaned: exactAmount.nullable(),
  votes: z.array(
    z.object({ choice: z.string(), shares: exactAmount.nullable(), management: z.string() }),
  ),
  managers: z.array(z.string()),
  notes: z.string(),
  issues: z.array(z.string()),
  proposal: z
    .string()
    .regex(/^pv-[a-f0-9]{24}$/)
    .nullable(),
});
export type FundVoteRecord = z.infer<typeof fundVoteRecordSchema>;
export const fundVoteEvidenceSchema = z.object({
  record: fundVoteRecordSchema,
  source: insiderSourceSchema,
  raw: z.string(),
});
export type FundVoteEvidence = z.infer<typeof fundVoteEvidenceSchema>;

export function fundVoteSecurity(r: Pick<FundVoteRecord, 'cusip' | 'isin' | 'figi'>) {
  return r.cusip && /^[A-Za-z0-9]{9}$/.test(r.cusip)
    ? `cusip:${r.cusip.toUpperCase()}`
    : r.isin && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(r.isin)
      ? `isin:${r.isin}`
      : r.figi && /^BBG[A-Z0-9]{9}$/.test(r.figi)
        ? `figi:${r.figi}`
        : null;
}

// Form N-PX Item 1(l): this is alignment with management, NOT management's vote.
export function fundVoteManagement(value: string) {
  return value === 'FOR'
    ? 'With management’s recommendation'
    : value === 'AGAINST'
      ? 'Against management’s recommendation'
      : value === 'NONE'
        ? 'No management recommendation'
        : 'Unresolved management alignment';
}

const count = z.number().int().nonnegative();
export const fundVoteFileSchema = z.object({
  path: z
    .string()
    .regex(/^[a-z0-9][a-z0-9/-]*\.json$/)
    .refine((v) => !v.includes('//')),
  hash: digest,
  bytes: count,
});
export type FundVoteFile = z.infer<typeof fundVoteFileSchema>;
export const fundVoteResolutionSchema = z.object({
  cik: secCik,
  series: fundSeriesId,
  status: z.enum(['voting-report', 'notice', 'missing', 'unresolved']),
  filings: z.array(insiderAccession),
  active: z.array(insiderAccession),
  superseded: z.array(insiderAccession),
  issues: z.array(z.string()),
  cautions: z.array(z.string()),
});
export type FundVoteResolution = z.infer<typeof fundVoteResolutionSchema>;
export const fundVoteMeetingSummarySchema = z.object({
  id: z.string().regex(/^mt-[a-f0-9]{24}$/),
  security: z.string(),
  date: z.string().date(),
  issuers: z.array(z.string()).min(1),
  categories: z.array(z.string()),
  proposals: count,
  comparable: count,
  differing: count,
  file: fundVoteFileSchema,
});
export type FundVoteMeetingSummary = z.infer<typeof fundVoteMeetingSummarySchema>;
const rowLocator = z.object({
  id: z.string().regex(/^vr-[a-f0-9]{24}$/),
  page: fundVoteFileSchema,
});
export const fundVoteFundDetailSchema = z.object({
  series: fundSeriesId,
  meetings: z.array(fundVoteMeetingSummarySchema),
  unmatched: z.array(rowLocator),
});
export type FundVoteFundDetail = z.infer<typeof fundVoteFundDetailSchema>;
export const fundVoteMeetingSchema = z.object({
  id: z.string().regex(/^mt-[a-f0-9]{24}$/),
  security: z.string(),
  date: z.string().date(),
  proposals: z.array(
    z.object({
      id: z.string().regex(/^pv-[a-f0-9]{24}$/),
      description: z.string(),
      source: z.enum(['ISSUER', 'SECURITY HOLDER']),
      categories: z.array(z.string()),
      comparable: z.boolean(),
      differing: z.boolean(),
      records: z.array(z.object({ record: fundVoteRecordSchema, page: fundVoteFileSchema })).min(1),
    }),
  ),
});
export type FundVoteMeeting = z.infer<typeof fundVoteMeetingSchema>;
export const fundVoteEvidencePageSchema = z.object({
  accession: insiderAccession,
  page: count,
  evidence: z.array(fundVoteEvidenceSchema).min(1).max(200),
});
export const fundVoteDataSchema = z.object({
  formatVersion: z.literal(1),
  pipelineVersion: z.literal('fund-votes-public-v1'),
  plan: fundVotePlanSchema,
  observedAt: z.string().datetime({ offset: true }),
  sources: z.array(z.object({ key: z.string(), source: insiderSourceSchema })),
  funds: z.array(
    fundVoteResolutionSchema.extend({
      name: z.string(),
      state: z.string().nullable(),
      rows: count,
      unresolvedRows: count,
      unmatchedRows: count,
      meetings: count,
      proposals: count,
      comparable: count,
      differing: count,
      file: fundVoteFileSchema,
    }),
  ),
  filings: z.array(
    z.object({
      cover: fundVoteCoverSchema,
      file: fundVoteFileSchema,
      rows: count,
      unassignedRows: count,
    }),
  ),
  exclusions: z.array(
    z.object({ accession: insiderAccession, reason: z.string(), source: insiderSourceSchema }),
  ),
  counts: z.object({
    scanned: count,
    unselectedRows: count,
    retainedRows: count,
    activeRows: count,
    unassignedRows: count,
    unresolvedRows: count,
    unmatchedRows: count,
    meetings: count,
    proposals: count,
    comparable: count,
    differing: count,
  }),
});
export type FundVoteData = z.infer<typeof fundVoteDataSchema>;
export const fundVoteFilingSchema = z.object({
  cover: fundVoteCoverSchema,
  directory: insiderSourceSchema,
  index: insiderSourceSchema,
  tables: z.array(z.object({ file: z.string(), rows: count, source: insiderSourceSchema })),
  pages: z.array(fundVoteFileSchema),
  rows: count,
  unassigned: z.array(rowLocator),
});

// These are disclosed vote directions, not sentiment, approval scores or recommendations.
// Keep unknown/zero quantities and every manager group out of aggregate vote totals.
export function fundVoteDirection(records: FundVoteRecord[]) {
  if (!records.length) return { status: 'not-reported' as const, choices: [] as string[] };
  if (records.some((r) => r.issues.length))
    return { status: 'unresolved' as const, choices: [] as string[] };
  const choices = [
    ...new Set(
      records.flatMap((r) =>
        r.votes
          .filter((v) => v.shares !== null && amountCompare(v.shares, '0') > 0)
          .map((v) => v.choice),
      ),
    ),
  ].sort();
  if (!choices.length)
    return {
      status: records.every((r) => r.shares === '0')
        ? ('no-shares-voted' as const)
        : ('unresolved' as const),
      choices,
    };
  return {
    status: choices.length === 1 ? ('one-direction' as const) : ('multiple-directions' as const),
    choices,
  };
}
