import { z } from 'zod';

export const ruleId = z.string().regex(/^\d{4}-\d{4,6}$/);
export const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const httpsUrl = z
  .string()
  .url()
  .refine((s) => {
    const u = new URL(s);
    return u.protocol === 'https:' && !u.username && !u.password;
  });
export const ruleTextSchema = z.object({
  formatVersion: z.literal(1),
  documentId: ruleId,
  blocks: z.array(
    z.object({
      id: z.string(),
      section: z.enum(['summary', 'dates', 'supplement', 'regulatory']),
      kind: z.enum(['heading', 'paragraph', 'amendment', 'table', 'omission']),
      text: z.string(),
    }),
  ),
});
export type RuleText = z.infer<typeof ruleTextSchema>;
export const ruleSchema = z.object({
  id: ruleId,
  title: z.string().min(1),
  type: z.enum(['Rule', 'Proposed Rule', 'Notice', 'Presidential Document']),
  action: z.string(),
  abstract: z.string(),
  publicationDate: z.string().date(),
  effectiveOn: z.string().date().nullable(),
  commentsCloseOn: z.string().date().nullable(),
  dates: z.string(),
  agencies: z.array(z.object({ id: z.number().int(), name: z.string(), slug: z.string() })),
  topics: z.array(z.string()),
  docketIds: z.array(z.string()),
  rins: z.array(z.string()),
  cfr: z.array(z.object({ title: z.number().int(), part: z.string() })),
  correctionOf: ruleId.nullable(),
  corrections: z.array(ruleId),
  htmlUrl: httpsUrl,
  pdfUrl: httpsUrl,
  xmlUrl: httpsUrl,
  source: z.object({
    url: httpsUrl,
    hash: checksum,
    xmlHash: checksum,
    observedAt: z.string().datetime(),
  }),
  textHash: checksum,
  blockCount: z.number().int().nonnegative(),
  amendmentCount: z.number().int().nonnegative(),
});
export type RuleRecord = z.infer<typeof ruleSchema>;
export const rulesDataSchema = z.object({
  formatVersion: z.literal(1),
  pipelineVersion: z.literal('quiet-rulebook-v1'),
  collectionId: z.string(),
  term: z.string(),
  agency: z.string(),
  from: z.string().date(),
  through: z.string().date(),
  observedAt: z.string().datetime(),
  trackingStartedAt: z.string().datetime(),
  totalMatches: z.number().int().nonnegative(),
  truncated: z.boolean(),
  documents: z.array(ruleSchema),
  events: z.array(
    z.object({
      documentId: ruleId,
      kind: z.enum(['document_added', 'record_updated']),
      observedAt: z.string().datetime(),
      previousObservedAt: z.string().datetime().nullable(),
      previousTextHash: checksum.nullable(),
      textHash: checksum,
      changedFields: z.array(z.string()),
    }),
  ),
});
export type RulesData = z.infer<typeof rulesDataSchema>;
export function filterRules(
  data: RulesData,
  filters: {
    q?: string;
    type?: string;
    topic?: string;
    agency?: string;
    docket?: string;
    rin?: string;
  },
) {
  const words = (filters.q ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  return data.documents.filter(
    (d) =>
      (!filters.type || d.type === filters.type) &&
      (!filters.topic || d.topics.includes(filters.topic)) &&
      (!filters.agency || d.agencies.some((a) => a.slug === filters.agency)) &&
      (!filters.docket || d.docketIds.includes(filters.docket)) &&
      (!filters.rin || d.rins.includes(filters.rin)) &&
      words.every((w) =>
        [d.id, d.title, d.action, d.abstract, ...d.topics, ...d.docketIds, ...d.rins]
          .join(' ')
          .toLowerCase()
          .includes(w),
      ),
  );
}
export function relatedRules(data: RulesData, selected: RuleRecord) {
  return data.documents
    .filter((d) => d.id !== selected.id)
    .map((d) => ({
      document: d,
      reasons: [
        ...d.docketIds
          .filter((id) => selected.docketIds.includes(id))
          .map((id) => `Shared docket ${id}`),
        ...d.rins.filter((id) => selected.rins.includes(id)).map((id) => `Shared RIN ${id}`),
        ...(d.correctionOf === selected.id ||
        selected.correctionOf === d.id ||
        d.corrections.includes(selected.id) ||
        selected.corrections.includes(d.id)
          ? ['Source-linked correction']
          : []),
      ],
    }))
    .filter((d) => d.reasons.length);
}
export const ruleWatchSchema = z.object({
  formatVersion: z.literal(1),
  topics: z.array(z.string()).max(100),
  seen: z.array(z.string()).max(20000),
});
export type RuleWatch = z.infer<typeof ruleWatchSchema>;
export function ruleFingerprint(d: RuleRecord) {
  return JSON.stringify([
    d.id,
    d.textHash,
    d.title,
    d.type,
    d.action,
    d.dates,
    d.effectiveOn,
    d.commentsCloseOn,
    d.topics,
    d.docketIds,
    d.rins,
    d.correctionOf,
    d.corrections,
  ]);
}
export function matchesRuleTopics(data: RulesData, document: RuleRecord, topics: string[]) {
  if (!topics.length) return false;
  if (document.topics.some((t) => topics.includes(t))) return true;
  // One explicit identifier hop only. Do not assign inherited topic labels to the source record.
  return relatedRules(data, document).some((connection) =>
    connection.document.topics.some((t) => topics.includes(t)),
  );
}
export function ruleAlerts(data: RulesData, watch: RuleWatch) {
  const seen = new Set(watch.seen);
  return data.documents.filter(
    (d) => matchesRuleTopics(data, d, watch.topics) && !seen.has(ruleFingerprint(d)),
  );
}
