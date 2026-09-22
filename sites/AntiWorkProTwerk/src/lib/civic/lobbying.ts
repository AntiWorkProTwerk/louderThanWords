import { z } from 'zod';

const id = z.number().int().positive().safe();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const lobbyingPlanSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,80}$/),
    title: z.string().min(1).max(180),
    clientIds: z.array(id).min(1).max(20),
    fromYear: z.number().int().min(2022).max(2100),
    throughYear: z.number().int().min(2022).max(2100),
    maxPerClientYear: z.number().int().min(1).max(1000).default(200),
  })
  .refine(
    (p) => p.fromYear <= p.throughYear && p.throughYear - p.fromYear <= 5,
    'Use one to six filing years',
  )
  .refine((p) => new Set(p.clientIds).size === p.clientIds.length, 'Duplicate client IDs');
export type LobbyingPlan = z.infer<typeof lobbyingPlanSchema>;

export const lobbyingFilingSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  typeLabel: z.string(),
  year: z.number().int(),
  period: z.string(),
  periodLabel: z.string(),
  quarter: z.number().int().min(1).max(4).nullable(),
  isAmendment: z.boolean(),
  posted: z.string().datetime({ offset: true }),
  client: z.object({
    id,
    name: z.string(),
    state: z.string().nullable(),
    country: z.string().nullable(),
  }),
  registrant: z.object({ id, name: z.string() }),
  incomeCents: z.number().int().safe().nonnegative().nullable(),
  expensesCents: z.number().int().safe().nonnegative().nullable(),
  activities: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      description: z.string().nullable(),
      governmentEntities: z.array(z.object({ id, name: z.string() })),
      // These are literal mentions, not resolved legislative identities or positions.
      billMentions: z.array(
        z.object({ text: z.string(), start: z.number().int(), end: z.number().int() }),
      ),
    }),
  ),
  source: z.object({
    url: z.string().url(),
    apiUrl: z.string().url(),
    pageHash: digest,
    recordHash: digest,
  }),
});
export type LobbyingFiling = z.infer<typeof lobbyingFilingSchema>;
export const LDA_NOTICE =
  'Senate Office of Public Records cannot vouch for the data or analyses derived from these data after the data have been retrieved from LDA.gov.';
export const lobbyingDataSchema = z.object({
  formatVersion: z.literal(1),
  pipelineVersion: z.literal('lobbying-agenda-v1'),
  plan: lobbyingPlanSchema,
  observedAt: z.string().datetime(),
  sourceNotice: z.literal(LDA_NOTICE),
  coverage: z.array(
    z.object({ clientId: id, year: z.number().int(), count: z.number().int().nonnegative() }),
  ),
  sources: z.array(
    z.object({ url: z.string().url(), hash: digest, observedAt: z.string().datetime() }),
  ),
  records: z.array(lobbyingFilingSchema),
  changes: z.object({
    baselineAt: z.string().datetime().nullable(),
    added: z.array(z.string().uuid()),
    updated: z.array(z.string().uuid()),
    notReturned: z.array(z.string().uuid()),
  }),
});
export type LobbyingData = z.infer<typeof lobbyingDataSchema>;

/** Compare only the latest posted report within a registrant/client/quarter series.
 * Keep all versions inspectable. Tied posting times remain unresolved, not arbitrary winners.
 * This is a presentation rule, not an assertion about formal supersession. */
export function lobbyingSeries(records: LobbyingFiling[]) {
  const groups = new Map<string, LobbyingFiling[]>();
  for (const r of records) {
    if (r.quarter === null) continue;
    const key = `${r.client.id}:${r.registrant.id}:${r.year}:Q${r.quarter}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups]
    .map(([key, versions]) => {
      versions.sort(
        (a, b) => Date.parse(b.posted) - Date.parse(a.posted) || a.id.localeCompare(b.id),
      );
      const latest =
        versions.length > 1 && Date.parse(versions[0].posted) === Date.parse(versions[1].posted)
          ? null
          : versions[0];
      return { key, versions, latest };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Source-coded issue introductions within consecutive observed quarters only.
 * A missing quarter never becomes a zero-activity baseline. */
export function lobbyingAgenda(records: LobbyingFiling[]) {
  const series = lobbyingSeries(records),
    byRelationship = new Map<string, typeof series>();
  for (const group of series) {
    const r = group.versions[0],
      key = `${r.client.id}:${r.registrant.id}`;
    byRelationship.set(key, [...(byRelationship.get(key) ?? []), group]);
  }
  return [...byRelationship.values()].flatMap((groups) => {
    groups.sort(
      (a, b) =>
        a.versions[0].year * 4 +
        a.versions[0].quarter! -
        (b.versions[0].year * 4 + b.versions[0].quarter!),
    );
    return groups.map((group, i) => {
      const r = group.versions[0],
        prior = groups[i - 1],
        p = prior?.versions[0];
      const adjacent = !!p && r.year * 4 + r.quarter! === p.year * 4 + p.quarter! + 1;
      const comparable = adjacent && !!group.latest && !!prior.latest;
      const previousCodes = new Set(prior?.latest?.activities.map((a) => a.code) ?? []);
      return {
        ...group,
        comparable,
        previousId: comparable ? prior.latest!.id : null,
        newCodes: comparable
          ? [...new Set(group.latest!.activities.map((a) => a.code))]
              .filter((code) => !previousCodes.has(code))
              .sort()
          : [],
      };
    });
  });
}

export function filterLobbying(records: LobbyingFiling[], params: URLSearchParams) {
  const q = (params.get('q') ?? '').toLowerCase().trim(),
    client = params.get('client'),
    year = params.get('year'),
    code = params.get('issue'),
    state = params.get('state');
  return records.filter(
    (r) =>
      (!client || String(r.client.id) === client) &&
      (!year || String(r.year) === year) &&
      (!state || (r.client.country === 'US' && r.client.state === state)) &&
      (!code || r.activities.some((a) => a.code === code)) &&
      (!q ||
        [
          r.client.name,
          r.registrant.name,
          r.id,
          ...r.activities.flatMap((a) => [
            a.code,
            a.label,
            a.description ?? '',
            ...a.governmentEntities.map((e) => e.name),
          ]),
        ].some((s) => s.toLowerCase().includes(q))),
  );
}
