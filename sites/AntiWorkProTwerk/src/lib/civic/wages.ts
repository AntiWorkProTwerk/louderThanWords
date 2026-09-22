import { z } from 'zod';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amount = z.number().int().nonnegative().safe().nullable();
export const wagePlanSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,80}$/),
    title: z.string().min(1).max(180),
    from: date,
    through: date,
    industryPrefixes: z
      .array(z.string().regex(/^\d{2,6}$/))
      .max(20)
      .default([]),
    states: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .max(60)
      .default([]),
    maxRecords: z.number().int().min(1).max(50000).default(15000),
  })
  .refine((p) => p.from <= p.through, 'Findings-end range is reversed');
export const wageCaseSchema = z.object({
  id: z.string().regex(/^\d{1,10}$/),
  name: z.string(),
  legalName: z.string().nullable(),
  employerKey: z.string().regex(/^we-[a-f0-9]{20}$/),
  city: z.string().nullable(),
  state: z.string().nullable(),
  reportedState: z.string().nullable(),
  industry: z.string().nullable(),
  industryDescription: z.string().nullable(),
  start: date.nullable(),
  end: date,
  loaded: date.nullable(),
  backWages: amount,
  penalties: amount,
  employeesAgreed: amount,
  employeesViolation: amount,
  violations: amount,
  repeatCode: z.string().nullable(),
  source: z.object({
    member: z.string(),
    row: z.number().int().positive(),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  facts: z.array(z.object({ field: z.string(), value: z.string() })),
  cautions: z.array(z.string()),
});
export const wageDataSchema = z.object({
  formatVersion: z.literal(1),
  pipelineVersion: z.literal('wage-ledger-v1'),
  plan: wagePlanSchema,
  observedAt: z.string().datetime(),
  trackingStartedAt: z.string().datetime(),
  source: z.object({
    url: z.string().url(),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().positive(),
    lastModified: z.string().nullable(),
    metadataHash: z.string().regex(/^[a-f0-9]{64}$/),
    metadataUrl: z.string().url(),
  }),
  dictionary: z.array(z.object({ field: z.string(), description: z.string(), type: z.string() })),
  coverage: z.object({
    scannedRows: z.number().int().positive(),
    selectedRows: z.number().int().nonnegative(),
    missingFindingsEnd: z.number().int().nonnegative(),
    futureFindingsEnd: z.number().int().nonnegative(),
    members: z.array(z.object({ name: z.string(), rows: z.number().int().positive() })).min(1),
    completeArchive: z.literal(true),
  }),
  records: z.array(wageCaseSchema),
  changes: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['newly_observed', 'updated', 'not_returned']),
      detail: z.string(),
    }),
  ),
});
export type WageData = z.infer<typeof wageDataSchema>;
export type WageCase = z.infer<typeof wageCaseSchema>;
export const wageSummarySchema = wageCaseSchema.omit({
  start: true,
  loaded: true,
  repeatCode: true,
  source: true,
  facts: true,
  cautions: true,
});
export type WageSummary = z.infer<typeof wageSummarySchema>;
export function wageSelection(params: URLSearchParams) {
  return {
    state: params.get('state') ?? '',
    q: params.get('q') ?? '',
    employer: params.get('employer') ?? '',
    year: params.get('year') ?? '',
    outcome: params.get('outcome') ?? 'all',
  };
}
export function filterWages<T extends WageSummary>(
  data: { records: T[] },
  filters: Partial<ReturnType<typeof wageSelection>>,
) {
  const terms = (filters.q ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  return data.records.filter(
    (r) =>
      (!filters.state || r.state === filters.state) &&
      (!filters.employer || r.employerKey === filters.employer) &&
      (!filters.year || r.end.startsWith(`${filters.year}-`)) &&
      (filters.outcome !== 'positive' || (r.violations !== null && r.violations > 0)) &&
      (filters.outcome !== 'zero' || r.violations === 0) &&
      terms.every((t) =>
        [r.id, r.name, r.legalName, r.city, r.industry, r.industryDescription]
          .join(' ')
          .toLowerCase()
          .includes(t),
      ),
  );
}
export function wageTotals(records: WageSummary[]) {
  const empty = () => ({ known: 0, missing: 0, complete: true });
  const totals = {
    cases: records.length,
    withViolations: 0,
    zeroViolations: 0,
    backWages: empty(),
    penalties: empty(),
    employeesAgreed: empty(),
    employeesViolation: empty(),
  };
  const fields = ['backWages', 'penalties', 'employeesAgreed', 'employeesViolation'] as const;
  for (const record of records) {
    if (record.violations !== null && record.violations > 0) totals.withViolations++;
    if (record.violations === 0) totals.zeroViolations++;
    for (const field of fields) {
      const value = record[field],
        result = totals[field];
      if (value === null) {
        result.missing++;
        result.complete = false;
      } else {
        result.known += value;
        if (!Number.isSafeInteger(result.known))
          throw new Error('WHD aggregate exceeds exact integer range');
      }
    }
  }
  return totals;
}
export function wageEmployers<T extends WageSummary>(records: T[]) {
  const groups = new Map<string, T[]>();
  for (const record of records) {
    const group = groups.get(record.employerKey) ?? [];
    group.push(record);
    groups.set(record.employerKey, group);
  }
  return [...groups]
    .map(([id, cases]) => ({
      id,
      name: cases[0].legalName ?? cases[0].name,
      legalName: cases[0].legalName,
      records: cases.toSorted((a, b) => a.end.localeCompare(b.end) || Number(a.id) - Number(b.id)),
      states: [...new Set(cases.map((r) => r.reportedState).filter(Boolean))],
      ...wageTotals(cases),
    }))
    .sort((a, b) => b.cases - a.cases || a.name.localeCompare(b.name));
}
const wageCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});
export const wageMoney = (cents: number | null) =>
  cents === null ? 'Not reported' : wageCurrency.format(cents / 100);
