import { z } from 'zod';
import type { TrialData } from './trials';

export const researchPlanSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,80}$/),
  years: z
    .array(z.number().int().min(1985).max(2050))
    .min(2)
    .max(5)
    .refine((v) => new Set(v).size === v.length, 'Fiscal years must be unique'),
  titleTerms: z.string().trim().min(1).max(200),
  institute: z.string().regex(/^[A-Z0-9]{2,15}$/),
  maxProjectsPerYear: z.number().int().min(1).max(15000).default(1000),
  maxPublicationsPerCore: z.number().int().min(1).max(15000).default(2000),
});
export const researchProjectSchema = z.object({
  id: z.string().regex(/^\d+$/),
  core: z.string().min(1),
  number: z.string().min(1),
  year: z.number().int(),
  title: z.string().min(1),
  abstract: z.string().nullable().default(null),
  amount: z.number().nonnegative().nullable(),
  organization: z.object({
    id: z.string(),
    name: z.string(),
    city: z.string(),
    state: z.string().nullable(),
    reportedState: z.string(),
    uei: z.string().nullable(),
    lat: z.number().min(-90).max(90).nullable(),
    lon: z.number().min(-180).max(180).nullable(),
  }),
  topics: z.array(z.string()),
  start: z.string().nullable(),
  end: z.string().nullable(),
  budgetStart: z.string().nullable(),
  budgetEnd: z.string().nullable(),
  source: z.object({ url: z.string().url(), hash: z.string().regex(/^[a-f0-9]{64}$/) }),
});
export const researchDataSchema = z.object({
  formatVersion: z.literal(1),
  pipelineVersion: z.literal('research-funding-v1'),
  plan: researchPlanSchema,
  observedAt: z.string().datetime(),
  coverage: z.array(
    z.object({
      year: z.number().int(),
      total: z.number().int().nonnegative(),
      included: z.number().int().nonnegative(),
      complete: z.literal(true),
    }),
  ),
  projects: z.array(researchProjectSchema),
  publications: z.array(
    z.object({
      core: z.string(),
      pmid: z.string().regex(/^\d+$/),
      latestApplicationId: z.string().regex(/^\d+$/),
    }),
  ),
  exclusions: z.array(z.object({ id: z.string(), reason: z.string() })),
  sources: z.array(
    z.object({
      kind: z.enum(['projects', 'publications']),
      key: z.string(),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      observedAt: z.string().datetime(),
      total: z.number().int().nonnegative(),
    }),
  ),
});
export type ResearchData = z.infer<typeof researchDataSchema>;
export type ResearchProject = z.infer<typeof researchProjectSchema>;

export function researchFilters(data: ResearchData, params: URLSearchParams) {
  const years = data.plan.years.toSorted((a, b) => a - b);
  const year = Number(params.get('year'));
  return {
    year: years.includes(year) ? year : years.at(-1)!,
    state: params.get('state') ?? '',
    q: params.get('q') ?? '',
    topic: params.get('topic') ?? '',
    organization: params.get('organization') ?? '',
  };
}
export function filterResearch(
  data: ResearchData,
  filters: { year?: number; state?: string; q?: string; topic?: string; organization?: string },
) {
  const terms = (filters.q ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  return data.projects.filter(
    (p) =>
      (!filters.year || p.year === filters.year) &&
      (!filters.state || p.organization.state === filters.state) &&
      (!filters.topic || p.topics.includes(filters.topic)) &&
      (!filters.organization || p.organization.id === filters.organization) &&
      terms.every((term) =>
        [p.title, p.core, p.number, p.organization.name, ...p.topics]
          .join(' ')
          .toLowerCase()
          .includes(term),
      ),
  );
}
export function fundingTotal(projects: ResearchProject[]) {
  return {
    amount: projects.reduce((sum, p) => sum + (p.amount ?? 0), 0),
    unknown: projects.filter((p) => p.amount === null).length,
    count: projects.length,
  };
}
export function fundingGroups(
  projects: ResearchProject[],
  kind: 'organization' | 'topic',
  from: number,
  through: number,
) {
  const groups = new Map<string, { id: string; name: string; projects: ResearchProject[] }>();
  for (const project of projects)
    for (const key of kind === 'organization'
      ? [{ id: project.organization.id, name: project.organization.name }]
      : project.topics.map((name) => ({ id: name, name }))) {
      const group = groups.get(key.id) ?? { ...key, projects: [] };
      group.projects.push(project);
      groups.set(key.id, group);
    }
  return [...groups.values()]
    .map((group) => {
      const before = fundingTotal(group.projects.filter((p) => p.year === from)),
        after = fundingTotal(group.projects.filter((p) => p.year === through));
      return {
        ...group,
        before,
        after,
        change: before.unknown || after.unknown ? null : after.amount - before.amount,
      };
    })
    .sort((a, b) => b.after.amount - a.after.amount || a.name.localeCompare(b.name));
}
export function researchTrialLinks(data: ResearchData, trials: TrialData) {
  const byPmid = new Map<string, Set<string>>();
  for (const publication of data.publications) {
    const cores = byPmid.get(publication.pmid) ?? new Set<string>();
    cores.add(publication.core);
    byPmid.set(publication.pmid, cores);
  }
  return trials.studies.flatMap((study) =>
    study.publications.flatMap((reference) =>
      [...(byPmid.get(reference.pmid) ?? [])].map((core) => ({
        core,
        pmid: reference.pmid,
        studyId: study.id,
        studyTitle: study.title,
        referenceType: reference.type,
      })),
    ),
  );
}
