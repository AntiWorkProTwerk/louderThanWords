import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from '../said-did/engine';
import { writeAtomic, withLock } from '../said-did/pipeline';
import { publishSnapshot } from './snapshots';
import {
  economyDataSchema,
  monthsBetween,
  type EconomyData,
  type EconomicSeries,
} from '../../src/lib/civic/economy';

const endpoint = 'https://api.bls.gov/publicAPI/v2/timeseries/data/' as const,
  areaUrl = 'https://download.bls.gov/pub/time.series/la/la.area' as const;
export const economyPlanSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,80}$/),
    startYear: z.number().int().min(1948).max(2050),
    endYear: z.number().int().min(1948).max(2050),
    includeStates: z.boolean().default(true),
  })
  .refine(
    (p) => p.endYear >= p.startYear && p.endYear - p.startYear < 20,
    'Choose up to twenty years; acquisition batches at most ten years per request',
  );
const stateSchema = z.object({
  code: z.string().regex(/^[A-Z]{2}$/),
  name: z.string(),
  fips: z.string().regex(/^\d{2}$/),
});
const requestSchema = z
  .object({
    seriesid: z.array(z.string()).min(1).max(20),
    startyear: z.string().regex(/^\d{4}$/),
    endyear: z.string().regex(/^\d{4}$/),
  })
  .strict();
const rawPointSchema = z.object({
  year: z.string().regex(/^\d{4}$/),
  period: z.string(),
  value: z.string(),
  footnotes: z
    .array(z.object({ code: z.string().optional(), text: z.string().optional() }))
    .default([]),
});
const responseSchema = z.object({
  status: z.literal('REQUEST_SUCCEEDED'),
  message: z.array(z.string()),
  Results: z.object({
    series: z.array(z.object({ seriesID: z.string(), data: z.array(rawPointSchema) })),
  }),
});
export const economyInputSchema = z.object({
  formatVersion: z.literal(1),
  plan: economyPlanSchema,
  observedAt: z.string().datetime(),
  states: z.array(stateSchema),
  area: z
    .object({ url: z.literal(areaUrl), raw: z.string(), hash: z.string().regex(/^[a-f0-9]{64}$/) })
    .nullable(),
  batches: z
    .array(
      z.object({
        url: z.literal(endpoint),
        request: requestSchema,
        response: z.unknown(),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
        observedAt: z.string().datetime(),
      }),
    )
    .max(10),
});
export function economicCatalog(states: z.infer<typeof stateSchema>[]) {
  const definitions = [
    {
      id: 'CES0500000003',
      label: 'Average hourly earnings · private payrolls',
      metric: 'earnings',
      unit: 'dollars_per_hour',
      geography: 'United States',
      state: null,
    },
    {
      id: 'CUSR0000SA0',
      label: 'Consumer prices · all items',
      metric: 'prices',
      unit: 'index',
      geography: 'U.S. city average',
      state: null,
    },
    {
      id: 'LNS14000000',
      label: 'Unemployment rate',
      metric: 'unemployment',
      unit: 'percent',
      geography: 'United States',
      state: null,
    },
    ...states.map((s) => ({
      id: `LASST${s.fips}0000000000003`,
      label: `Unemployment rate · ${s.name}`,
      metric: 'unemployment',
      unit: 'percent',
      geography: s.name,
      state: s.code,
    })),
  ];
  return definitions.map((s) => ({
    ...s,
    seasonality: 'Seasonally adjusted',
    sourceUrl: `https://data.bls.gov/timeseries/${s.id}`,
  })) as Omit<EconomicSeries, 'points'>[];
}
function validateStates(input: z.infer<typeof economyInputSchema>, trustedStates: unknown) {
  if (!input.plan.includeStates) {
    if (input.states.length) throw new Error('Unexpected regional catalog');
    return;
  }
  if (!input.area || hash(input.area.raw) !== input.area.hash)
    throw new Error('Missing or corrupt BLS geography source');
  const trusted = z.array(stateSchema).parse(trustedStates);
  const rows = input.area.raw
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split('\t').map((s) => s.trim()));
  const codes = new Set<string>(),
    fips = new Set<string>();
  for (const state of input.states) {
    if (
      !trusted.some((s) => s.code === state.code && s.fips === state.fips && s.name === state.name)
    )
      throw new Error('State label does not match the trusted geographic crosswalk');
    if (codes.has(state.code) || fips.has(state.fips))
      throw new Error('Duplicate geographic identity');
    codes.add(state.code);
    fips.add(state.fips);
    if (
      !rows.some(
        (r) => r[0] === 'A' && r[1] === `ST${state.fips}00000000000` && r[2] === state.name,
      )
    )
      throw new Error(`Unverified BLS area identity: ${state.code}`);
  }
  if (!input.states.length) throw new Error('Regional collection has no states');
}
export function buildEconomy(
  inputValue: unknown,
  previous: EconomyData | null = null,
  trustedStates: unknown = [],
) {
  const input = economyInputSchema.parse(inputValue),
    plan = input.plan;
  validateStates(input, trustedStates);
  if (
    previous &&
    (previous.collectionId !== plan.id ||
      `${plan.startYear}-01` !== previous.from ||
      `${plan.endYear}-12` < previous.through)
  )
    throw new Error('Collection identity changed or captured history was shortened');
  if (previous && input.observedAt < previous.observedAt)
    throw new Error('Stale economic observation');
  const catalog = economicCatalog(input.states),
    byId = new Map(catalog.map((s) => [s.id, s]));
  const points = new Map<string, Map<string, EconomicSeries['points'][number]>>(
    catalog.map((s) => [s.id, new Map()]),
  );
  const covered = new Set<string>(),
    warnings: string[] = [],
    sources: EconomyData['sources'] = [];
  for (const batch of input.batches) {
    if (hash(batch.response) !== batch.hash) throw new Error('BLS response checksum mismatch');
    if (
      batch.observedAt > input.observedAt ||
      (previous &&
        batch.observedAt < previous.observedAt &&
        !previous.sources.some(
          (s) =>
            s.hash === batch.hash &&
            s.observedAt === batch.observedAt &&
            hash(s.request) === hash(batch.request),
        ))
    )
      throw new Error('Stale or future BLS batch');
    const start = Number(batch.request.startyear),
      end = Number(batch.request.endyear);
    if (start < plan.startYear || end > plan.endYear || end < start || end - start >= 10)
      throw new Error('Invalid BLS request window');
    const response = responseSchema.parse(batch.response);
    // BLS can return success with warnings after truncating a request. Never publish those as complete.
    if (response.message.length)
      throw new Error(
        `BLS reported an incomplete/qualified response: ${response.message.join('; ')}`,
      );
    const requested = new Set(batch.request.seriesid),
      returned = new Set<string>();
    if (requested.size !== batch.request.seriesid.length)
      throw new Error('Duplicate requested series');
    for (const series of response.Results.series) {
      if (
        !byId.has(series.seriesID) ||
        !requested.has(series.seriesID) ||
        returned.has(series.seriesID)
      )
        throw new Error('Unexpected or duplicate BLS series');
      returned.add(series.seriesID);
      for (let year = start; year <= end; year++) {
        const key = `${series.seriesID}:${year}`;
        if (covered.has(key)) throw new Error('Overlapping BLS request coverage');
        covered.add(key);
      }
      for (const point of series.data) {
        if (Number(point.year) < start || Number(point.year) > end)
          throw new Error('BLS observation outside requested years');
        if (point.period === 'M13') {
          warnings.push(`Annual-average period excluded for ${series.seriesID}, ${point.year}`);
          continue;
        }
        if (!/^M(0[1-9]|1[0-2])$/.test(point.period))
          throw new Error('Unsupported non-monthly observation');
        const month = `${point.year}-${point.period.slice(1)}`,
          map = points.get(series.seriesID)!;
        if (month > input.observedAt.slice(0, 7))
          throw new Error('BLS returned a future observation');
        if (map.has(month)) throw new Error('Duplicate monthly observation');
        const missing = ['-', '--', '(NA)', 'N/A'].includes(point.value.trim());
        if (!missing && !/^\d+(?:\.\d+)?$/.test(point.value))
          throw new Error('Invalid numeric BLS value');
        const value = missing ? null : Number(point.value),
          definition = byId.get(series.seriesID)!;
        if (value !== null && (definition.unit === 'percent' ? value > 100 : value <= 0))
          throw new Error('BLS value outside supported measure range');
        map.set(month, {
          month,
          value,
          footnotes: point.footnotes
            .map((f) => [f.code, f.text].filter(Boolean).join(': '))
            .filter(Boolean),
          sourceHash: batch.hash,
        });
      }
    }
    if (returned.size !== requested.size) throw new Error('Requested BLS series missing');
    sources.push({
      hash: batch.hash,
      url: endpoint,
      request: batch.request,
      observedAt: batch.observedAt,
    });
  }
  for (const series of catalog)
    for (let year = plan.startYear; year <= plan.endYear; year++)
      if (!covered.has(`${series.id}:${year}`))
        throw new Error('Incomplete series/year acquisition');
  const from = `${plan.startYear}-01`,
    through = [`${plan.endYear}-12`, input.observedAt.slice(0, 7)].sort()[0];
  if (from >= through) throw new Error('Not enough elapsed months');
  const grid = monthsBetween(from, through),
    series = catalog.map((s) => ({
      ...s,
      points: grid.map(
        (month) =>
          points.get(s.id)!.get(month) ?? {
            month,
            value: null,
            footnotes: ['No observation returned by BLS for this month.'],
            sourceHash: null,
          },
      ),
    }));
  if (series.some((s) => s.points.filter((p) => p.value !== null).length < 2))
    throw new Error('BLS series has fewer than two numeric observations');
  const revisions: EconomyData['revisions'] = [];
  for (const old of previous?.series ?? []) {
    const next = series.find((s) => s.id === old.id);
    if (!next) throw new Error('A previously tracked series is missing');
    for (const point of old.points) {
      const current = next.points.find((p) => p.month === point.month);
      if (point.value !== null && (!current || current.sourceHash === null))
        throw new Error('Previously reported month disappeared from BLS response');
      if (current && point.value !== current.value)
        revisions.push({
          seriesId: old.id,
          month: point.month,
          before: point.value,
          after: current.value,
        });
    }
  }
  // Preserve the revision receipt on an exact replay of the same acquisition.
  const same =
    previous &&
    previous.observedAt === input.observedAt &&
    hash(previous.sources) === hash(economyDataSchema.shape.sources.parse(sources));
  const data = economyDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'chart-windows-v1',
    collectionId: plan.id,
    observedAt: input.observedAt,
    from,
    through,
    series,
    sources,
    geographySource: input.area ? { url: areaUrl, hash: input.area.hash } : null,
    revisions: same ? previous.revisions : revisions,
    warnings: [...new Set(warnings)],
  });
  if (previous && previous.observedAt === input.observedAt && hash(data) !== hash(previous))
    throw new Error('Conflicting same-time economic snapshot');
  return data;
}
export async function fetchBounded(url: string, options: RequestInit, fetcher: typeof fetch) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetcher(url, {
        ...options,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      throw new Error(`BLS HTTP ${response.status}`);
    }
    if (!response.body) throw new Error('Empty BLS response');
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8_000_000) {
        await reader.cancel();
        throw new Error('BLS response exceeds 8 MB');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  throw new Error('BLS request exhausted');
}
export async function collectEconomy(
  planValue: unknown,
  statesValue: unknown,
  workspace: string,
  fetcher: typeof fetch = fetch,
) {
  const plan = economyPlanSchema.parse(planValue),
    states = plan.includeStates ? z.array(stateSchema).parse(statesValue) : [];
  const area = plan.includeStates ? await fetchBounded(areaUrl, {}, fetcher) : null;
  const ids = economicCatalog(states).map((s) => s.id),
    batches: z.infer<typeof economyInputSchema>['batches'] = [];
  for (let start = plan.startYear; start <= plan.endYear; start += 10)
    for (let offset = 0; offset < ids.length; offset += 20) {
      const request = {
        seriesid: ids.slice(offset, offset + 20),
        startyear: String(start),
        endyear: String(Math.min(start + 9, plan.endYear)),
      };
      const raw = await fetchBounded(
          endpoint,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
          },
          fetcher,
        ),
        response = JSON.parse(raw),
        observedAt = new Date().toISOString();
      await writeAtomic(join(workspace, 'raw', `${hash(raw)}.json`), {
        url: endpoint,
        request,
        raw,
        observedAt,
      });
      batches.push({ url: endpoint, request, response, observedAt, hash: hash(response) });
    }
  const input = economyInputSchema.parse({
    formatVersion: 1,
    plan,
    states,
    area: area ? { url: areaUrl, raw: area, hash: hash(area) } : null,
    batches,
    observedAt: new Date().toISOString(),
  });
  await writeAtomic(join(workspace, 'acquisition.json'), input);
  return input;
}
export async function readEconomyPublication(output: string) {
  let manifest: any;
  try {
    manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  if (!/^ec-[a-f0-9]{24}$/.test(manifest.release)) throw new Error('Invalid economic release');
  const raw = JSON.parse(
    await readFile(join(output, 'releases', manifest.release, 'data.json'), 'utf8'),
  );
  if (hash(raw) !== manifest.dataHash || manifest.release !== `ec-${hash(raw).slice(0, 24)}`)
    throw new Error('Economic release integrity check failed');
  return { manifest, data: economyDataSchema.parse(raw) };
}
export async function runEconomy(options: {
  input?: unknown;
  plan?: unknown;
  states?: unknown;
  workspace: string;
  output: string;
  offline?: boolean;
  fetcher?: typeof fetch;
}) {
  return withLock(options.workspace, async () => {
    const previous = await readEconomyPublication(options.output);
    const input =
      options.input ??
      (options.offline
        ? JSON.parse(await readFile(join(options.workspace, 'acquisition.json'), 'utf8'))
        : await collectEconomy(options.plan, options.states, options.workspace, options.fetcher));
    if (
      options.offline &&
      options.plan &&
      hash(economyPlanSchema.parse(options.plan)) !== hash(economyInputSchema.parse(input).plan)
    )
      throw new Error('Offline archive belongs to another plan');
    const data = buildEconomy(input, previous?.data ?? null, options.states),
      manifest = await publishSnapshot(
        data,
        options.output,
        'ec',
        previous?.manifest.release ?? null,
      );
    return {
      manifest,
      counts: {
        series: data.series.length,
        observations: data.series.reduce(
          (n, s) => n + s.points.filter((p) => p.value !== null).length,
          0,
        ),
        missing: data.series.reduce(
          (n, s) => n + s.points.filter((p) => p.value === null).length,
          0,
        ),
        revisions: data.revisions.length,
      },
    };
  });
}
