import { z } from 'zod';
export const waterId = z.string().regex(/^[A-Z0-9]{9}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/),
  date = z.string().date().nullable();
export const waterKinds = ['contaminant', 'treatment', 'monitoring', 'reporting', 'other'] as const;
export const waterKindNames = {
  contaminant: 'Contaminant / disinfectant limit',
  treatment: 'Treatment requirement',
  monitoring: 'Monitoring / combined reporting',
  reporting: 'Reporting requirement',
  other: 'Other / unclassified',
};
export const waterKindHelp = {
  contaminant:
    'A reported exceedance of a contaminant or residual disinfectant limit. It is a historical compliance record, not a current measurement at your tap.',
  treatment:
    'A required treatment process was not met. This is health-based, but does not by itself report a measured contaminant exceedance.',
  monitoring:
    'Required testing, or combined monitoring and reporting, was not completed as required. Missing evidence cannot tell us whether the water met a contaminant limit.',
  reporting:
    'Required reporting was not completed as required. A reporting violation is not itself a measured contaminant exceedance.',
  other:
    'Read the exact violation description and rule. Public notice, consumer information and other duties can differ from water-quality limits.',
};
export function waterKind(code: string): (typeof waterKinds)[number] {
  return ['MCL', 'MRDL'].includes(code)
    ? 'contaminant'
    : code === 'TT'
      ? 'treatment'
      : ['MR', 'MON'].includes(code)
        ? 'monitoring'
        : code === 'RPT'
          ? 'reporting'
          : 'other';
}
export const waterStatusHelp: Record<string, string> = {
  Resolved:
    'EPA records a resolving action: return to compliance, a rule no longer applying, or no further action needed. Not a current water-quality test.',
  Archived:
    'No longer counted in current status because of age or system inactivity; not necessarily resolved.',
  Addressed: 'A formal enforcement action is recorded; not necessarily resolved.',
  Unaddressed:
    'No qualifying formal action is recorded for this status. It does not prove that nobody responded.',
};
export const waterPlanSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    selection: z.string().min(1),
    counties: z
      .array(z.object({ state: z.string().regex(/^[A-Z]{2}$/), county: z.string().min(1) }))
      .min(1)
      .max(30),
    types: z.array(z.enum(['CWS', 'NTNCWS', 'TNCWS'])).min(1),
    active: z.enum(['A', 'all']),
    from: z.string().date(),
    through: z.string().date(),
    maxSystems: z.number().int().positive().max(10000),
  })
  .refine(
    (p) =>
      p.from <= p.through &&
      new Set(p.counties.map((c) => `${c.state}/${c.county}`)).size === p.counties.length,
    'Invalid water collection scope',
  );
export type WaterPlan = z.infer<typeof waterPlanSchema>;
export const waterRowSchema = z.object({
  row: z.number().int().positive(),
  hash: digest,
  fields: z.record(z.string(), z.string()),
});
export type WaterRow = z.infer<typeof waterRowSchema>;
const codeSchema = z.object({ code: z.string(), label: z.string().nullable() });
export const waterSummarySchema = z.object({
  id: waterId,
  name: z.string(),
  state: z.string(),
  counties: z.array(z.string()),
  type: codeSchema,
  activity: codeSchema,
  sourceType: codeSchema,
  population: z.number().int().nonnegative().nullable(),
  retained: z.boolean(),
  frs: z
    .string()
    .regex(/^\d{12}$/)
    .nullable(),
  kinds: z.object({
    contaminant: z.number().int().nonnegative(),
    treatment: z.number().int().nonnegative(),
    monitoring: z.number().int().nonnegative(),
    reporting: z.number().int().nonnegative(),
    other: z.number().int().nonnegative(),
  }),
  violations: z.number().int().nonnegative(),
  recordHash: digest,
});
export type WaterSummary = z.infer<typeof waterSummarySchema>;
export const waterActionSchema = z.object({
  id: z.string(),
  date,
  code: codeSchema,
  category: z.string().nullable(),
  firstReported: date,
  lastReported: date,
  sourceRows: z.array(z.number().int().positive()),
});
export const waterViolationSchema = z.object({
  intervalIssue: z.literal('reversed').nullable(),
  id: z.string().min(1),
  from: date,
  through: date,
  returned: date,
  status: z.string().nullable(),
  code: codeSchema,
  category: z.string(),
  kind: z.enum(waterKinds),
  healthBased: z.boolean().nullable(),
  contaminant: codeSchema,
  rule: codeSchema,
  measure: z.string().nullable(),
  units: z.string().nullable(),
  federalLimit: z.string().nullable(),
  stateLimit: z.string().nullable(),
  firstReported: date,
  lastReported: date,
  actions: z.array(waterActionSchema),
  sourceRows: z.array(waterRowSchema),
});
export type WaterViolation = z.infer<typeof waterViolationSchema>;
export const waterDetailSchema = z.object({
  system: waterSummarySchema,
  quarter: z.string().regex(/^\d{4}Q[1-4]$/),
  inventory: waterRowSchema,
  geography: z.array(waterRowSchema),
  search: waterRowSchema.nullable(),
  violations: z.array(waterViolationSchema),
  standaloneActions: z.array(
    z.object({ action: waterActionSchema, rows: z.array(waterRowSchema) }),
  ),
  outsideWindowActionRows: z.number().int().nonnegative(),
});
export type WaterDetail = z.infer<typeof waterDetailSchema>;
const sourceSchema = z.object({
  url: z.string().url(),
  hash: digest,
  bytes: z.number().int().positive(),
  observedAt: z.string().datetime(),
  lastModified: z.string().nullable(),
  etag: z.string().nullable(),
});
export const waterDataSchema = z
  .object({
    formatVersion: z.literal(1),
    pipelineVersion: z.literal('sdwa-v1'),
    plan: waterPlanSchema,
    observedAt: z.string().datetime(),
    quarter: z.string().regex(/^\d{4}Q[1-4]$/),
    sources: z.object({ records: sourceSchema, search: sourceSchema }),
    tables: z.array(
      z.object({
        member: z.string(),
        rows: z.number().int().nonnegative(),
        selected: z.number().int().nonnegative(),
        headers: z.array(z.string()),
      }),
    ),
    systems: z.array(waterSummarySchema),
    changes: z.object({
      baselineAt: z.string().datetime().nullable(),
      added: z.array(waterId),
      updated: z.array(waterId),
      outsideDiscovery: z.array(waterId),
    }),
  })
  .refine(
    (d) =>
      new Set(d.systems.map((s) => s.id)).size === d.systems.length &&
      d.systems.length <= d.plan.maxSystems,
    'Duplicate or oversized water collection',
  );
export type WaterData = z.infer<typeof waterDataSchema>;
export function filterWater(data: WaterData, params: URLSearchParams) {
  const terms = (params.get('q') ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean),
    kind = params.get('kind');
  return data.systems.filter(
    (s) =>
      (!params.get('state') || s.state === params.get('state')) &&
      (!params.get('type') || s.type.code === params.get('type')) &&
      (!kind ||
        (waterKinds.includes(kind as never) && s.kinds[kind as keyof typeof s.kinds] > 0)) &&
      terms.every((t) => `${s.id} ${s.name} ${s.counties.join(' ')}`.toLowerCase().includes(t)),
  );
}
export function waterStateCounts(data: WaterData, params: URLSearchParams) {
  const p = new URLSearchParams(params);
  p.delete('state');
  return filterWater(data, p).reduce<Record<string, number>>((a, s) => {
    a[s.state] = (a[s.state] ?? 0) + 1;
    return a;
  }, {});
}
export const waterSystemUrl = (id: string) =>
  `https://echo.epa.gov/detailed-facility-report?fid=${id}`;
export function waterYears(violations: WaterViolation[]) {
  const result = new Map<string, Record<(typeof waterKinds)[number], number>>();
  for (const v of violations) {
    const year = v.intervalIssue ? 'Unknown' : (v.from?.slice(0, 4) ?? 'Unknown');
    const row = result.get(year) ?? {
      contaminant: 0,
      treatment: 0,
      monitoring: 0,
      reporting: 0,
      other: 0,
    };
    row[v.kind]++;
    result.set(year, row);
  }
  return [...result]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, counts]) => ({
      year,
      ...counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    }));
}
