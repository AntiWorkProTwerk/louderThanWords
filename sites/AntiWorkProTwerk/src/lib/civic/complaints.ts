import { z } from 'zod';
import { monthSchema, monthIndex, shiftMonth, monthsBetween } from './economy';
export const complaintPlanSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,80}$/),
    from: monthSchema,
    through: monthSchema,
    product: z.string().trim().min(1).max(200),
    companies: z.array(z.string().trim().min(1).max(200)).min(1).max(10),
    pageSize: z.number().int().min(1).max(100).default(100),
    maxPerMonth: z.number().int().min(1).max(10000).default(2000),
  })
  .refine(
    (p) =>
      monthIndex(p.through) - monthIndex(p.from) >= 3 &&
      monthIndex(p.through) - monthIndex(p.from) < 24,
    'Choose four to twenty-four months',
  )
  .refine((p) => new Set(p.companies).size === p.companies.length, 'Duplicate company');
export const complaintSchema = z.object({
  id: z.string().regex(/^\d{1,10}$/),
  received: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sent: z.string().nullable(),
  company: z.string(),
  product: z.string(),
  subProduct: z.string().nullable(),
  issue: z.string(),
  subIssue: z.string().nullable(),
  clusterId: z.string().regex(/^cg-[a-f0-9]{16}$/),
  state: z.string().nullable(),
  reportedState: z.string().nullable(),
  companyResponse: z.string().nullable(),
  companyPublicResponse: z.string().nullable(),
  timely: z.enum(['yes', 'no', 'unknown']),
  submittedVia: z.string().nullable(),
  source: z.object({ url: z.string().url(), hash: z.string().regex(/^[a-f0-9]{64}$/) }),
});
export const complaintDataSchema = z.object({
  formatVersion: z.literal(1),
  pipelineVersion: z.literal('consumer-radar-v1'),
  plan: complaintPlanSchema,
  observedAt: z.string().datetime(),
  records: z.array(complaintSchema),
  coverage: z.array(
    z.object({
      month: monthSchema,
      total: z.number().int().nonnegative(),
      complete: z.literal(true),
    }),
  ),
  sources: z.array(
    z.object({
      month: monthSchema,
      url: z.string().url(),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      observedAt: z.string().datetime(),
      indexedAt: z.string(),
    }),
  ),
  changes: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['newly_observed', 'updated', 'not_returned']),
      detail: z.string(),
    }),
  ),
  trackingStartedAt: z.string().datetime(),
  narratives: z.literal('not_available_in_current_api'),
});
export type ComplaintData = z.infer<typeof complaintDataSchema>;
export type Complaint = z.infer<typeof complaintSchema>;
export function monthEnd(month: string) {
  monthSchema.parse(month);
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
}
export function complaintSelection(data: ComplaintData, params: URLSearchParams) {
  const months = monthsBetween(data.plan.from, data.plan.through),
    split = params.get('split') ?? months[Math.floor(months.length / 2)];
  return {
    split,
    state: params.get('state') ?? '',
    company: params.get('company') ?? '',
    q: params.get('q') ?? '',
    cluster: params.get('cluster') ?? '',
    period:
      params.get('period') === 'baseline'
        ? 'baseline'
        : params.get('period') === 'all'
          ? 'all'
          : 'recent',
  };
}
export function complaintPeriods(data: ComplaintData, split: string) {
  monthSchema.parse(split);
  if (split <= data.plan.from || split > data.plan.through)
    throw new Error('Choose a split month inside this collection.');
  const before = { from: `${data.plan.from}-01`, through: monthEnd(shiftMonth(split, -1)) },
    after = { from: `${split}-01`, through: monthEnd(data.plan.through) };
  const days = (p: typeof before) => (Date.parse(p.through) - Date.parse(p.from)) / 86400000 + 1;
  return { before: { ...before, days: days(before) }, after: { ...after, days: days(after) } };
}
export function filterComplaints(
  data: ComplaintData,
  filters: { state?: string; company?: string; q?: string; cluster?: string },
) {
  const terms = (filters.q ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return data.records.filter(
    (r) =>
      (!filters.state || r.state === filters.state) &&
      (!filters.company || r.company === filters.company) &&
      (!filters.cluster || r.clusterId === filters.cluster) &&
      terms.every((t) =>
        [r.id, r.company, r.product, r.subProduct, r.issue, r.subIssue]
          .join(' ')
          .toLowerCase()
          .includes(t),
      ),
  );
}
export function complaintGroups(
  data: ComplaintData,
  filters: { state?: string; company?: string; q?: string },
  split: string,
) {
  const periods = complaintPeriods(data, split),
    records = filterComplaints(data, filters),
    boundary = periods.after.from;
  const beforeTotal = records.filter((r) => r.received < boundary).length,
    afterTotal = records.length - beforeTotal;
  const groups = new Map<
    string,
    {
      id: string;
      issue: string;
      subIssue: string | null;
      product: string;
      subProduct: string | null;
      before: number;
      after: number;
    }
  >();
  for (const record of records) {
    const group = groups.get(record.clusterId) ?? {
      id: record.clusterId,
      issue: record.issue,
      subIssue: record.subIssue,
      product: record.product,
      subProduct: record.subProduct,
      before: 0,
      after: 0,
    };
    group[record.received < boundary ? 'before' : 'after']++;
    groups.set(record.clusterId, group);
  }
  return [...groups.values()]
    .map((group) => {
      const beforePerDay = group.before / periods.before.days,
        afterPerDay = group.after / periods.after.days,
        growth = group.before ? (afterPerDay / beforePerDay - 1) * 100 : null,
        beforeShare = beforeTotal ? (group.before / beforeTotal) * 100 : null,
        afterShare = afterTotal ? (group.after / afterTotal) * 100 : null;
      return {
        ...group,
        beforePerDay,
        afterPerDay,
        growth,
        beforeShare,
        afterShare,
        shareChange: beforeShare !== null && afterShare !== null ? afterShare - beforeShare : null,
        signal:
          group.before === 0 && group.after >= 5
            ? 'new_in_slice'
            : group.before >= 5 && group.after >= 5 && growth !== null && growth >= 25
              ? 'rising'
              : 'context',
      };
    })
    .sort(
      (a, b) =>
        Number(b.signal !== 'context') - Number(a.signal !== 'context') ||
        b.afterPerDay - a.afterPerDay ||
        a.id.localeCompare(b.id),
    );
}
export function complaintExamples(records: Complaint[], count = 3) {
  if (!Number.isInteger(count) || count < 1) throw new Error('Choose a positive example count');
  const sorted = records.toSorted(
    (a, b) => a.received.localeCompare(b.received) || Number(a.id) - Number(b.id),
  );
  if (sorted.length <= count) return sorted;
  if (count === 1) return [sorted[Math.floor(sorted.length / 2)]];
  return Array.from(
    { length: count },
    (_, i) => sorted[Math.round((i * (sorted.length - 1)) / (count - 1))],
  );
}
