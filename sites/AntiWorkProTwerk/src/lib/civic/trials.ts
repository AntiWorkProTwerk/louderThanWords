import { z } from 'zod';

export const registryDateSchema = z.object({
  value: z.string().regex(/^\d{4}(-\d{2})?(-\d{2})?$/),
  precision: z.enum(['year', 'month', 'day']),
  type: z.enum(['ACTUAL', 'ESTIMATED', 'UNKNOWN']),
});
export const trialSchema = z.object({
  id: z.string().regex(/^NCT\d{8}$/),
  title: z.string().min(1),
  status: z.string(),
  sponsor: z.object({ id: z.string(), name: z.string(), category: z.string() }),
  conditions: z.array(z.string()),
  mesh: z.array(z.object({ id: z.string(), term: z.string() })),
  completion: registryDateSchema.nullable(),
  primaryCompletion: registryDateSchema.nullable(),
  firstResultsPosted: registryDateSchema.nullable(),
  updated: registryDateSchema.nullable(),
  results: z.enum(['posted', 'not_posted', 'unknown']),
  states: z.array(z.string()),
  locations: z.array(
    z.object({
      facility: z.string(),
      city: z.string(),
      state: z.string().nullable(),
      reportedState: z.string(),
      lat: z.number().min(-90).max(90).nullable(),
      lon: z.number().min(-180).max(180).nullable(),
    }),
  ),
  publications: z.array(z.object({ pmid: z.string().regex(/^\d+$/), type: z.string() })),
  source: z.object({
    url: z.string().url(),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    observedAt: z.string().datetime(),
  }),
  warnings: z.array(z.string()),
});
export const trialDataSchema = z.object({
  formatVersion: z.literal(1),
  pipelineVersion: z.literal('trial-results-v1'),
  collectionId: z.string(),
  condition: z.string(),
  observedAt: z.string().datetime(),
  trackingStartedAt: z.string().datetime(),
  totalMatches: z.number().int().nonnegative().nullable(),
  discoveryTruncated: z.boolean(),
  studies: z.array(trialSchema),
  states: z.record(z.string(), z.number().int().nonnegative()),
  exclusions: z.array(z.object({ id: z.string(), reason: z.string() })),
  events: z.array(
    z.object({
      studyId: z.string(),
      kind: z.enum(['results_appeared', 'results_no_longer_marked', 'status_changed']),
      observedAt: z.string().datetime(),
      previousObservedAt: z.string().datetime(),
      detail: z.string(),
    }),
  ),
});
export type Trial = z.infer<typeof trialSchema>;
export type TrialData = z.infer<typeof trialDataSchema>;
export const resultsLabels = {
  posted: 'Registry results posted',
  not_posted: 'No registry results posted',
  unknown: 'Results status unknown',
};

export function filterTrials(
  data: TrialData,
  filters: { q?: string; state?: string; results?: string; sponsor?: string; topic?: string },
  includeOtherStatuses = false,
) {
  const terms = (filters.q ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  return data.studies.filter(
    (study) =>
      (includeOtherStatuses || study.status === 'COMPLETED') &&
      (!filters.state || study.states.includes(filters.state)) &&
      (!filters.results || study.results === filters.results) &&
      (!filters.sponsor || study.sponsor.id === filters.sponsor) &&
      (!filters.topic || study.conditions.includes(filters.topic)) &&
      terms.every((term) =>
        [study.id, study.title, study.sponsor.name, ...study.conditions]
          .join(' ')
          .toLowerCase()
          .includes(term),
      ),
  );
}
export function trialGroups(studies: Trial[], kind: 'sponsor' | 'topic') {
  const groups = new Map<
    string,
    { id: string; name: string; total: number; posted: number; notPosted: number; unknown: number }
  >();
  for (const study of studies)
    for (const item of kind === 'sponsor'
      ? [{ id: study.sponsor.id, name: study.sponsor.name }]
      : [...new Set(study.conditions)].map((name) => ({ id: name, name }))) {
      const group = groups.get(item.id) ?? {
        ...item,
        total: 0,
        posted: 0,
        notPosted: 0,
        unknown: 0,
      };
      group.total++;
      group[
        study.results === 'posted'
          ? 'posted'
          : study.results === 'not_posted'
            ? 'notPosted'
            : 'unknown'
      ]++;
      groups.set(item.id, group);
    }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}
