import { catalogViews } from './catalog';
import { patternLegend } from './patterns';

export type MapMetric = { value: number; label: string; display?: string; color?: string };
export type MapScope = {
  title: string;
  source: string;
  kind: 'count' | 'metric' | 'context';
  measure: string;
  available: boolean;
  sample: boolean;
  suffix?: string;
  legend: { color: string; label: string }[];
};
export const mapViewDataKeys: Record<string, string> = {
  connections: 'connections',
  patterns: 'patterns',
  'major-stakes': 'majorStakes',
  'shared-investors': 'sharedInvestors',
  holdings: 'holdings',
  insiders: 'insiders',
  water: 'water',
  enforcement: 'echo',
  nursing: 'nursing',
  votes: 'votes',
  trials: 'trials',
  research: 'research',
  complaints: 'complaints',
  wages: 'wages',
  lobbying: 'lobbying',
  revolving: 'revolving',
  graveyard: 'graveyard',
  'said-did': 'evidence',
  paycheck: 'paycheck',
  charts: 'economy',
  rules: 'rules',
};
// Map units belong to the source projection, not to a universal score.
const measures: Record<string, string> = {
  connections: 'Connected companies',
  'major-stakes': 'Issuer companies',
  'shared-investors': 'Selected peer companies',
  holdings: 'Reporting managers',
  insiders: 'Collected SEC filings',
  water: 'Collected water systems',
  enforcement: 'Collected facilities',
  nursing: 'Collected facilities',
  votes: 'Published vote receipts',
  trials: 'Studies with listed sites',
  research: 'NIH applications',
  complaints: 'Collected complaint records',
  wages: 'Concluded wage cases',
  lobbying: 'Collected filings, including amendments',
  revolving: 'Distinct disclosed person IDs',
  graveyard: 'Collected bills',
  'said-did': 'Illustrative receipts',
};
export function mapScopeFor(
  id: string | undefined,
  available: boolean,
  unemployment = false,
): MapScope {
  const view = catalogViews.find((v) => v.id === id);
  const scope: MapScope = {
    title: view?.title ?? 'Representatives',
    source: view?.source ?? 'Illustrative representative profiles',
    kind: id && measures[id] ? 'count' : 'context',
    measure: id ? (measures[id] ?? 'Geographic context') : 'Geographic context',
    available,
    sample: !view || !!view.sample,
    legend: [],
  };
  if (id === 'patterns') {
    scope.kind = 'metric';
    scope.measure = 'Hourly earnings change';
    scope.suffix = '%';
    scope.legend = [...patternLegend];
  } else if (id === 'paycheck') {
    scope.kind = 'metric';
    scope.measure = 'Selected measure change';
    scope.suffix = '%';
    scope.legend = [
      { color: '#a6cbbb', label: 'Increase' },
      { color: '#dfbc8d', label: 'Decrease' },
      { color: '#dedbcf', label: 'Unchanged' },
    ];
  } else if (id === 'charts' && unemployment) {
    scope.kind = 'metric';
    scope.measure = 'Resident unemployment rate';
    scope.suffix = '%';
  }
  if (!scope.legend.length && scope.kind !== 'context')
    scope.legend = [
      { color: '#8dbaf3', label: scope.kind === 'count' ? 'Collected match' : 'Plotted value' },
    ];
  if (scope.kind !== 'context') scope.legend.push({ color: '#e1ebf3', label: 'No plotted match' });
  return scope;
}

export function mapReadout(
  code: string,
  scope: MapScope,
  counts: Record<string, number>,
  metrics: Record<string, MapMetric>,
) {
  if (!scope.available)
    return {
      value: 'Unavailable',
      status: 'Collection not loaded',
      detail:
        'This collection is unavailable or has not finished loading. A map preview cannot fill in missing evidence.',
      color: '#d2dde3',
    };
  if (scope.kind === 'context')
    return {
      value: 'Context only',
      status: 'No state-level measure',
      detail:
        'This map is geographic context. Selecting a state does not establish that the displayed records affected it.',
      color: '#d5e6f3',
    };
  if (scope.kind === 'metric') {
    const metric = metrics[code];
    if (!metric || !Number.isFinite(metric.value))
      return {
        value: 'No value',
        status: 'No plotted observation',
        detail:
          'No usable observation or comparison is plotted for this state in the current view. Missing data is not zero.',
        color: '#e1ebf3',
      };
    return {
      value:
        metric.display?.trim() ||
        `${metric.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${scope.suffix ?? ''}`,
      status: metric.value === 0 ? 'Measured zero' : 'Plotted observation',
      detail: metric.label,
      color: metric.color ?? '#8dbaf3',
    };
  }
  const count = counts[code];
  if (!Object.hasOwn(counts, code) || !Number.isSafeInteger(count) || count < 0)
    return {
      value: 'No match',
      status: 'No matching records here',
      detail:
        'No matching count is supplied for this state in the collected view. This is not evidence that no records exist elsewhere.',
      color: '#e1ebf3',
    };
  return {
    value: count.toLocaleString('en-US'),
    status: count === 0 ? 'Recorded zero in this view' : 'Collected matches',
    detail:
      'This count belongs to the current collection and filters. It is not a population-adjusted rate, quality score or national ranking.',
    color: count === 0 ? '#e1ebf3' : '#8dbaf3',
  };
}
export function mappedStateCodes(
  counts: Record<string, number>,
  metrics: Record<string, MapMetric>,
) {
  return [...new Set([...Object.keys(counts), ...Object.keys(metrics)])].filter(
    (code) =>
      (Number.isSafeInteger(counts[code]) && counts[code] > 0) ||
      Number.isFinite(metrics[code]?.value),
  );
}
