import type { PatternPair } from './patterns';

type HistoryInput = {
  config: { year: number; pair: PatternPair };
  r: number | null;
  points: { code: string }[];
  excluded: unknown[];
};

/** Separate annual cross-region estimates, never pooled observations. */
export function patternHistory(results: HistoryInput[]) {
  const years = new Set<number>();
  const pair = results[0]?.config.pair;
  const rows = results
    .toSorted((a, b) => a.config.year - b.config.year)
    .map((result) => {
      const { year } = result.config;
      const codes = result.points.map((p) => p.code).toSorted();
      if (!Number.isInteger(year) || years.has(year) || result.config.pair !== pair)
        throw new Error('History requires unique years for one comparison');
      if (
        new Set(codes).size !== codes.length ||
        (result.r !== null && (!Number.isFinite(result.r) || Math.abs(result.r) > 1))
      )
        throw new Error('Invalid annual correlation or duplicate region');
      years.add(year);
      return { year, r: result.r, count: codes.length, excluded: result.excluded.length, codes };
    });
  const sameCohort =
    rows.length > 0 &&
    rows.every(
      (row) =>
        row.codes.length === rows[0].codes.length &&
        row.codes.every((code, i) => code === rows[0].codes[i]),
    );
  // Break the visible line at unavailable estimates and absent calendar years.
  const segments: (typeof rows)[] = [];
  let segment: typeof rows = [];
  for (const row of rows) {
    if (row.r === null || (segment.length && row.year !== segment.at(-1)!.year + 1)) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (row.r !== null) segment.push(row);
  }
  if (segment.length) segments.push(segment);
  return { pair, rows, segments, sameCohort };
}
export type PatternHistory = ReturnType<typeof patternHistory>;

export function nextHistoryYear(years: number[], current: number, key: string) {
  if (!years.length) return null;
  if (key === 'Home') return years[0];
  if (key === 'End') return years.at(-1)!;
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
  const index = Math.max(0, years.indexOf(current));
  return years[Math.max(0, Math.min(years.length - 1, index + (key === 'ArrowLeft' ? -1 : 1)))];
}
