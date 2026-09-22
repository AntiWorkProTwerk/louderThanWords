import { patternColor, type PatternResult } from './patterns';

/** A partition of the displayed rows, not a filter or a recalculated correlation. */
export function patternDirections(result: Pick<PatternResult, 'config' | 'rows'>) {
  const other = result.config.pair === 'pay-jobs' ? 'jobs' : 'unemployment';
  const groups = [
    { key: 'up-up', label: `Pay increased / ${other} increased`, color: patternColor(1, 1) },
    { key: 'up-down', label: `Pay increased / ${other} decreased`, color: patternColor(-1, 1) },
    { key: 'down-up', label: `Pay decreased / ${other} increased`, color: patternColor(1, -1) },
    { key: 'down-down', label: `Pay decreased / ${other} decreased`, color: patternColor(-1, -1) },
    { key: 'unchanged', label: 'At least one measure unchanged', color: patternColor(0, 0) },
    { key: 'missing', label: 'No complete pair', color: '#d3dce1' },
  ].map((group) => ({ ...group, rows: [] as PatternResult['rows'], share: 0 }));
  for (const row of result.rows) {
    if ([row.x, row.y].some((value) => value !== null && !Number.isFinite(value)))
      throw new Error('Direction groups require finite changes or explicit missing values');
    const index =
      row.x === null || row.y === null
        ? 5
        : row.x === 0 || row.y === 0
          ? 4
          : row.y > 0
            ? row.x > 0
              ? 0
              : 1
            : row.x > 0
              ? 2
              : 3;
    groups[index].rows.push(row);
  }
  for (const group of groups) {
    group.rows.sort((a, b) => a.name.localeCompare(b.name));
    group.share = result.rows.length ? (group.rows.length / result.rows.length) * 100 : 0;
  }
  return { total: result.rows.length, groups };
}
