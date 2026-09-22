import { z } from 'zod';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.string().date();
export const billKeySchema = z.object({
  congress: z.number().int().min(113).max(200),
  type: z.enum(['HR', 'S']),
  number: z.number().int().positive().max(99999),
});
export type BillKey = z.infer<typeof billKeySchema>;
export const billId = (b: BillKey) => `${b.congress}-${b.type.toLowerCase()}-${b.number}`;
export const billLabel = (b: BillKey) => `${b.type === 'HR' ? 'H.R.' : 'S.'} ${b.number}`;
export const billUrl = (b: BillKey) =>
  `https://www.congress.gov/bill/${b.congress}th-congress/${b.type === 'HR' ? 'house' : 'senate'}-bill/${b.number}`;
export const statusUrl = (b: BillKey) =>
  `https://www.govinfo.gov/bulkdata/BILLSTATUS/${b.congress}/${b.type.toLowerCase()}/BILLSTATUS-${b.congress}${b.type.toLowerCase()}${b.number}.xml`;
export const graveyardPlanSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    selection: z.string().min(1),
    ranges: z
      .array(
        z
          .object({
            congress: billKeySchema.shape.congress,
            type: billKeySchema.shape.type,
            first: billKeySchema.shape.number,
            last: billKeySchema.shape.number,
          })
          .refine(
            (r) => r.last >= r.first && r.last - r.first < 500,
            'Range must contain 1–500 numbers',
          ),
      )
      .min(1)
      .max(20),
  })
  .superRefine((p, ctx) => {
    const ids = new Set<string>();
    for (const r of p.ranges)
      for (let number = r.first; number <= r.last; number++) {
        const id = billId({ ...r, number });
        if (ids.has(id)) ctx.addIssue({ code: 'custom', message: 'Overlapping bill ranges' });
        ids.add(id);
      }
    if (ids.size > 2000)
      ctx.addIssue({
        code: 'custom',
        message: 'Split collections larger than 2,000 bills into explicit cohorts',
      });
  });
export type GraveyardPlan = z.infer<typeof graveyardPlanSchema>;
export function plannedBills(plan: GraveyardPlan): BillKey[] {
  return plan.ranges.flatMap((r) =>
    Array.from({ length: r.last - r.first + 1 }, (_, n) => ({
      congress: r.congress,
      type: r.type,
      number: r.first + n,
    })),
  );
}
export const statusActionSchema = z.object({
  date,
  text: z.string(),
  type: z.string(),
  code: z.string(),
  sourceCode: z.string(),
  sourceName: z.string(),
  // Raw source time is preserved, not converted to a falsely precise UTC sequence.
  time: z.string(),
  votes: z.array(
    z.object({
      chamber: z.string(),
      congress: z.number().int(),
      session: z.string(),
      roll: z.string(),
      url: z.string().url(),
    }),
  ),
});
export type StatusAction = z.infer<typeof statusActionSchema>;
export const milestoneLabels = {
  introduced: 'Introduced',
  committee: 'Committee activity',
  floor: 'Floor consideration',
  house: 'Passed House',
  senate: 'Passed Senate',
  president: 'Sent to President',
  law: 'Became law',
} as const;
export type Milestone = keyof typeof milestoneLabels;
export const milestonesSchema = z.object({
  introduced: date.nullable(),
  committee: date.nullable(),
  floor: date.nullable(),
  house: date.nullable(),
  senate: date.nullable(),
  president: date.nullable(),
  law: date.nullable(),
});
export const stages = [
  'Introduction / referral',
  'Committee activity',
  'Floor consideration',
  'Passed one chamber',
  'Passed both chambers',
  'Sent to President',
  'Became law',
] as const;
export function furthestStage(m: z.infer<typeof milestonesSchema>): (typeof stages)[number] {
  return m.law
    ? stages[6]
    : m.president
      ? stages[5]
      : m.house && m.senate
        ? stages[4]
        : m.house || m.senate
          ? stages[3]
          : m.floor
            ? stages[2]
            : m.committee
              ? stages[1]
              : stages[0];
}
export const billSummarySchema = billKeySchema
  .extend({
    id: z.string().regex(/^\d+-(hr|s)-\d+$/),
    title: z.string().min(1),
    introduced: date,
    updated: z.string().min(1),
    policy: z.string().min(1),
    subjects: z.array(z.string()),
    sponsors: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        state: z.string(),
        party: z.string(),
        byRequest: z.string(),
      }),
    ),
    latest: z.object({ date, text: z.string().min(1) }),
    milestones: milestonesSchema,
    actionCount: z.number().int().positive(),
    amendmentCount: z.number().int().nonnegative(),
    sourceHash: digest,
    relatedLaw: z.array(z.object({ id: z.string(), relationship: z.string(), title: z.string() })),
  })
  .refine((b) => b.id === billId(b), 'Bill identity mismatch');
export type BillSummary = z.infer<typeof billSummarySchema>;
const relatedSchema = z.object({
  congress: z.number().int(),
  type: z.string(),
  number: z.number().int(),
  id: z.string(),
  title: z.string(),
  relationships: z.array(z.object({ type: z.string(), identifiedBy: z.string() })),
  latest: z.object({ date, text: z.string() }).nullable(),
});
export const billDetailSchema = z
  .object({
    bill: billSummarySchema,
    actions: z.array(statusActionSchema).min(1),
    committees: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        chamber: z.string(),
        activities: z.array(z.object({ date: z.string(), name: z.string() })),
      }),
    ),
    amendments: z.array(
      z.object({
        id: z.string(),
        congress: z.number().int(),
        type: z.string(),
        number: z.number().int(),
        description: z.string(),
        purpose: z.string(),
        parentAmendment: z.string().nullable(),
        actions: z.array(statusActionSchema),
        latest: z.object({ date, text: z.string() }).nullable(),
      }),
    ),
    related: z.array(relatedSchema),
    laws: z.array(z.object({ type: z.string(), number: z.string() })),
  })
  .superRefine((d, ctx) => {
    if (d.bill.actionCount !== d.actions.length || d.bill.amendmentCount !== d.amendments.length)
      ctx.addIssue({ code: 'custom', message: 'Detail counts mismatch' });
  });
export type BillDetail = z.infer<typeof billDetailSchema>;
export const graveyardDataSchema = z
  .object({
    formatVersion: z.literal(1),
    pipelineVersion: z.literal('bill-status-v1'),
    plan: graveyardPlanSchema,
    observedAt: z.string().datetime(),
    bills: z.array(billSummarySchema),
    missing: z.array(
      z.object({
        id: z.string(),
        url: z.string().url(),
        status: z.union([z.literal(404), z.literal(200)]),
        reason: z.string(),
        sourceHash: digest,
      }),
    ),
    changes: z.object({
      baselineAt: z.string().datetime().nullable(),
      added: z.array(z.string()),
      updated: z.array(z.string()),
      notReturned: z.array(z.string()),
    }),
  })
  .superRefine((d, ctx) => {
    const expected = new Set(plannedBills(d.plan).map(billId));
    for (const row of [...d.bills, ...d.missing]) {
      if (!expected.delete(row.id))
        ctx.addIssue({ code: 'custom', message: 'Duplicate or unplanned bill' });
    }
    if (expected.size) ctx.addIssue({ code: 'custom', message: 'Incomplete collection' });
  });
export type GraveyardData = z.infer<typeof graveyardDataSchema>;
export function daysSinceAction(b: BillSummary, asOf: string) {
  return Math.max(
    0,
    Math.floor((Date.parse(asOf.slice(0, 10)) - Date.parse(b.latest.date)) / 86400000),
  );
}
export function filterBills(data: GraveyardData, params: URLSearchParams) {
  const terms = (params.get('q') ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return data.bills.filter(
    (b) =>
      (!params.get('state') || b.sponsors.some((s) => s.state === params.get('state'))) &&
      (!params.get('congress') || String(b.congress) === params.get('congress')) &&
      (!params.get('chamber') || b.type === params.get('chamber')) &&
      (!params.get('policy') || b.policy === params.get('policy')) &&
      (!params.get('stage') || furthestStage(b.milestones) === params.get('stage')) &&
      (!params.get('quiet') ||
        (!b.milestones.law &&
          daysSinceAction(b, data.observedAt) >= Number(params.get('quiet')))) &&
      terms.every((t) =>
        `${b.id} ${billLabel(b)} ${b.title} ${b.policy} ${b.subjects.join(' ')} ${b.sponsors.map((s) => s.name).join(' ')}`
          .toLowerCase()
          .includes(t),
      ),
  );
}
export function billStateCounts(data: GraveyardData, params: URLSearchParams) {
  const p = new URLSearchParams(params);
  p.delete('state');
  return filterBills(data, p).reduce<Record<string, number>>((counts, b) => {
    for (const state of new Set(b.sponsors.map((s) => s.state).filter(Boolean)))
      counts[state] = (counts[state] ?? 0) + 1;
    return counts;
  }, {});
}
// Policy comparisons intentionally ignore outcome/inactivity filters: selecting quiet bills must
// not turn the denominator into only quiet bills. Each Congress remains its own observation cohort.
export function policyProgress(data: GraveyardData, params: URLSearchParams) {
  const p = new URLSearchParams(params);
  p.delete('stage');
  p.delete('quiet');
  p.delete('policy');
  const groups = new Map<
    string,
    {
      policy: string;
      congress: number;
      total: number;
      floor: number;
      passed: number;
      law: number;
      quiet: number;
    }
  >();
  for (const b of filterBills(data, p)) {
    const key = `${b.congress}:${b.policy}`;
    const g = groups.get(key) ?? {
      policy: b.policy,
      congress: b.congress,
      total: 0,
      floor: 0,
      passed: 0,
      law: 0,
      quiet: 0,
    };
    g.total++;
    if (b.milestones.floor) g.floor++;
    if (b.milestones.house || b.milestones.senate) g.passed++;
    if (b.milestones.law) g.law++;
    if (!b.milestones.law && daysSinceAction(b, data.observedAt) >= 180) g.quiet++;
    groups.set(key, g);
  }
  return [...groups.values()].sort(
    (a, b) => a.policy.localeCompare(b.policy) || a.congress - b.congress,
  );
}
