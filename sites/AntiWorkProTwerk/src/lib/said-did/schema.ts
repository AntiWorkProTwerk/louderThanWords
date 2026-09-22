import { z } from 'zod';

export const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);
export const date = z.string().date();
export const stamp = z.string().datetime({ offset: true });
export const assessments = ['consistent', 'apparent_tension', 'context_dependent'] as const;
export const assessmentLabels = {
  consistent: 'Consistent',
  apparent_tension: 'Apparent tension',
  context_dependent: 'Context dependent',
};
export const actionKinds = [
  'passage',
  'amendment',
  'procedure',
  'table',
  'combined_passage',
  'sponsorship',
  'voice',
] as const;
export const actionLabels = {
  passage: 'Passage vote',
  amendment: 'Amendment vote',
  procedure: 'Procedural vote',
  table: 'Motion to table',
  combined_passage: 'Combined suspension and passage',
  sponsorship: 'Sponsorship',
  voice: 'Chamber voice vote',
};
export const personSchema = z.object({
  id,
  bioguideId: z
    .string()
    .regex(/^[A-Z][0-9]{6}$/)
    .nullable(),
  name: z.string().min(1),
  fictional: z.boolean(),
  terms: z
    .array(
      z.object({
        state: z.string().regex(/^[A-Z]{2}$/),
        party: z.enum(['D', 'R', 'I']),
        district: z.string(),
        chamber: z.enum(['House', 'Senate']),
        from: date,
        to: date,
      }),
    )
    .min(1),
});
export const sourceSchema = z.object({
  id,
  provider: z.string(),
  externalId: z.string(),
  title: z.string(),
  url: z
    .string()
    .url()
    .refine((s) => s.startsWith('https://'))
    .nullable(),
  kind: z.enum(['fixture', 'official']),
  text: z.string().min(1).max(2_000_000),
  date,
  publishedAt: stamp,
  fetchedAt: stamp,
  modifiedAt: stamp,
  page: z.string(),
  publicationRights: z.enum(['public_record', 'fixture', 'third_party', 'unknown']),
  provenance: z
    .object({
      rawHash: z.string(),
      parserVersion: z.string(),
      publicationTimePrecision: z.enum(['date', 'timestamp']),
      modifiedTimePrecision: z.enum(['unknown', 'timestamp']),
    })
    .optional(),
});
export const measureSchema = z.object({
  id,
  congress: z.number().int().positive(),
  type: z.enum(['hr', 's', 'hres', 'sres', 'hjres', 'sjres', 'hamdt', 'samdt']),
  number: z.number().int().positive(),
  title: z.string(),
  policy: z.string(),
  policyDefinition: z.string(),
  parentId: id.nullable(),
  versions: z
    .array(z.object({ id, issued: date, sourceId: id, provision: z.string().min(1) }))
    .min(1),
});
export const passageSchema = z.object({
  id,
  sourceId: id,
  personId: id.nullable(),
  identityEvidence: z.string(),
  attribution: z.enum(['verified', 'ambiguous', 'third_party']),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  kind: z.enum([
    'recorded_statement',
    'inserted_statement',
    'floor_verified',
    'third_party',
    'unknown',
  ]),
  eventDate: date,
  eventTime: stamp.nullable(),
  mediaUrl: z
    .string()
    .url()
    .refine((url) => url.startsWith('https://'))
    .nullable(),
  context: z.string(),
  contextMeasureId: id.nullable(),
  contextEvidence: z.string(),
});
export const actionSchema = z.object({
  id,
  personId: id.nullable(),
  measureId: id,
  versionId: id.nullable(),
  sourceId: id,
  congress: z.number().int().positive(),
  chamber: z.enum(['House', 'Senate']),
  session: z.number().int().min(1).max(2),
  roll: z.number().int().positive().nullable(),
  date,
  time: stamp.nullable(),
  kind: z.enum(actionKinds),
  question: z.string().min(1),
  result: z.string(),
  rawVote: z.string(),
  vote: z.enum(['Yea', 'Nay', 'Present', 'Not Voting', 'Sponsored', 'Chamber action']),
  operativeText: z.enum(['established', 'unresolved', 'changed']),
  conditionsMet: z.enum(['yes', 'no', 'unknown', 'not_applicable']),
  context: z.string(),
});
export const corpusSchema = z.object({
  formatVersion: z.literal(1),
  scope: z.object({
    id,
    title: z.string(),
    mode: z.enum(['demo', 'real']),
    chamber: z.enum(['House', 'Senate', 'Both']),
    from: date,
    through: date,
    eligibility: z.string().min(10),
    exclusions: z.array(z.object({ id: z.string(), reason: z.string() })),
    lookbackDays: z.number().int().positive(),
  }),
  people: z.array(personSchema),
  sources: z.array(sourceSchema),
  measures: z.array(measureSchema),
  passages: z.array(passageSchema),
  actions: z.array(actionSchema),
});
export const claimSchema = z.object({
  id,
  passageId: id,
  quoteStart: z.number().int().nonnegative(),
  quoteEnd: z.number().int().positive(),
  quote: z.string().min(1),
  type: z.enum([
    'voting_intention',
    'position',
    'conditional',
    'policy',
    'aspiration',
    'description',
  ]),
  stance: z.enum(['support', 'oppose', 'unclear']),
  targetId: id.nullable(),
  policy: z.string(),
  qualifiers: z.array(z.string()),
  conditions: z.array(z.string()),
  meaning: z.string(),
  sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed', 'not_assessed']),
});
export const reviewSchema = z.object({
  id,
  candidateId: id,
  fingerprint: z.string(),
  reviewer: z.string().min(2),
  reviewedAt: stamp,
  decision: z.enum(['approved', 'rejected', 'needs_evidence', 'withdrawn']),
  rationale: z.string().min(10),
  assessment: z.enum(assessments),
  explanation: z.string().min(15),
  limitations: z.array(z.string()).min(1),
  checks: z.object({
    identity: z.boolean(),
    quote: z.boolean(),
    action: z.boolean(),
    text: z.boolean(),
    chronology: z.boolean(),
    qualifications: z.boolean(),
    contraryEvidence: z.boolean(),
  }),
  factsPassAt: stamp,
  contextPassAt: stamp,
  independentReview: z.boolean(),
});
export type Corpus = z.infer<typeof corpusSchema>;
export type Person = z.infer<typeof personSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Action = z.infer<typeof actionSchema>;
export type Assessment = (typeof assessments)[number];
export const candidateSchema = z.object({
  id,
  fingerprint: z.string(),
  claim: claimSchema,
  passage: passageSchema,
  person: personSchema.nullable(),
  action: actionSchema.nullable(),
  measure: measureSchema.nullable(),
  basis: z.enum(['explicit_measure', 'debate_context', 'reviewed_policy', 'none']),
  chronology: z.enum([
    'statement_before_action',
    'same_day_order_unknown',
    'action_before_statement',
    'unknown',
  ]),
  suggestedAssessment: z.enum(assessments),
  blockers: z.array(z.string()),
  cautions: z.array(z.string()),
  status: z.enum(['draft', 'needs_evidence', 'unrelated']),
  sourceHashes: z.record(z.string(), z.string()),
});
export type Candidate = z.infer<typeof candidateSchema>;
export const evidenceSchema = sourceSchema.omit({ text: true }).extend({
  hash: z.string(),
  excerpt: z.string(),
  role: z.enum(['statement', 'action', 'provision']),
  normalizedStart: z.number().int(),
  normalizedEnd: z.number().int(),
});
export const comparisonSchema = z.object({
  id,
  version: z.number().int().positive(),
  fingerprint: z.string(),
  person: personSchema,
  state: z.string(),
  party: z.string(),
  district: z.string(),
  chamber: z.string(),
  claim: claimSchema.omit({ meaning: true, sentiment: true }),
  statement: passageSchema,
  action: actionSchema,
  measure: measureSchema,
  assessment: z.enum(assessments),
  explanation: z.string(),
  limitations: z.array(z.string()),
  basis: z.enum(['explicit_measure', 'debate_context', 'reviewed_policy']),
  chronology: z.enum(['statement_before_action', 'same_day_order_unknown']),
  evidence: z.array(evidenceSchema),
  reviewedAt: stamp,
  publishedAt: stamp,
  reviewMode: z.enum(['demo', 'independent', 'single_reviewer']),
  status: z.enum(['published', 'correction_pending', 'withdrawn']),
  history: z.array(
    z.object({ version: z.number(), release: id, status: z.string(), note: z.string() }),
  ),
});
export type Comparison = z.infer<typeof comparisonSchema>;
export const indexItemSchema = comparisonSchema
  .pick({
    id: true,
    version: true,
    state: true,
    party: true,
    district: true,
    chamber: true,
    assessment: true,
    status: true,
  })
  .extend({
    personId: id,
    name: z.string(),
    measureId: id,
    measureTitle: z.string(),
    policy: z.string(),
    quote: z.string(),
    statementDate: date,
    actionDate: date,
    actionKind: z.enum(actionKinds),
    explanation: z.string(),
  });
export type IndexItem = z.infer<typeof indexItemSchema>;
export const indexSchema = z.object({
  release: id,
  items: z.array(indexItemSchema),
  people: z.array(personSchema),
  measures: z.array(measureSchema),
});
export const manifestSchema = z.object({
  formatVersion: z.literal(1),
  release: id,
  publishedAt: stamp,
  scope: corpusSchema.shape.scope,
  counts: z.object({
    sources: z.number(),
    passages: z.number(),
    actions: z.number(),
    candidates: z.number(),
    published: z.number(),
    needsEvidence: z.number(),
    unmatched: z.number(),
  }),
  states: z.record(z.string(), z.number()),
  lastSourceDate: date,
  methodologyVersion: z.string(),
});
export type EvidenceManifest = z.infer<typeof manifestSchema>;
export type EvidenceIndex = z.infer<typeof indexSchema>;
