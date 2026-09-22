import { z } from 'zod';
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const economicPointSchema = z.object({
  month: monthSchema,
  value: z.number().finite().nonnegative().nullable(),
  footnotes: z.array(z.string()),
  sourceHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
});
export const economicSeriesSchema = z.object({
  id: z.string().regex(/^[A-Z0-9]+$/),
  label: z.string(),
  metric: z.enum(['earnings', 'prices', 'unemployment']),
  unit: z.enum(['dollars_per_hour', 'index', 'percent']),
  geography: z.string(),
  state: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  seasonality: z.literal('Seasonally adjusted'),
  sourceUrl: z.string().url(),
  points: z.array(economicPointSchema),
});
export const economyDataSchema = z.object({
  formatVersion: z.literal(1),
  pipelineVersion: z.literal('chart-windows-v1'),
  collectionId: z.string(),
  observedAt: z.string().datetime(),
  from: monthSchema,
  through: monthSchema,
  series: z.array(economicSeriesSchema),
  sources: z.array(
    z.object({
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      url: z.literal('https://api.bls.gov/publicAPI/v2/timeseries/data/'),
      observedAt: z.string().datetime(),
      request: z.object({
        seriesid: z.array(z.string()),
        startyear: z.string(),
        endyear: z.string(),
      }),
    }),
  ),
  geographySource: z
    .object({
      url: z.literal('https://download.bls.gov/pub/time.series/la/la.area'),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .nullable(),
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
export type EconomyData = z.infer<typeof economyDataSchema>;
export type EconomicSeries = z.infer<typeof economicSeriesSchema>;
export const chartConfigSchema = z.object({
  seriesId: z.string(),
  from: monthSchema,
  through: monthSchema,
  adjustment: z.enum(['nominal', 'real']).default('nominal'),
  axis: z.enum(['zero', 'fit']).default('zero'),
});
export type ChartConfig = z.infer<typeof chartConfigSchema>;
export function chartSelection(data: EconomyData, params: URLSearchParams) {
  const metric = params.get('metric') ?? 'earnings',
    state = metric === 'unemployment' ? (params.get('state') ?? '') : '';
  const series = data.series.find((s) => s.metric === metric && (s.state ?? '') === state);
  const end = series?.points.filter((p) => p.value !== null).at(-1)?.month ?? data.through;
  return {
    series,
    metric,
    config: {
      seriesId: series?.id ?? 'unknown',
      from: params.get('from') ?? [data.from, shiftMonth(end, -36)].sort().at(-1)!,
      through: params.get('through') ?? end,
      adjustment: params.get('adjustment') ?? 'nominal',
      axis: params.get('axis') ?? 'zero',
    },
  };
}
export function monthIndex(month: string) {
  monthSchema.parse(month);
  const [y, m] = month.split('-').map(Number);
  return y * 12 + m - 1;
}
export function shiftMonth(month: string, offset: number) {
  const i = monthIndex(month) + offset;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}
export function monthsBetween(from: string, through: string) {
  const start = monthIndex(from),
    end = monthIndex(through);
  if (end < start || end - start > 1200) throw new Error('Invalid month range');
  return Array.from({ length: end - start + 1 }, (_, i) => shiftMonth(from, i));
}
export function analyzeChart(data: EconomyData, configValue: unknown) {
  const config = chartConfigSchema.parse(configValue),
    series = data.series.find((s) => s.id === config.seriesId);
  if (!series) throw new Error('Series is not in this snapshot');
  if (config.from < data.from || config.through > data.through || config.from >= config.through)
    throw new Error('Choose two distinct months inside the captured range');
  if (config.adjustment === 'real' && series.metric !== 'earnings')
    throw new Error('Only dollar earnings can be inflation-adjusted');
  const cpi = data.series.find((s) => s.id === 'CUSR0000SA0'),
    deflator = new Map(cpi?.points.map((p) => [p.month, p]) ?? []);
  const base = deflator.get(config.through)?.value;
  if (config.adjustment === 'real' && (!base || !cpi || cpi.seasonality !== series.seasonality))
    throw new Error('Matching CPI at the selected end month is unavailable');
  const points = series.points.map((p) => ({
    month: p.month,
    nominal: p.value,
    cpi: deflator.get(p.month)?.value ?? null,
    value:
      config.adjustment === 'real'
        ? p.value !== null && deflator.get(p.month)?.value
          ? (p.value * base!) / deflator.get(p.month)!.value!
          : null
        : p.value,
    footnotes:
      config.adjustment === 'real'
        ? [...p.footnotes, ...(deflator.get(p.month)?.footnotes ?? []).map((f) => `CPI: ${f}`)]
        : p.footnotes,
  }));
  const selected = points.filter((p) => p.month >= config.from && p.month <= config.through),
    first = selected.find((p) => p.month === config.from),
    last = selected.find((p) => p.month === config.through);
  const delta = first?.value != null && last?.value != null ? last.value - first.value : null;
  const change =
    delta === null
      ? null
      : series.unit === 'percent'
        ? delta
        : first!.value === 0
          ? null
          : (delta / first!.value!) * 100;
  return {
    configuration: config,
    seriesId: series.id,
    label: series.label,
    geography: series.geography,
    seasonality: series.seasonality,
    units:
      config.adjustment === 'real'
        ? `Dollars per hour in ${config.through} prices`
        : series.unit === 'dollars_per_hour'
          ? 'Dollars per hour'
          : series.unit === 'percent'
            ? 'Percent of the labor force'
            : 'CPI-U index (1982–84 = 100)',
    changeUnit: series.unit === 'percent' ? 'percentage points' : 'percent',
    change,
    absoluteChange: delta,
    startValue: first?.value ?? null,
    endValue: last?.value ?? null,
    elapsedMonths: monthIndex(config.through) - monthIndex(config.from),
    missingMonths: selected.filter((p) => p.value === null).map((p) => p.month),
    formula:
      config.adjustment === 'real'
        ? 'real(t) = earnings(t) × CPI(end month) / CPI(t); change = 100 × (real(end) / real(start) − 1)'
        : series.unit === 'percent'
          ? 'percentage-point change = rate(end) − rate(start)'
          : 'percent change = 100 × (value(end) / value(start) − 1)',
    deflatorSeries: config.adjustment === 'real' ? 'CUSR0000SA0' : null,
    baseCpi: config.adjustment === 'real' ? base! : null,
    points: selected,
    context: points,
  };
}
export function alternativeWindows(data: EconomyData, config: ChartConfig) {
  const spans = [12, 36, 60, 120],
    starts = [
      ...spans.map((n) => ({
        label: `${n / 12} year${n === 12 ? '' : 's'}`,
        from: shiftMonth(config.through, -n),
      })),
      { label: 'Full captured history', from: data.from },
    ];
  return starts.map((w) => ({
    label: w.label,
    from: w.from,
    through: config.through,
    result:
      w.from >= data.from && w.from < config.through
        ? analyzeChart(data, { ...config, from: w.from })
        : null,
  }));
}
export function stateUnemployment(data: EconomyData, from: string, through: string) {
  return data.series
    .filter((s) => s.metric === 'unemployment' && s.state)
    .map((s) => {
      const start = s.points.find((p) => p.month === from),
        end = s.points.find((p) => p.month === through);
      return {
        code: s.state!,
        name: s.geography,
        seriesId: s.id,
        start: start?.value ?? null,
        end: end?.value ?? null,
        change: start?.value != null && end?.value != null ? end.value - start.value : null,
        footnotes: end?.footnotes ?? [],
      };
    });
}
export function chartPath(
  points: { month: string; value: number | null }[],
  from: string,
  through: string,
  min: number,
  max: number,
  width = 720,
  height = 250,
) {
  const start = monthIndex(from),
    span = monthIndex(through) - start;
  if (span <= 0 || max <= min) return '';
  let drawing = false;
  return points
    .map((p) => {
      if (p.value === null) {
        drawing = false;
        return '';
      }
      const x = ((monthIndex(p.month) - start) / span) * width,
        y = height - ((p.value - min) / (max - min)) * height;
      const command = drawing ? 'L' : 'M';
      drawing = true;
      return `${command}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}
