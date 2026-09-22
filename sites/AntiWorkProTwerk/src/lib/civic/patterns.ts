import { z } from 'zod';
import { economicPointSchema } from './economy';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const annualSeries = z.object({
  id: z.string().regex(/^[A-Z0-9]+$/),
  sourceUrl: z.string().url(),
  points: z
    .array(economicPointSchema)
    .refine(
      (points) =>
        points.every((p) => p.month.endsWith('-12')) &&
        new Set(points.map((p) => p.month)).size === points.length,
      'December observations must have unique dates',
    ),
});
export const patternsDataSchema = z
  .object({
    formatVersion: z.literal(1),
    pipelineVersion: z.literal('state-patterns-v1'),
    method: z.literal('december-year-over-year-state-pairs'),
    upstream: z.object({
      paycheck: z.object({
        release: z.string().regex(/^pc-[a-f0-9]{24}$/),
        dataHash: digest,
        observedAt: z.string().datetime(),
      }),
      economy: z.object({
        release: z.string().regex(/^ec-[a-f0-9]{24}$/),
        dataHash: digest,
        observedAt: z.string().datetime(),
      }),
    }),
    years: z.array(z.number().int().min(2008).max(2050)).min(1),
    states: z
      .array(
        z.object({
          code: z.string().regex(/^[A-Z]{2}$/),
          name: z.string().min(1),
          fips: z.string().regex(/^\d{2}$/),
          earnings: annualSeries.nullable(),
          jobs: annualSeries.nullable(),
          unemployment: annualSeries.nullable(),
        }),
      )
      .min(1),
  })
  .superRefine((d, ctx) => {
    if (
      new Set(d.states.map((s) => s.code)).size !== d.states.length ||
      new Set(d.states.map((s) => s.fips)).size !== d.states.length ||
      new Set(d.years).size !== d.years.length ||
      d.years.some((y, i) => i > 0 && y <= d.years[i - 1])
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate region or unordered year' });
    for (const [kind, prefix] of [
      ['paycheck', 'pc'],
      ['economy', 'ec'],
    ] as const)
      if (d.upstream[kind].release !== `${prefix}-${d.upstream[kind].dataHash.slice(0, 24)}`)
        ctx.addIssue({ code: 'custom', message: 'Upstream release/hash mismatch' });
    for (const s of d.states) {
      for (const [key, id] of [
        ['earnings', `SMU${s.fips}000000500000003`],
        ['jobs', `SMU${s.fips}000000500000001`],
        ['unemployment', `LASST${s.fips}0000000000003`],
      ] as const)
        if (s[key] && s[key].id !== id)
          ctx.addIssue({ code: 'custom', message: `Wrong ${key} series for ${s.code}` });
    }
  });
export type PatternsData = z.infer<typeof patternsDataSchema>;
export const patternLegend = [
  {color:'#658f89',label:'Both increased'}, {color:'#bd9463',label:'Pay ↑ / other ↓'},
  {color:'#aa839e',label:'Pay ↓ / other ↑'}, {color:'#8088ae',label:'Both decreased'},
  {color:'#81929c',label:'At least one unchanged'},
];
export const patternPairs = {
  'pay-jobs': {
    title: 'Pay + jobs',
    x: 'Private payroll jobs',
    y: 'Average hourly earnings',
    xUnit: '%',
    yUnit: '%',
    xKey: 'jobs' as const,
  },
  'pay-unemployment': {
    title: 'Pay + unemployment',
    x: 'Resident unemployment rate',
    y: 'Average hourly earnings',
    xUnit: 'pp',
    yUnit: '%',
    xKey: 'unemployment' as const,
  },
};
export type PatternPair = keyof typeof patternPairs;
export const patternConfigSchema = z.object({
  year: z.number().int(),
  pair: z.enum(['pay-jobs', 'pay-unemployment']),
});
export function patternSelection(data: PatternsData, params: URLSearchParams) {
  const config = patternConfigSchema.parse({
    year: params.has('year') ? Number(params.get('year')) : data.years.at(-1),
    pair: params.get('pair') ?? 'pay-jobs',
  });
  if (!data.years.includes(config.year))
    throw new Error('Choose a year included in this frozen collection.');
  return config;
}
export function pearson(points: { x: number; y: number }[]) {
  if (points.length < 3) return null;
  if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    throw new Error('Correlation requires finite paired values');
  const n = points.length,
    mx = points.reduce((s, p) => s + p.x, 0) / n,
    my = points.reduce((s, p) => s + p.y, 0) / n;
  let xx = 0,
    yy = 0,
    xy = 0;
  for (const p of points) {
    const x = p.x - mx,
      y = p.y - my;
    xx += x * x;
    yy += y * y;
    xy += x * y;
  }
  if (xx === 0 || yy === 0) return null;
  return Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy)));
}
export function patternColor(x: number, y: number) {
  return x === 0 || y === 0
    ? '#81929c'
    : x > 0
      ? y > 0
        ? '#658f89'
        : '#aa839e'
      : y > 0
        ? '#bd9463'
        : '#8088ae';
}
export function analyzePatterns(data: PatternsData, value: unknown) {
  const config = patternConfigSchema.parse(value);
  if (!data.years.includes(config.year))
    throw new Error('Choose a year included in this frozen collection.');
  const from = `${config.year - 1}-12`,
    through = `${config.year}-12`,
    pair = patternPairs[config.pair];
  const rows = data.states.map((state) => {
    const xSeries = state[pair.xKey],
      ySeries = state.earnings;
    const x0 = xSeries?.points.find((p) => p.month === from) ?? null,
      x1 = xSeries?.points.find((p) => p.month === through) ?? null;
    const y0 = ySeries?.points.find((p) => p.month === from) ?? null,
      y1 = ySeries?.points.find((p) => p.month === through) ?? null;
    const pct = (a: number | null | undefined, b: number | null | undefined) =>
      a != null && b != null && a > 0 ? (b / a - 1) * 100 : null;
    const x =
      pair.xKey === 'unemployment'
        ? x0?.value != null && x1?.value != null
          ? x1.value - x0.value
          : null
        : pct(x0?.value, x1?.value);
    const y = pct(y0?.value, y1?.value);
    return {
      code: state.code,
      name: state.name,
      x,
      y,
      x0,
      x1,
      y0,
      y1,
      xSeriesId: xSeries?.id ?? null,
      ySeriesId: ySeries?.id ?? null,
      reason:
        x === null || y === null
          ? 'Missing endpoint, missing series, or a nonpositive percentage-change baseline. Not plotted; never filled with zero.'
          : null,
    };
  });
  const points = rows.filter(
    (p): p is typeof p & { x: number; y: number } => p.x !== null && p.y !== null,
  );
  return {
    config,
    from,
    through,
    rows,
    points,
    excluded: rows.filter((p) => p.reason),
    r: pearson(points),
  };
}
export type PatternResult = ReturnType<typeof analyzePatterns>;
export function patternMapMetrics(data: PatternsData, params: URLSearchParams) {
  const result = analyzePatterns(data, patternSelection(data, params)),
    pair = patternPairs[result.config.pair];
  return Object.fromEntries(
    result.points.map((p) => [
      p.code,
      {
        value: p.y,
        display: `${p.y.toFixed(1)}%`,
        color: patternColor(p.x, p.y),
        label: `${p.name}: ${pair.x} ${p.x.toFixed(2)}${pair.xUnit}; hourly earnings ${p.y.toFixed(2)}%. ${result.from} to ${result.through}. State aggregate, not an individual outcome.`,
      },
    ]),
  );
}
