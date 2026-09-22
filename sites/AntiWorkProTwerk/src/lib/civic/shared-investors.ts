import { z } from 'zod';
import { secCik, insiderSourceSchema, insiderRowSchema } from './insiders';
import {
  amountAdd,
  amountCompare,
  exactAmount,
  holdingDetailSchema,
  holdingPositionSchema,
  type HoldingPosition,
  type HoldingSnapshot,
} from './holdings';

const id = z.string().regex(/^[a-z0-9-]+$/);
export const sharedCatalogSchema = z
  .object({
    id,
    version: id,
    title: z.string().min(1),
    selection: z.string().min(1),
    reviewedAt: z.string().date(),
    companies: z
      .array(
        z.object({
          cik: secCik,
          label: z.string().min(1),
          ticker: z.string().min(1),
          securities: z
            .array(
              z
                .object({
                  cusip: z.string().regex(/^[A-Z0-9]{9}$/),
                  label: z.string().min(1),
                  from: z.string().date(),
                  through: z.string().date(),
                  identityUrl: z.string().url(),
                })
                .refine((s) => s.from <= s.through, 'Invalid mapping interval'),
            )
            .min(1)
            .max(20),
        }),
      )
      .min(2)
      .max(100),
    groups: z
      .array(
        z.object({
          id,
          label: z.string().min(1),
          kind: z.enum(['curated', 'sic']),
          companies: z.array(secCik).min(2),
          definition: z.string().min(1),
          sourceUrl: z.string().url().nullable(),
          excerpt: z.string().min(1).nullable(),
          locator: z.string().min(1),
          sicCodes: z.array(z.string().regex(/^\d{4}$/)),
        }),
      )
      .min(1)
      .max(50),
  })
  .superRefine((p, ctx) => {
    const ciks = new Set(p.companies.map((c) => c.cik)),
      cusips = p.companies.flatMap((c) => c.securities.map((s) => s.cusip));
    if (
      ciks.size !== p.companies.length ||
      new Set(cusips).size !== cusips.length ||
      new Set(p.groups.map((g) => g.id)).size !== p.groups.length
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate company, security or group' });
    for (const g of p.groups)
      if (
        new Set(g.companies).size !== g.companies.length ||
        g.companies.some((c) => !ciks.has(c)) ||
        (g.kind === 'curated'
          ? !g.sourceUrl || !g.excerpt || !!g.sicCodes.length
          : !g.sicCodes.length || !!g.sourceUrl || !!g.excerpt)
      )
        ctx.addIssue({ code: 'custom', message: 'Invalid peer group evidence or members' });
  });
export type SharedCatalog = z.infer<typeof sharedCatalogSchema>;
export const sharedCellSchema = z.object({
  id,
  manager: secCik,
  company: secCik,
  period: z.string().date(),
  snapshot: z.string().nullable(),
  status: z.enum(['reported', 'zero-reported', 'not-listed', 'unavailable']),
  value: exactAmount.nullable(),
  positions: z.number().int().nonnegative(),
  reasons: z.array(z.string()),
});
export type SharedCell = z.infer<typeof sharedCellSchema>;
export const sharedDataSchema = z.object({
  formatVersion: z.literal(1),
  pipelineVersion: z.literal('shared-investors-v1'),
  catalog: sharedCatalogSchema,
  observedAt: z.string().datetime(),
  upstream: z.object({
    release: z.string().regex(/^hf-[a-f0-9]{24}$/),
    dataHash: z.string().regex(/^[a-f0-9]{64}$/),
    observedAt: z.string().datetime(),
    selection: z.string(),
  }),
  companies: z.array(
    z.object({
      cik: secCik,
      name: z.string(),
      state: z.string().nullable(),
      sic: z.string(),
      sicDescription: z.string(),
      profile: insiderSourceSchema,
      identities: z.array(
        z.object({
          cusip: z.string(),
          name: z.string(),
          securityClass: z.string(),
          eventDate: z.string().date(),
          source: insiderSourceSchema,
        }),
      ),
    }),
  ),
  groups: z.array(z.object({ id, source: insiderSourceSchema.nullable() })),
  managers: z.array(z.object({ cik: secCik, name: z.string() })),
  periods: z.array(z.string().date()).min(1),
  cells: z.array(sharedCellSchema),
});
export type SharedData = z.infer<typeof sharedDataSchema>;
export const sharedEvidenceSchema = z.object({
  cell: sharedCellSchema,
  upstreamRelease: z.string(),
  positions: z.array(holdingPositionSchema),
  filings: z.array(holdingDetailSchema),
  rows: z.array(
    z.object({
      accession: z.string(),
      index: z.number().int().nonnegative(),
      pageHash: z.string().regex(/^[a-f0-9]{64}$/),
      row: insiderRowSchema,
    }),
  ),
});
export type SharedEvidence = z.infer<typeof sharedEvidenceSchema>;

export function sharedCell(
  company: SharedCatalog['companies'][number],
  manager: string,
  period: string,
  snapshot: HoldingSnapshot | undefined,
  positions: HoldingPosition[],
): SharedCell {
  const base = {
    id: `${manager}-${company.cik}-${period}`,
    manager,
    company: company.cik,
    period,
    snapshot: snapshot?.id ?? null,
  };
  const mapping = company.securities.every((s) => s.from <= period && period <= s.through);
  const reasons = [...(snapshot?.issues ?? []), ...(snapshot?.cautions ?? [])];
  if (!snapshot || snapshot.status !== 'reported' || !mapping)
    return {
      ...base,
      status: 'unavailable',
      value: null,
      positions: 0,
      reasons: [
        ...reasons,
        !mapping
          ? 'Company/security mapping does not cover this quarter.'
          : !snapshot
            ? 'No collected manager report for this quarter.'
            : `Report status: ${snapshot.status}. Not evidence of an empty portfolio.`,
      ],
    };
  const selected = positions.filter(
    (p) =>
      p.unit === 'SH' && p.option === '' && company.securities.some((s) => s.cusip === p.cusip),
  );
  if (selected.some((p) => amountCompare(p.quantity, '0') < 0 || amountCompare(p.value, '0') < 0))
    return {
      ...base,
      status: 'unavailable',
      value: null,
      positions: 0,
      reasons: [...reasons, 'Negative selected amounts need source review.'],
    };
  return {
    ...base,
    status: !selected.length
      ? 'not-listed'
      : selected.some((p) => amountCompare(p.quantity, '0') > 0)
        ? 'reported'
        : 'zero-reported',
    value: selected.length ? selected.reduce((s, p) => amountAdd(s, p.value), '0') : null,
    positions: selected.length,
    reasons,
  };
}

// Same observed-report cohort in both quarters. A missing report is never an exit.
// Presence counts are manager counts, not independent owners, control, or market share.
export function sharedOverlap(
  data: SharedData,
  company: string,
  peer: string,
  before: string,
  after: string,
) {
  if (
    company === peer ||
    !data.catalog.companies.some((c) => c.cik === company) ||
    !data.catalog.companies.some((c) => c.cik === peer) ||
    !data.periods.includes(before) ||
    !data.periods.includes(after) ||
    before >= after
  )
    throw new Error('Choose two covered companies and increasing quarters');
  const find = (m: string, c: string, p: string) =>
    data.cells.find((x) => x.manager === m && x.company === c && x.period === p);
  const available = (m: string) =>
    [company, peer].every((c) =>
      [before, after].every((p) => {
        const v = find(m, c, p);
        return v && v.status !== 'unavailable';
      }),
    );
  const cohort = data.managers.filter((m) => available(m.cik)).map((m) => m.cik);
  const matches = (period: string, managers: string[]) =>
    managers.filter((m) => [company, peer].every((c) => find(m, c, period)?.status === 'reported'));
  return {
    cohort,
    excluded: data.managers.filter((m) => !cohort.includes(m.cik)).map((m) => m.cik),
    before: matches(before, cohort),
    after: matches(after, cohort),
    observedBefore: matches(
      before,
      data.managers.map((m) => m.cik),
    ),
    observedAfter: matches(
      after,
      data.managers.map((m) => m.cik),
    ),
  };
}
export function sharedStateCounts(data: SharedData, groupId?: string) {
  const group = data.catalog.groups.find((g) => g.id === groupId),
    counts: Record<string, number> = {};
  if (groupId && !group) return counts;
  for (const c of data.companies)
    if (c.state && (!group || group.companies.includes(c.cik)))
      counts[c.state] = (counts[c.state] ?? 0) + 1;
  return counts;
}
