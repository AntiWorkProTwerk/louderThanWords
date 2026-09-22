import { z } from 'zod';
import { economicPointSchema, monthSchema, shiftMonth } from './economy';
export const paycheckPlanSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,80}$/),
    startYear: z.number().int().min(2007).max(2050),
    endYear: z.number().int().min(2007).max(2050),
    states: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .min(1)
      .max(51),
  })
  .refine((p) => p.endYear > p.startYear && p.endYear - p.startYear < 10, 'Choose two to ten years')
  .refine((p) => new Set(p.states).size === p.states.length, 'Duplicate state');
export const paycheckSeriesSchema = z.object({
  id: z.string().regex(/^[A-Z0-9]+$/),
  metric: z.enum(['earnings', 'employment', 'prices']),
  unit: z.enum(['dollars_per_hour', 'thousands_of_jobs', 'index']),
  state: z.string().nullable(),
  geography: z.string(),
  seasonality: z.literal('Not seasonally adjusted'),
  sourceUrl: z.string().url(),
  points: z.array(economicPointSchema),
});
export const paycheckDataSchema = z.object({
  formatVersion: z.literal(1),
  pipelineVersion: z.literal('regional-paycheck-v1'),
  plan: paycheckPlanSchema,
  observedAt: z.string().datetime(),
  from: monthSchema,
  through: monthSchema,
  states: z.array(z.object({ code: z.string(), name: z.string(), fips: z.string() })),
  series: z.array(paycheckSeriesSchema),
  sources: z.array(
    z.object({
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      observedAt: z.string().datetime(),
      request: z.object({
        seriesid: z.array(z.string()),
        startyear: z.string(),
        endyear: z.string(),
      }),
    }),
  ),
  revisions: z.array(
    z.object({
      seriesId: z.string(),
      month: monthSchema,
      before: z.number().nullable(),
      after: z.number().nullable(),
    }),
  ),
  warnings: z.array(z.string()),
});
export type PaycheckData = z.infer<typeof paycheckDataSchema>;
export const paycheckConfigSchema = z.object({
  state: z
    .string()
    .regex(/^$|^[A-Z]{2}$/)
    .default(''),
  from: monthSchema,
  through: monthSchema,
});
export function paycheckSelection(data: PaycheckData, params: URLSearchParams) {
  return {
    state: params.get('state') ?? '',
    from:
      params.get('from') ??
      [`${data.plan.startYear}-12`, shiftMonth(data.through, -60)].sort().at(-1)!,
    through: params.get('through') ?? data.through,
  };
}
const percent = (start: number | null, end: number | null) =>
  start !== null && end !== null && start > 0 ? (end / start - 1) * 100 : null;
export function analyzePaycheck(data: PaycheckData, value: unknown) {
  const config = paycheckConfigSchema.parse(value);
  if (config.from < data.from || config.through > data.through || config.from >= config.through)
    throw new Error('Choose two months in increasing order inside this snapshot.');
  if (config.from.slice(5) !== config.through.slice(5))
    throw new Error(
      'Compare the same calendar month in different years: these series are not seasonally adjusted.',
    );
  if (config.state && !data.states.some((s) => s.code === config.state))
    throw new Error('This state is not in the captured collection.');
  const price = data.series.find((s) => s.id === 'CUUR0000SA0');
  if (!price) throw new Error('National CPI reference is absent.');
  const cpi = new Map(price.points.map((p) => [p.month, p.value])),
    base = cpi.get(config.through) ?? null;
  function region(state: string) {
    const earnings = data.series.find((s) => s.metric === 'earnings' && (s.state ?? '') === state),
      jobs = data.series.find((s) => s.metric === 'employment' && (s.state ?? '') === state);
    if (!earnings || !jobs) throw new Error('Earnings/employment series pair is absent.');
    const employment = new Map(jobs.points.map((p) => [p.month, p]));
    const points = earnings.points
      .filter((p) => p.month >= config.from && p.month <= config.through)
      .map((p) => ({
        month: p.month,
        nominal: p.value,
        real:
          p.value !== null && base && cpi.get(p.month)
            ? (p.value * base) / cpi.get(p.month)!
            : null,
        employment: employment.get(p.month)?.value ?? null,
        cpi: cpi.get(p.month) ?? null,
        footnotes: [
          ...p.footnotes,
          ...(employment.get(p.month)?.footnotes ?? []),
          ...(price!.points.find((cp) => cp.month === p.month)?.footnotes ?? []),
        ],
      }));
    const first = points.find((p) => p.month === config.from),
      last = points.find((p) => p.month === config.through);
    return {
      state,
      name: earnings.geography,
      earningsSeriesId: earnings.id,
      employmentSeriesId: jobs.id,
      points,
      nominal: percent(first?.nominal ?? null, last?.nominal ?? null),
      real: percent(first?.real ?? null, last?.real ?? null),
      employment: percent(first?.employment ?? null, last?.employment ?? null),
      startNominal: first?.nominal ?? null,
      endNominal: last?.nominal ?? null,
      startReal: first?.real ?? null,
      endReal: last?.real ?? null,
      startJobs: first?.employment ?? null,
      endJobs: last?.employment ?? null,
    };
  }
  const national = region(''),
    selected = config.state ? region(config.state) : national;
  return {
    configuration: config,
    selected,
    national,
    inflation: percent(cpi.get(config.from) ?? null, base),
    gap: selected.real !== null && national.real !== null ? selected.real - national.real : null,
    deflator: 'CUUR0000SA0',
    dollarBase: config.through,
  };
}
export function paycheckRegions(data: PaycheckData, config: unknown) {
  const parsed = paycheckConfigSchema.parse(config);
  return data.states.map((state) => ({
    code: state.code,
    ...analyzePaycheck(data, { ...parsed, state: state.code }).selected,
  }));
}
export function indexedPaycheck(
  points: {
    month: string;
    nominal: number | null;
    real: number | null;
    employment: number | null;
  }[],
  metric: 'nominal' | 'real' | 'employment',
) {
  const base = points[0]?.[metric];
  return points.map((p) => ({
    month: p.month,
    value: base && p[metric] !== null ? (p[metric]! / base) * 100 : null,
  }));
}
