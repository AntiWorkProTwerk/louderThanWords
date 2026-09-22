import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { hash } from '../said-did/engine';
import { writeAtomic, withLock } from '../said-did/pipeline';
import { publishSnapshot } from './snapshots';
import {
  researchPlanSchema,
  researchDataSchema,
  type ResearchData,
} from '../../src/lib/civic/research';

const endpoints = {
  projects: 'https://api.reporter.nih.gov/v2/projects/search',
  publications: 'https://api.reporter.nih.gov/v2/publications/search',
} as const;
const pageSchema = z.object({
  meta: z.object({
    total: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative(),
    search_id: z.string().nullable().optional(),
  }),
  results: z.array(z.unknown()),
});
const batchSchema = z.object({
  kind: z.enum(['projects', 'publications']),
  key: z.string(),
  pages: z
    .array(
      z.object({
        request: z.record(z.string(), z.unknown()),
        raw: z.string(),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
        observedAt: z.string().datetime(),
      }),
    )
    .min(1),
});
export const researchInputSchema = z.object({
  formatVersion: z.literal(1),
  plan: researchPlanSchema,
  observedAt: z.string().datetime(),
  batches: z.array(batchSchema),
});
const projectSchema = z.object({
  appl_id: z.number().int().positive(),
  subproject_id: z.union([z.number(), z.string()]).nullable(),
  fiscal_year: z.number().int(),
  project_num: z.string().min(1),
  core_project_num: z.string().min(1),
  project_title: z.string().min(1),
  abstract_text: z.string().nullable().default(null),
  award_amount: z.number().nonnegative().nullable(),
  agency_code: z.literal('NIH'),
  agency_ic_admin: z.object({ abbreviation: z.string() }),
  organization: z.object({
    org_name: z.string().min(1),
    org_city: z.string().nullable(),
    org_state: z.string().nullable(),
    org_country: z.literal('UNITED STATES'),
    org_ipf_code: z.string().nullable(),
    primary_uei: z.string().nullable(),
  }),
  geo_lat_lon: z
    .object({
      lat: z.number().min(-90).max(90).nullable(),
      lon: z.number().min(-180).max(180).nullable(),
    })
    .nullable(),
  spending_categories_desc: z.string().nullable(),
  project_start_date: z.string().nullable(),
  project_end_date: z.string().nullable(),
  budget_start: z.string().nullable(),
  budget_end: z.string().nullable(),
});
function criteria(
  plan: z.infer<typeof researchPlanSchema>,
  kind: 'projects' | 'publications',
  key: string,
) {
  return kind === 'projects'
    ? {
        fiscal_years: [Number(key)],
        advanced_text_search: {
          operator: 'and',
          search_field: 'projecttitle',
          search_text: plan.titleTerms,
        },
        org_countries: ['UNITED STATES'],
        agencies: [plan.institute],
        is_agency_admin: true,
        use_relevance: false,
      }
    : { core_project_nums: [key] };
}
function rows(batch: z.infer<typeof batchSchema>, plan: z.infer<typeof researchPlanSchema>) {
  let total: number | undefined, searchId: string | null | undefined;
  const records: unknown[] = [];
  for (const [index, page] of batch.pages.entries()) {
    if (hash(page.raw) !== page.hash) throw new Error('NIH raw source hash mismatch');
    const response = pageSchema.parse(JSON.parse(page.raw));
    const expectedCriteria = criteria(plan, batch.kind, batch.key);
    if (index === 0 || !searchId) {
      if (
        !isDeepStrictEqual(page.request.criteria, expectedCriteria) ||
        page.request.search_id !== undefined
      )
        throw new Error('NIH query does not match collection');
    } else if (page.request.search_id !== searchId || page.request.criteria !== undefined)
      throw new Error('NIH pagination search changed');
    if (page.request.offset !== records.length || response.meta.offset !== records.length)
      throw new Error('NIH pagination gap');
    if (
      Object.keys(page.request).some(
        (key) => !['criteria', 'search_id', 'offset', 'limit'].includes(key),
      )
    )
      throw new Error('Unexpected NIH request field');
    const limit = z.number().int().min(1).max(500).parse(page.request.limit);
    if (response.results.length > limit) throw new Error('NIH page exceeds requested size');
    if (total !== undefined && total !== response.meta.total)
      throw new Error('NIH total changed during acquisition');
    if (searchId && response.meta.search_id && searchId !== response.meta.search_id)
      throw new Error('NIH response pagination search changed');
    total = response.meta.total;
    searchId = response.meta.search_id ?? searchId;
    records.push(...response.results);
  }
  if (records.length !== total)
    throw new Error('Incomplete NIH collection: refusing funding comparisons');
  const cap = batch.kind === 'projects' ? plan.maxProjectsPerYear : plan.maxPublicationsPerCore;
  if (records.length > cap) throw new Error('NIH collection exceeds configured bound');
  return records;
}
export function buildResearch(value: unknown, states: { code: string }[]) {
  const input = researchInputSchema.parse(value),
    plan = input.plan,
    projects: ResearchData['projects'] = [],
    exclusions: ResearchData['exclusions'] = [],
    coverage: ResearchData['coverage'] = [],
    sources: ResearchData['sources'] = [];
  const batches = new Map<string, z.infer<typeof batchSchema>>();
  for (const batch of input.batches) {
    const id = `${batch.kind}:${batch.key}`;
    if (batches.has(id)) throw new Error('Duplicate NIH batch');
    batches.set(id, batch);
  }
  const take = (kind: 'projects' | 'publications', key: string) => {
    const id = `${kind}:${key}`,
      batch = batches.get(id);
    if (!batch) throw new Error(`Missing NIH batch ${id}`);
    batches.delete(id);
    const records = rows(batch, plan);
    for (const page of batch.pages) {
      if (page.observedAt > input.observedAt)
        throw new Error('NIH observation chronology mismatch');
      sources.push({
        kind,
        key,
        hash: page.hash,
        observedAt: page.observedAt,
        total: records.length,
      });
    }
    return records;
  };
  const ids = new Set<number>();
  for (const year of plan.years.toSorted((a, b) => a - b)) {
    const records = take('projects', String(year));
    let included = 0;
    for (const raw of records) {
      const p = projectSchema.parse(raw);
      if (p.fiscal_year !== year || p.agency_ic_admin.abbreviation !== plan.institute)
        throw new Error('NIH record outside selected scope');
      if (ids.has(p.appl_id)) throw new Error('Duplicate NIH application');
      ids.add(p.appl_id);
      if (p.subproject_id !== null) {
        exclusions.push({
          id: String(p.appl_id),
          reason:
            'Subproject excluded from funding totals to avoid counting parent and child funding together.',
        });
        continue;
      }
      const org = p.organization,
        state = states.find((s) => s.code === org.org_state)?.code ?? null;
      const orgId = org.org_ipf_code?.trim();
      projects.push({
        id: String(p.appl_id),
        core: p.core_project_num,
        number: p.project_num,
        year,
        title: p.project_title,
        abstract: p.abstract_text,
        amount: p.award_amount,
        organization: {
          id: orgId ? `nih-ipf:${orgId}` : `unresolved-application:${p.appl_id}`,
          name: org.org_name,
          city: org.org_city ?? '',
          state,
          reportedState: org.org_state ?? '',
          uei: org.primary_uei,
          lat: p.geo_lat_lon?.lat ?? null,
          lon: p.geo_lat_lon?.lon ?? null,
        },
        topics: [
          ...new Set(
            (p.spending_categories_desc ?? '')
              .split(';')
              .map((t) => t.trim())
              .filter(Boolean),
          ),
        ].sort(),
        start: p.project_start_date?.slice(0, 10) ?? null,
        end: p.project_end_date?.slice(0, 10) ?? null,
        budgetStart: p.budget_start?.slice(0, 10) ?? null,
        budgetEnd: p.budget_end?.slice(0, 10) ?? null,
        source: { url: `https://reporter.nih.gov/project-details/${p.appl_id}`, hash: hash(raw) },
      });
      included++;
    }
    coverage.push({ year, total: records.length, included, complete: true });
  }
  const publications: ResearchData['publications'] = [],
    pubIds = new Set<string>();
  for (const core of [...new Set(projects.map((p) => p.core))].sort())
    for (const raw of take('publications', core)) {
      const pub = z
        .object({
          coreproject: z.string(),
          pmid: z.number().int().positive(),
          applid: z.number().int().positive(),
        })
        .parse(raw);
      if (pub.coreproject !== core)
        throw new Error('Publication belongs to a different NIH core project');
      const key = `${core}:${pub.pmid}`;
      if (pubIds.has(key)) throw new Error('Duplicate NIH publication edge');
      pubIds.add(key);
      publications.push({ core, pmid: String(pub.pmid), latestApplicationId: String(pub.applid) });
    }
  if (batches.size) throw new Error('Unexpected NIH batches');
  return researchDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'research-funding-v1',
    plan,
    observedAt: input.observedAt,
    coverage,
    projects: projects.sort((a, b) => a.id.localeCompare(b.id)),
    publications: publications.sort(
      (a, b) => a.core.localeCompare(b.core) || a.pmid.localeCompare(b.pmid),
    ),
    exclusions,
    sources,
  });
}

export async function runResearch(options: {
  plan?: unknown;
  input?: unknown;
  states: { code: string }[];
  workspace: string;
  output: string;
  offline?: boolean;
  fetcher?: typeof fetch;
}) {
  return withLock(options.workspace, async () => {
    let input: unknown = options.input;
    if (input === undefined) {
      const plan = researchPlanSchema.parse(options.plan),
        cache = join(options.workspace, `acquisition-${hash(plan).slice(0, 24)}.json`);
      if (options.offline) {
        input = JSON.parse(await readFile(cache, 'utf8'));
        if (hash(researchInputSchema.parse(input).plan) !== hash(plan))
          throw new Error('Cached NIH plan mismatch');
      } else {
        const batches: z.infer<typeof batchSchema>[] = [],
          fetcher = options.fetcher ?? fetch;
        let lastRequest = 0;
        async function collect(kind: 'projects' | 'publications', key: string) {
          const pages: z.infer<typeof batchSchema>['pages'] = [];
          let offset = 0,
            total = 0,
            searchId: string | null | undefined;
          do {
            const request: Record<string, unknown> = {
              ...(searchId ? { search_id: searchId } : { criteria: criteria(plan, kind, key) }),
              offset,
              limit: 500,
            };
            let raw: string | undefined;
            for (let attempt = 0; attempt < 3; attempt++) {
              const wait = Math.max(0, 1100 - (Date.now() - lastRequest));
              if (wait) await new Promise((r) => setTimeout(r, wait));
              lastRequest = Date.now();
              try {
                const response = await fetcher(endpoints[kind], {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(request),
                  signal: AbortSignal.timeout(30000),
                  redirect: 'error',
                });
                if (!response.ok) {
                  const retry = response.headers.get('retry-after');
                  if (retry) {
                    const seconds = Number(retry),
                      delay = Number.isFinite(seconds)
                        ? seconds * 1000
                        : Date.parse(retry) - Date.now();
                    if (Number.isFinite(delay) && delay > 0) lastRequest = Date.now() + delay;
                  }
                  throw new Error(`NIH HTTP ${response.status}`);
                }
                if (Number(response.headers.get('content-length')) > 12_000_000)
                  throw new Error('NIH response too large');
                const reader = response.body?.getReader();
                if (!reader) throw new Error('Empty NIH response');
                let size = 0;
                const chunks: Uint8Array[] = [];
                while (true) {
                  const next = await reader.read();
                  if (next.done) break;
                  size += next.value.length;
                  if (size > 12_000_000) {
                    await reader.cancel();
                    throw new Error('NIH response too large');
                  }
                  chunks.push(next.value);
                }
                raw = Buffer.concat(chunks).toString('utf8');
                break;
              } catch (error) {
                if (attempt === 2) throw error;
                await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
              }
            }
            const parsed = pageSchema.parse(JSON.parse(raw!));
            total = parsed.meta.total;
            if (
              total > (kind === 'projects' ? plan.maxProjectsPerYear : plan.maxPublicationsPerCore)
            )
              throw new Error(
                `NIH ${kind} scope exceeds configured cap; narrow the query or raise the bound. No partial comparison published.`,
              );
            if (parsed.meta.offset !== offset || (offset > 0 && !parsed.results.length))
              throw new Error('NIH pagination stalled');
            pages.push({
              request,
              raw: raw!,
              hash: hash(raw!),
              observedAt: new Date().toISOString(),
            });
            await writeAtomic(join(options.workspace, 'raw', `${hash(raw!)}.json`), {
              endpoint: endpoints[kind],
              ...pages.at(-1),
            });
            searchId = parsed.meta.search_id ?? searchId;
            offset += parsed.results.length;
            if (offset > 14999 && offset < total)
              throw new Error('NIH pagination exceeds API offset bound');
          } while (offset < total);
          const batch = { kind, key, pages };
          rows(batch, plan);
          batches.push(batch);
          return pages.flatMap((p) => pageSchema.parse(JSON.parse(p.raw)).results);
        }
        const cores = new Set<string>();
        for (const year of plan.years.toSorted((a, b) => a - b))
          for (const raw of await collect('projects', String(year))) {
            const p = projectSchema.parse(raw);
            if (p.subproject_id === null) cores.add(p.core_project_num);
          }
        for (const core of [...cores].sort()) await collect('publications', core);
        input = { formatVersion: 1, plan, observedAt: new Date().toISOString(), batches };
        await writeAtomic(cache, input);
      }
    }
    const data = buildResearch(input, options.states);
    let previous: ResearchData | null = null,
      expected: string | null = null;
    try {
      const manifest = JSON.parse(await readFile(join(options.output, 'manifest.json'), 'utf8'));
      if (!/^rf-[a-f0-9]{24}$/.test(manifest.release)) throw new Error('Invalid prior NIH release');
      expected = manifest.release;
      const raw = JSON.parse(
        await readFile(join(options.output, 'releases', manifest.release, 'data.json'), 'utf8'),
      );
      if (hash(raw) !== manifest.dataHash || manifest.release !== `rf-${hash(raw).slice(0, 24)}`)
        throw new Error('Prior NIH release hash mismatch');
      previous = researchDataSchema.parse(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      if (expected) throw e;
    }
    if (
      previous &&
      (hash(previous.plan) !== hash(data.plan) || previous.observedAt > data.observedAt)
    )
      throw new Error(
        'NIH collection changed or observation is stale; use a separate output directory for a different scope',
      );
    await writeAtomic(join(options.workspace, 'input.json'), input);
    const manifest = await publishSnapshot(data, options.output, 'rf', expected);
    return {
      ...manifest,
      projects: data.projects.length,
      publications: data.publications.length,
      coverage: data.coverage,
    };
  });
}
