import { z } from 'zod';

export const echoPrograms = ['CAA', 'CWA', 'RCRA', 'SDWA'] as const;
export const echoProgramNames = {
  CAA: 'Air',
  CWA: 'Wastewater / stormwater',
  RCRA: 'Hazardous waste',
  SDWA: 'Drinking water',
} as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
// ECHO's RegistryID field may be a program ID when no FRS association exists.
export const registryIdSchema = z.string().regex(/^[A-Z0-9]{2,20}$/);
const count = z.number().int().nonnegative().nullable();
export const echoQuerySchema = z.object({
  state: z.string().regex(/^[A-Z]{2}$/),
  city: z.string().min(1).max(80),
  naics: z.string().regex(/^\d{2,6}$/),
  active: z.enum(['Y', 'N', 'A']),
});
export const echoPlanSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    selection: z.string().min(1),
    queries: z.array(echoQuerySchema).min(1).max(20),
    maxFacilities: z.number().int().positive().max(500),
  })
  .refine(
    (p) => new Set(p.queries.map((q) => JSON.stringify(q))).size === p.queries.length,
    'Duplicate EPA query',
  );
export type EchoPlan = z.infer<typeof echoPlanSchema>;
export type EchoQuery = z.infer<typeof echoQuerySchema>;
const periodSchema = z.object({
  section: z.string(),
  program: z.string(),
  from: z.string().date().nullable(),
  through: z.string().date().nullable(),
});
const programSummarySchema = z.object({
  program: z.string(),
  sourceId: z.string(),
  quartersInNC: count,
  currentSNC: z.string().nullable(),
  asOf: z.string().date().nullable(),
});
export const echoFacilitySchema = z.object({
  id: registryIdSchema,
  identitySystem: z.string(),
  name: z.string(),
  city: z.string(),
  state: z.string(),
  street: z.string(),
  zip: z.string(),
  lat: z.number().min(-90).max(90).nullable(),
  lon: z.number().min(-180).max(180).nullable(),
  coordinateMethod: z.string().nullable(),
  coordinateAccuracy: z.string().nullable(),
  queryMatches: z.array(z.number().int().nonnegative()),
  retained: z.boolean(),
  programs: z.array(programSummarySchema),
  inspectionRows: z.number().int().nonnegative(),
  informalRows: z.number().int().nonnegative(),
  formalRows: z.number().int().nonnegative(),
  latestEvent: z.string().date().nullable(),
  recordHash: digest,
});
export type EchoFacility = z.infer<typeof echoFacilitySchema>;
export const echoEventSchema = z.object({
  id: z.string(),
  kind: z.enum(['inspection', 'informal', 'formal']),
  program: z.string(),
  sourceId: z.string(),
  date: z.string().date().nullable(),
  type: z.string(),
  agency: z.string().nullable(),
  penaltyCents: z.number().int().nonnegative().nullable(),
  penaltyReported: z.string().nullable(),
  official: z.string().nullable(),
  finding: z.string().nullable(),
  locator: z.string(),
  fields: z.record(z.string(), z.unknown()),
});
export type EchoEvent = z.infer<typeof echoEventSchema>;
export const echoDetailSchema = z.object({
  facility: echoFacilitySchema,
  source: z.object({ url: z.string().url(), hash: digest, fetchedAt: z.string().datetime() }),
  extractDates: z.array(z.object({ system: z.string(), date: z.string().date().nullable() })),
  periods: z.array(periodSchema),
  quarters: z.array(
    z.object({
      program: z.enum(echoPrograms),
      sourceId: z.string(),
      cells: z.array(
        z.object({
          ordinal: z.number().int(),
          from: z.string().date(),
          through: z.string().date(),
          status: z.string().nullable(),
          additional: z.boolean(),
        }),
      ),
    }),
  ),
  events: z.array(echoEventSchema),
  evidence: z.record(z.string(), z.unknown()),
});
export type EchoDetail = z.infer<typeof echoDetailSchema>;
export const echoDataSchema = z
  .object({
    formatVersion: z.literal(1),
    pipelineVersion: z.literal('epa-echo-v1'),
    plan: echoPlanSchema,
    observedAt: z.string().datetime(),
    discoveries: z.array(
      z.object({
        query: echoQuerySchema,
        rows: z.number().int().nonnegative(),
        sourceHash: digest,
        pageHashes: z.array(digest),
      }),
    ),
    facilities: z.array(echoFacilitySchema),
    changes: z.object({
      baselineAt: z.string().datetime().nullable(),
      added: z.array(registryIdSchema),
      updated: z.array(registryIdSchema),
      outsideDiscovery: z.array(registryIdSchema),
    }),
  })
  .superRefine((d, ctx) => {
    if (
      new Set(d.facilities.map((f) => f.id)).size !== d.facilities.length ||
      d.facilities.length > d.plan.maxFacilities ||
      d.discoveries.length !== d.plan.queries.length ||
      d.facilities.some(
        (f) =>
          f.queryMatches.some((i) => !d.plan.queries[i]) || (!f.queryMatches.length && !f.retained),
      )
    )
      ctx.addIssue({ code: 'custom', message: 'EPA collection scope mismatch' });
  });
export type EchoData = z.infer<typeof echoDataSchema>;
export const echoFacilityUrl = (id: string) =>
  `https://echo.epa.gov/detailed-facility-report?fid=${id}`;
export function echoInvalidWindow(from: string, through: string) {
  return !!(
    (from && !z.string().date().safeParse(from).success) ||
    (through && !z.string().date().safeParse(through).success) ||
    (from && through && from > through)
  );
}
export function echoStatus(status: string | null) {
  if (!status) return 'unknown';
  if (['No Violation Identified', 'No Violation'].includes(status)) return 'none';
  if (/Significant|High Priority|Enforcement Priority/.test(status)) return 'priority';
  if (
    ['Violation Identified', 'Violation', 'Noncompliance', 'Violation Unresolved'].includes(status)
  )
    return 'violation';
  if (/Inactive|Not Applicable|Terminated/.test(status)) return 'inactive';
  return 'unknown';
}
export function filterEcho(data: EchoData, params: URLSearchParams) {
  const terms = (params.get('q') ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean),
    program = params.get('program');
  return data.facilities.filter(
    (f) =>
      (!params.get('state') || f.state === params.get('state')) &&
      (!program || f.programs.some((p) => p.program === program)) &&
      (params.get('repeated') !== '1' ||
        f.programs.some(
          (p) =>
            (!program || p.program === program) && p.quartersInNC !== null && p.quartersInNC >= 2,
        )) &&
      terms.every((t) =>
        `${f.id} ${f.name} ${f.city} ${f.programs.map((p) => p.sourceId).join(' ')}`
          .toLowerCase()
          .includes(t),
      ),
  );
}
export function echoStateCounts(data: EchoData, params: URLSearchParams) {
  const p = new URLSearchParams(params);
  p.delete('state');
  return filterEcho(data, p).reduce<Record<string, number>>((counts, f) => {
    counts[f.state] = (counts[f.state] ?? 0) + 1;
    return counts;
  }, {});
}
export function echoYearRows(events: EchoEvent[], program = '') {
  const years = new Map<
    string,
    { year: string; inspection: number; informal: number; formal: number }
  >();
  for (const event of events) {
    if (!event.date || (program && event.program !== program)) continue;
    const year = event.date.slice(0, 4),
      row = years.get(year) ?? { year, inspection: 0, informal: 0, formal: 0 };
    row[event.kind]++;
    years.set(year, row);
  }
  return [...years.values()].sort((a, b) => a.year.localeCompare(b.year));
}
