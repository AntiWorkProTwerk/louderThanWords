import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from '../said-did/engine';
import { writeAtomic, withLock } from '../said-did/pipeline';
import { fetchBounded } from './economy';
import { publishSnapshot } from './snapshots';
import { monthsBetween } from '../../src/lib/civic/economy';
import {
  paycheckPlanSchema,
  paycheckDataSchema,
  type PaycheckData,
} from '../../src/lib/civic/paycheck';
const endpoint = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const stateSchema = z.object({
  code: z.string().regex(/^[A-Z]{2}$/),
  name: z.string().min(1),
  fips: z.string().regex(/^\d{2}$/),
});
const requestSchema = z
  .object({
    seriesid: z.array(z.string()).min(1).max(20),
    startyear: z.string().regex(/^\d{4}$/),
    endyear: z.string().regex(/^\d{4}$/),
  })
  .strict();
export const paycheckInputSchema = z.object({
  formatVersion: z.literal(1),
  plan: paycheckPlanSchema,
  states: z.array(stateSchema),
  observedAt: z.string().datetime(),
  batches: z
    .array(
      z.object({
        request: requestSchema,
        raw: z.string(),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
        observedAt: z.string().datetime(),
      }),
    )
    .min(1)
    .max(6),
});
const responseSchema = z.object({
  status: z.literal('REQUEST_SUCCEEDED'),
  message: z.array(z.string()),
  Results: z.object({
    series: z.array(
      z.object({
        seriesID: z.string(),
        data: z.array(
          z.object({
            year: z.string().regex(/^\d{4}$/),
            period: z.string(),
            value: z.string(),
            footnotes: z
              .array(z.object({ code: z.string().optional(), text: z.string().optional() }))
              .default([]),
          }),
        ),
      }),
    ),
  }),
});
export function paycheckCatalog(states: z.infer<typeof stateSchema>[]) {
  const groups = [
    { code: null, name: 'United States', prefix: 'CEU05000000' },
    ...states.map((s) => ({ code: s.code, name: s.name, prefix: `SMU${s.fips}0000005000000` })),
  ];
  return [
    ...groups.flatMap((s) => [
      {
        id: `${s.prefix}03`,
        metric: 'earnings',
        unit: 'dollars_per_hour',
        state: s.code,
        geography: s.name,
      },
      {
        id: `${s.prefix}01`,
        metric: 'employment',
        unit: 'thousands_of_jobs',
        state: s.code,
        geography: s.name,
      },
    ]),
    {
      id: 'CUUR0000SA0',
      metric: 'prices',
      unit: 'index',
      state: null,
      geography: 'U.S. city average',
    },
  ].map((s) => ({
    ...s,
    seasonality: 'Not seasonally adjusted',
    sourceUrl: `https://data.bls.gov/timeseries/${s.id}`,
  })) as Omit<PaycheckData['series'][number], 'points'>[];
}
export function buildPaycheck(
  value: unknown,
  trustedStates: unknown,
  previous: PaycheckData | null = null,
) {
  const input = paycheckInputSchema.parse(value),
    trusted = z.array(stateSchema).parse(trustedStates),
    plan = input.plan;
  if (
    input.states.length !== plan.states.length ||
    new Set(input.states.map((s) => s.code)).size !== input.states.length ||
    new Set(input.states.map((s) => s.fips)).size !== input.states.length
  )
    throw new Error('Incomplete or duplicate state catalog');
  for (const s of input.states)
    if (
      !plan.states.includes(s.code) ||
      !trusted.some((t) => t.code === s.code && t.fips === s.fips && t.name === s.name)
    )
      throw new Error('Unverified state identity');
  if (previous && (hash(plan) !== hash(previous.plan) || input.observedAt < previous.observedAt))
    throw new Error('Paycheck collection changed or capture is stale');
  const catalog = paycheckCatalog(input.states),
    byId = new Map(catalog.map((s) => [s.id, s])),
    allPoints = new Map<string, Map<string, PaycheckData['series'][number]['points'][number]>>(),
    sources: PaycheckData['sources'] = [],
    warnings: string[] = [];
  for (const batch of input.batches) {
    if (hash(batch.raw) !== batch.hash) throw new Error('BLS raw hash mismatch');
    if (batch.observedAt > input.observedAt) throw new Error('Capture timestamp precedes a source');
    if (
      batch.request.startyear !== String(plan.startYear) ||
      batch.request.endyear !== String(plan.endYear)
    )
      throw new Error('BLS request years do not match plan');
    if (new Set(batch.request.seriesid).size !== batch.request.seriesid.length)
      throw new Error('Duplicate requested series');
    const response = responseSchema.parse(JSON.parse(batch.raw));
    if (response.message.length)
      throw new Error(`BLS returned messages: ${response.message.join('; ')}`);
    const returned = new Set<string>();
    for (const raw of response.Results.series) {
      if (
        !batch.request.seriesid.includes(raw.seriesID) ||
        !byId.has(raw.seriesID) ||
        returned.has(raw.seriesID) ||
        allPoints.has(raw.seriesID)
      )
        throw new Error('Unexpected or duplicate returned BLS series');
      returned.add(raw.seriesID);
      const points = new Map<string, PaycheckData['series'][number]['points'][number]>();
      for (const p of raw.data) {
        if (p.period === 'M13') continue;
        if (
          !/^M(0[1-9]|1[0-2])$/.test(p.period) ||
          Number(p.year) < plan.startYear ||
          Number(p.year) > plan.endYear
        )
          throw new Error('Unexpected BLS period');
        const month = `${p.year}-${p.period.slice(1)}`;
        if (points.has(month)) throw new Error('Duplicate BLS month');
        const text = p.value.trim(),
          missing = ['-', '(X)', '(D)', '(S)', 'N/A', ''].includes(text);
        if (!missing && !/^\d+(\.\d+)?$/.test(text))
          throw new Error('Unrecognized BLS numeric value');
        const value = missing ? null : Number(text);
        if (value !== null && !Number.isFinite(value)) throw new Error('Non-finite BLS value');
        points.set(month, {
          month,
          value,
          footnotes: p.footnotes.flatMap((f) =>
            f.text ? [`${f.code ? `${f.code}: ` : ''}${f.text}`] : f.code ? [f.code] : [],
          ),
          sourceHash: batch.hash,
        });
      }
      if (!points.size) throw new Error('No monthly observations in requested series');
      allPoints.set(raw.seriesID, points);
    }
    if (returned.size !== batch.request.seriesid.length)
      throw new Error('Missing requested BLS series');
    sources.push({ hash: batch.hash, observedAt: batch.observedAt, request: batch.request });
  }
  if (allPoints.size !== catalog.length) throw new Error('Incomplete regional series collection');
  const from = `${plan.startYear}-01`,
    through = `${plan.endYear}-12`,
    months = monthsBetween(from, through);
  const series = catalog.map((s) => {
    const points = allPoints.get(s.id)!;
    const missing = months.filter((m) => !points.has(m) || points.get(m)!.value === null).length;
    if (missing) warnings.push(`${s.id}: ${missing} missing monthly values; no interpolation.`);
    return {
      ...s,
      points: months.map(
        (month) =>
          points.get(month) ?? {
            month,
            value: null,
            footnotes: ['Not supplied by BLS in this capture'],
            sourceHash: null,
          },
      ),
    };
  });
  const revisions: PaycheckData['revisions'] = [];
  if (previous)
    for (const before of previous.series) {
      const current = new Map(
        series.find((s) => s.id === before.id)!.points.map((p) => [p.month, p.value]),
      );
      for (const p of before.points) {
        const after = current.get(p.month) ?? null;
        if (p.value !== null && after === null)
          throw new Error(
            'Previously observed BLS value disappeared; investigate before publication',
          );
        if (p.value !== after)
          revisions.push({ seriesId: before.id, month: p.month, before: p.value, after });
      }
    }
  const same =
    previous &&
    previous.observedAt === input.observedAt &&
    hash(previous.sources) === hash(paycheckDataSchema.shape.sources.parse(sources));
  const data = paycheckDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'regional-paycheck-v1',
    plan,
    observedAt: input.observedAt,
    from,
    through,
    states: input.states,
    series,
    sources,
    revisions: same ? previous.revisions : revisions,
    warnings,
  });
  if (previous && previous.observedAt === data.observedAt && hash(previous) !== hash(data))
    throw new Error('Conflicting same-time paycheck capture');
  return data;
}
export async function runPaycheck(options: {
  plan?: unknown;
  input?: unknown;
  states: unknown;
  workspace: string;
  output: string;
  offline?: boolean;
  fetcher?: typeof fetch;
}) {
  return withLock(options.workspace, async () => {
    let input: unknown = options.input;
    if (input === undefined) {
      const plan = paycheckPlanSchema.parse(options.plan);
      if (options.offline) {
        input = JSON.parse(await readFile(join(options.workspace, 'acquisition.json'), 'utf8'));
        if (hash(paycheckInputSchema.parse(input).plan) !== hash(plan))
          throw new Error('Offline paycheck plan mismatch');
      } else {
        const trusted = z.array(stateSchema).parse(options.states),
          states = plan.states.map((code) => {
            const s = trusted.find((s) => s.code === code);
            if (!s) throw new Error(`Unverified state ${code}`);
            return s;
          });
        const ids = paycheckCatalog(states).map((s) => s.id),
          batches: z.infer<typeof paycheckInputSchema>['batches'] = [];
        for (let offset = 0; offset < ids.length; offset += 20) {
          const request = {
            seriesid: ids.slice(offset, offset + 20),
            startyear: String(plan.startYear),
            endyear: String(plan.endYear),
          };
          const raw = await fetchBounded(
            endpoint,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(request),
            },
            options.fetcher ?? fetch,
          );
          const batch = { request, raw, hash: hash(raw), observedAt: new Date().toISOString() };
          batches.push(batch);
          await writeAtomic(join(options.workspace, 'raw', `${batch.hash}.json`), {
            endpoint,
            ...batch,
          });
        }
        input = { formatVersion: 1, plan, states, observedAt: new Date().toISOString(), batches };
        await writeAtomic(join(options.workspace, 'acquisition.json'), input);
      }
    }
    let previous: PaycheckData | null = null,
      expected: string | null = null;
    try {
      const manifest = JSON.parse(await readFile(join(options.output, 'manifest.json'), 'utf8'));
      if (!/^pc-[a-f0-9]{24}$/.test(manifest.release)) throw new Error('Invalid paycheck release');
      expected = manifest.release;
      const raw = JSON.parse(
        await readFile(join(options.output, 'releases', manifest.release, 'data.json'), 'utf8'),
      );
      if (hash(raw) !== manifest.dataHash || expected !== `pc-${hash(raw).slice(0, 24)}`)
        throw new Error('Prior paycheck integrity failure');
      previous = paycheckDataSchema.parse(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || expected) throw e;
    }
    const data = buildPaycheck(input, options.states, previous);
    await writeAtomic(join(options.workspace, 'input.json'), input);
    const manifest = await publishSnapshot(data, options.output, 'pc', expected);
    return {
      ...manifest,
      series: data.series.length,
      states: data.states.length,
      observations: data.series.reduce(
        (n, s) => n + s.points.filter((p) => p.value !== null).length,
        0,
      ),
      warnings: data.warnings.length,
    };
  });
}
