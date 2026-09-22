import { z } from 'zod';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const ccnSchema = z.string().regex(/^[A-Z0-9]{6}$/);
const pac = z.string().regex(/^\d{10}$/);
const numeric = z.number().finite().nonnegative().nullable();
const integer = z.number().int().nonnegative().nullable();
export const nursingPlanSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    states: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .min(1)
      .max(60),
    maxFacilities: z.number().int().positive().max(25000),
  })
  .refine((p) => new Set(p.states).size === p.states.length, 'Duplicate states');
export type NursingPlan = z.infer<typeof nursingPlanSchema>;
export const nursingSourceKinds = [
  'enrollments',
  'owners',
  'providers',
  'intervals',
  'penalties',
] as const;
export const nursingSourceSchema = z.object({
  kind: z.enum(nursingSourceKinds),
  url: z.string().url(),
  metadataUrl: z.string().url(),
  title: z.string(),
  modified: z.string().date(),
  period: z.string(),
  released: z.string(),
  hash: digest,
  bytes: z.number().int().positive(),
  rows: z.number().int().nonnegative(),
});
export type NursingSource = z.infer<typeof nursingSourceSchema>;
export function ownershipRole(code: string) {
  if (['01', '03', '34', '35', '38', '39', '85', '86'].includes(code)) return 'ownership';
  if (['25', '40', '41', '42', '43', '63'].includes(code)) return 'management';
  if (['36', '37'].includes(code)) return 'financial';
  return 'other';
}
export const roleLabels = {
  ownership: 'Ownership interest / partner',
  management: 'Officer / management',
  financial: 'Mortgage / security interest',
  other: 'Other disclosed association',
} as const;
export const facilitySchema = z.object({
  id: ccnSchema,
  name: z.string().min(1),
  legalName: z.string(),
  city: z.string(),
  state: z.string(),
  lat: z.number().min(-90).max(90).nullable(),
  lon: z.number().min(-180).max(180).nullable(),
  overall: z.number().int().min(1).max(5).nullable(),
  health: z.number().int().min(1).max(5).nullable(),
  staffing: z.number().int().min(1).max(5).nullable(),
  beds: integer,
  rnHours: numeric,
  totalHours: numeric,
  deficiencies: integer,
  finesCents: integer,
  penalties: integer,
  ownerCount: z.number().int().nonnegative(),
  enrollmentCount: z.number().int().nonnegative(),
  recordHash: digest,
});
export type NursingFacility = z.infer<typeof facilitySchema>;
export const facilitySummarySchema = facilitySchema.omit({ recordHash: true });
export type NursingSummary = z.infer<typeof facilitySummarySchema>;
export const partySchema = z.object({
  id: pac,
  type: z.enum(['I', 'O', '']),
  names: z.array(z.string()).min(1),
  // One CCN may occur under several roles; never sum role lists to count facilities.
  facilitiesByRole: z.record(z.string(), z.array(ccnSchema)),
});
export type NursingParty = z.infer<typeof partySchema>;
export const nursingAssociationSchema = z.object({
  ownerId: pac,
  name: z.string(),
  type: z.enum(['I', 'O', '']),
  enrollmentId: z.string().regex(/^O\d{14}$/),
  role: z.string(),
  roleText: z.string(),
  associated: z.string().date().nullable(),
  percentage: numeric,
  sourceRow: z.number().int().positive(),
  rowHash: digest,
});
export const nursingDetailSchema = z.object({
  facility: facilitySchema,
  providerRow: z.number().int().positive(),
  providerRowHash: digest,
  processingDate: z.string().date(),
  address: z.string(),
  zip: z.string(),
  changedOwnership: z.string(),
  geocodingFootnote: z.string(),
  footnotes: z.record(z.string(), z.string()),
  surveyDate: z.string().date().nullable(),
  priorSurveyDate: z.string().date().nullable(),
  priorDeficiencies: integer,
  enrollments: z.array(
    z.object({
      id: z.string().regex(/^O\d{14}$/),
      associateId: pac,
      legalName: z.string(),
      ccn: ccnSchema,
      sourceRow: z.number().int().positive(),
      rowHash: digest,
    }),
  ),
  associations: z.array(nursingAssociationSchema),
  penalties: z.array(
    z.object({
      date: z.string().date(),
      type: z.string(),
      fineCents: integer,
      denialStart: z.string().date().nullable(),
      denialDays: integer,
      sourceRow: z.number().int().positive(),
      rowHash: digest,
    }),
  ),
});
export type NursingDetail = z.infer<typeof nursingDetailSchema>;
export const nursingDataSchema = z
  .object({
    formatVersion: z.literal(1),
    pipelineVersion: z.literal('nursing-cms-v1'),
    plan: nursingPlanSchema,
    observedAt: z.string().datetime(),
    sources: z.array(nursingSourceSchema).length(5),
    intervals: z.array(
      z.object({
        code: z.string(),
        label: z.string(),
        from: z.string().date().nullable(),
        through: z.string().date().nullable(),
        range: z.string(),
        processingDate: z.string().date(),
      }),
    ),
    facilities: z.array(facilitySchema),
    parties: z.array(partySchema),
    coverage: z.object({
      selectedProviders: z.number().int(),
      matchedProviders: z.number().int(),
      selectedEnrollments: z.number().int(),
      selectedAssociations: z.number().int(),
      ownerRowsWithoutEnrollment: z.number().int(),
      selectedEnrollmentCcnsWithoutProvider: z.array(z.string()),
      unresolvedEnrollments: z.array(
        z.object({ id: z.string(), ccn: z.string(), reason: z.string() }),
      ),
    }),
    changes: z.object({
      baselineAt: z.string().datetime().nullable(),
      newFacilities: z.array(ccnSchema),
      changedFacilities: z.array(ccnSchema),
      notReturned: z.array(ccnSchema),
    }),
  })
  .superRefine((d, ctx) => {
    const ids = new Set(d.facilities.map((f) => f.id));
    if (
      ids.size !== d.facilities.length ||
      new Set(d.parties.map((p) => p.id)).size !== d.parties.length ||
      new Set(d.sources.map((s) => s.kind)).size !== 5
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate source, facility or party IDs' });
    for (const p of d.parties)
      for (const ccns of Object.values(p.facilitiesByRole)) {
        if (new Set(ccns).size !== ccns.length || ccns.some((id) => !ids.has(id)))
          ctx.addIssue({ code: 'custom', message: 'Invalid party-to-facility references' });
      }
    if (
      d.facilities.some((f) => !d.plan.states.includes(f.state)) ||
      d.facilities.length > d.plan.maxFacilities ||
      d.coverage.selectedProviders !== d.facilities.length
    )
      ctx.addIssue({ code: 'custom', message: 'Facility collection scope mismatch' });
  });
export type NursingData = z.infer<typeof nursingDataSchema>;
export const facilityUrl = (ccn: string) =>
  `https://www.medicare.gov/care-compare/details/nursing-home/${ccn}/view-all?state=All`;
export function partyFacilities(party: NursingParty, role = 'ownership') {
  return new Set(
    Object.entries(party.facilitiesByRole)
      .filter(([code]) => role === 'all' || ownershipRole(code) === role)
      .flatMap(([, ids]) => ids),
  );
}
export type NursingView = { facilities: NursingSummary[]; parties: NursingParty[] };
export function filterNursing(data: NursingView, params: URLSearchParams) {
  const party = data.parties.find((p) => p.id === params.get('owner'));
  const linked = party ? partyFacilities(party, params.get('role') ?? 'ownership') : null;
  const terms = (params.get('q') ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matchingOwners = new Set(
    (terms.length ? data.parties : [])
      .filter((p) => terms.every((t) => `${p.id} ${p.names.join(' ')}`.toLowerCase().includes(t)))
      .flatMap((p) => [...partyFacilities(p, params.get('role') ?? 'ownership')]),
  );
  return data.facilities.filter(
    (f) =>
      (!params.get('state') || f.state === params.get('state')) &&
      (!params.get('owner') || !!linked?.has(f.id)) &&
      (terms.every((t) => `${f.id} ${f.name} ${f.legalName} ${f.city}`.toLowerCase().includes(t)) ||
        matchingOwners.has(f.id)),
  );
}
export function nursingCounts(data: NursingView, params: URLSearchParams) {
  const p = new URLSearchParams(params);
  p.delete('state');
  return filterNursing(data, p).reduce<Record<string, number>>((counts, f) => {
    counts[f.state] = (counts[f.state] ?? 0) + 1;
    return counts;
  }, {});
}
export function nursingComparison(facilities: NursingSummary[]) {
  const median = (key: 'rnHours' | 'totalHours' | 'deficiencies') => {
    const values = facilities
      .map((f) => f[key])
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    return {
      value: !values.length
        ? null
        : values.length % 2
          ? values[mid]
          : (values[mid - 1] + values[mid]) / 2,
      available: values.length,
      total: facilities.length,
    };
  };
  return {
    rnHours: median('rnHours'),
    totalHours: median('totalHours'),
    deficiencies: median('deficiencies'),
  };
}
