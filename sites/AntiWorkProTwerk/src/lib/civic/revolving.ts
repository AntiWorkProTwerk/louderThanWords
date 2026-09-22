import { z } from 'zod';
import { lobbyingPlanSchema, lobbyingFilingSchema, LDA_NOTICE } from './lobbying';

export const careerObservationSchema = z.object({
  id: z.string().regex(/^[a-f0-9-]{36}:\d+:\d+$/),
  filingId: z.string().uuid(),
  activityIndex: z.number().int().nonnegative(),
  personId: z.number().int().positive().safe(),
  name: z.string().min(1),
  coveredPosition: z.string().nullable(),
  positionStatus: z.enum(['disclosed', 'blank', 'reported_none']),
  reportedNew: z.boolean(),
});
export type CareerObservation = z.infer<typeof careerObservationSchema>;
export const revolvingDataSchema = z
  .object({
    formatVersion: z.literal(1),
    pipelineVersion: z.literal('revolving-record-v1'),
    plan: lobbyingPlanSchema,
    observedAt: z.string().datetime(),
    sourceNotice: z.literal(LDA_NOTICE),
    coverage: z.array(
      z.object({
        clientId: z.number().int().positive(),
        year: z.number().int(),
        count: z.number().int().nonnegative(),
      }),
    ),
    sources: z.array(
      z.object({
        url: z.string().url(),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
        observedAt: z.string().datetime(),
      }),
    ),
    filings: z.array(lobbyingFilingSchema),
    observations: z.array(careerObservationSchema),
    changes: z.object({
      baselineAt: z.string().datetime().nullable(),
      added: z.array(z.string()),
      updated: z.array(z.string()),
      notReturned: z.array(z.string()),
    }),
  })
  .superRefine((data, context) => {
    const filings = new Map(data.filings.map((f) => [f.id, f]));
    if (
      filings.size !== data.filings.length ||
      new Set(data.observations.map((o) => o.id)).size !== data.observations.length
    )
      context.addIssue({ code: 'custom', message: 'Duplicate career evidence identifiers' });
    for (const o of data.observations)
      if (
        !filings.get(o.filingId)?.activities[o.activityIndex] ||
        o.id !== `${o.filingId}:${o.activityIndex}:${o.personId}` ||
        o.positionStatus !== coveredPositionStatus(o.coveredPosition)
      )
        context.addIssue({
          code: 'custom',
          message: 'Career observation is not bound to its source activity',
        });
  });
export type RevolvingData = z.infer<typeof revolvingDataSchema>;

export function coveredPositionStatus(text: string | null): CareerObservation['positionStatus'] {
  if (text === null || text.trim() === '') return 'blank';
  return /^(?:n\/?a|none|not applicable|no covered positions?)[.\s]*$/i.test(text.trim())
    ? 'reported_none'
    : 'disclosed';
}

export function careerPeople(data: RevolvingData, params = new URLSearchParams()) {
  const q = (params.get('q') ?? '').trim().toLowerCase(),
    state = params.get('state'),
    client = params.get('client'),
    filing = params.get('filing'),
    year = params.get('year'),
    scope = params.get('positions') ?? 'disclosed';
  const filings = new Map(data.filings.map((f) => [f.id, f])),
    people = new Map<number, CareerObservation[]>(),
    histories = new Map<number, CareerObservation[]>();
  for (const observation of data.observations) {
    if (!histories.has(observation.personId)) histories.set(observation.personId, []);
    histories.get(observation.personId)!.push(observation);
    const f = filings.get(observation.filingId)!;
    if (!f) throw new Error('Career observation has no source filing');
    if (
      (state && (f.client.country !== 'US' || f.client.state !== state)) ||
      (client && String(f.client.id) !== client) ||
      (filing && f.id !== filing) ||
      (year && String(f.year) !== year)
    )
      continue;
    if (!people.has(observation.personId)) people.set(observation.personId, []);
    people.get(observation.personId)!.push(observation);
  }
  return [...people]
    .map(([id, observations]) => {
      // Keep identity/previous-role context from the captured collection even when viewing a later blank filing.
      const history = histories.get(id)!,
        names = [...new Set(history.map((o) => o.name))].sort(),
        positions = [
          ...new Set(
            history.filter((o) => o.positionStatus === 'disclosed').map((o) => o.coveredPosition!),
          ),
        ],
        reports = [...new Set(observations.map((o) => o.filingId))]
          .map((id) => filings.get(id)!)
          .sort((a, b) => Date.parse(a.posted) - Date.parse(b.posted) || a.id.localeCompare(b.id));
      return { id, names, positions, history, observations, reports };
    })
    .filter(
      (p) =>
        (scope === 'all' || p.positions.length > 0) &&
        (!q ||
          [
            ...p.names,
            ...p.positions,
            ...p.reports.flatMap((f) => [
              f.client.name,
              f.registrant.name,
              ...f.activities.map((a) => a.label),
            ]),
          ].some((s) => s.toLowerCase().includes(q))),
    )
    .sort((a, b) => a.names[0].localeCompare(b.names[0]) || a.id - b.id);
}

/** Unique source-person IDs by reported client state, not sightings summed across activities. */
export function careerStateCounts(data: RevolvingData, params = new URLSearchParams()) {
  const filters = new URLSearchParams(params);
  filters.delete('state');
  const counts = new Map<string, Set<number>>();
  for (const person of careerPeople(data, filters))
    for (const f of person.reports)
      if (f.client.country === 'US' && f.client.state) {
        if (!counts.has(f.client.state)) counts.set(f.client.state, new Set());
        counts.get(f.client.state)!.add(person.id);
      }
  return Object.fromEntries([...counts].map(([state, ids]) => [state, ids.size]));
}

export function careerRelationships(data: RevolvingData, personId: number) {
  const people = careerPeople(data, new URLSearchParams('positions=all')),
    person = people.find((p) => p.id === personId);
  if (!person) return [];
  const groups = new Map<string, typeof person.reports>();
  for (const f of person.reports) {
    const key = `${f.client.id}:${f.registrant.id}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  return [...groups].map(([key, reports]) => ({
    key,
    client: reports[0].client,
    registrant: reports[0].registrant,
    reports,
    firstPosted: reports[0].posted,
    lastPosted: reports.at(-1)!.posted,
  }));
}
