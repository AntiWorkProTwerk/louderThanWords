import { patternPairs, type PatternResult } from './patterns';

/** A comparison of two rows, never a two-observation correlation. */
export function comparePatternStates(result: PatternResult, selected: string, peer: string | null) {
  if (!peer) return { comparison: null, error: '' };
  const primary = result.rows.find((row) => row.code === selected);
  const secondary = result.rows.find((row) => row.code === peer);
  if (!primary || !secondary)
    return { comparison: null, error: 'Choose two regions included in this frozen collection.' };
  if (selected === peer)
    return {
      comparison: null,
      error: 'Choose a different comparison region, or clear the comparison.',
    };
  const pair = patternPairs[result.config.pair];
  const measures = [
    { key: 'x' as const, label: pair.x, unit: pair.xUnit },
    { key: 'y' as const, label: pair.y, unit: pair.yUnit },
  ].map((measure) => {
    const a = primary[measure.key],
      b = secondary[measure.key];
    return {
      ...measure,
      primary: a,
      secondary: b,
      gap: a !== null && b !== null ? a - b : null,
      gapUnit: 'pp' as const,
    };
  });
  return {
    comparison: {
      primary,
      secondary,
      measures,
      pair: result.config.pair,
      from: result.from,
      through: result.through,
    },
    error: '',
  };
}
export type StateComparison = NonNullable<ReturnType<typeof comparePatternStates>['comparison']>;

/** Zero-inclusive, stable across available years for the chosen states and measure. */
export function comparisonDomain(values: (number | null)[]) {
  if (values.some((v) => v !== null && !Number.isFinite(v)))
    throw new Error('Comparison axes require finite values');
  const present = values.filter((v): v is number => v !== null);
  if (!present.length) return null;
  const low = Math.min(0, ...present),
    high = Math.max(0, ...present);
  const pad = Math.max(0.25, (high - low) * 0.15);
  return { low: low - pad, high: high + pad };
}
