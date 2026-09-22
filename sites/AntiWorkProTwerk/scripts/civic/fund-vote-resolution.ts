import {
  fundVoteCoverSchema,
  fundVotePlanSchema,
  fundVoteResolutionSchema,
  type FundVoteCover,
  type FundVotePlan,
  type FundVoteResolution,
} from '../../src/lib/civic/fund-votes';

// An amendment does not identify a predecessor accession. Resolve only an
// unambiguous registrant/period/exact-series-set chain; never name-match reports.
export function resolveFundVotes(
  planValue: FundVotePlan,
  coverValues: FundVoteCover[],
): FundVoteResolution[] {
  const plan = fundVotePlanSchema.parse(planValue),
    covers = coverValues.map((v) => fundVoteCoverSchema.parse(v));
  if (new Set(covers.map((c) => c.accession)).size !== covers.length)
    throw new Error('Duplicate N-PX cover accession');
  return plan.funds.map(({ cik, series }) => {
    const files = covers
      .filter(
        (c) =>
          c.cik === cik &&
          c.period === plan.period &&
          c.duration === 'YEAR' &&
          c.series.some((s) => s.id === series),
      )
      .sort(
        (a, b) =>
          Date.parse(a.accepted) - Date.parse(b.accepted) || a.accession.localeCompare(b.accession),
      );
    const issues: string[] = [],
      cautions: string[] = [];
    let active: FundVoteCover[] = [];
    if (
      new Set(
        files.map((c) =>
          c.series
            .map((s) => s.id)
            .sort()
            .join(','),
        ),
      ).size > 1
    )
      issues.push(
        'Overlapping reports have different series sets; the amendment target is ambiguous.',
      );
    if (files.filter((c) => c.form === 'N-PX').length > 1)
      issues.push(
        'Multiple original reports cover this series and period; no unique amendment baseline.',
      );
    if (new Set(files.map((c) => Date.parse(c.accepted))).size !== files.length)
      issues.push('Reports have the same acceptance time; their order is ambiguous.');
    const numbers = files.filter((c) => c.form === 'N-PX/A').map((c) => c.amendmentNo);
    if (new Set(numbers).size !== numbers.length)
      issues.push('Repeated amendment numbers; no unique amendment sequence.');
    if (
      files.some((c) =>
        c.form === 'N-PX'
          ? c.amendment !== null || c.amendmentNo !== null
          : c.amendment === null || c.amendmentNo === null,
      )
    )
      issues.push('Inconsistent amendment flags or amendment number.');
    if (files.some((c) => !['FUND VOTING REPORT', 'FUND NOTICE REPORT'].includes(c.reportType)))
      issues.push('Unsupported report type for a fund series.');
    let lastNumber = 0,
      historyGap = false;
    for (let i = 0; i < files.length; i++) {
      const c = files[i];
      if (c.form === 'N-PX') {
        if (i > 0) issues.push('An original report was accepted after an amendment.');
        active = [c];
      } else {
        const n = c.amendmentNo ?? 0;
        if (n <= lastNumber) issues.push('Amendment numbers do not increase in acceptance order.');
        const gap = n !== lastNumber + 1;
        if (gap || i === 0) historyGap = true;
        if (c.amendment === 'RESTATEMENT') {
          // A full restatement is self-contained even if an earlier version is
          // absent. Preserve the missing-history caution, not a fabricated merge.
          active = [c];
        } else if (c.amendment === 'NEW PROXY') {
          if (!active.length || gap) {
            active = [];
            cautions.push(`Added records in ${c.accession} lack a complete preceding baseline.`);
          } else if (
            c.reportType !== 'FUND VOTING REPORT' ||
            active.some((p) => p.reportType === 'FUND NOTICE REPORT')
          ) {
            active = [];
            cautions.push(`Added records in ${c.accession} conflict with a notice report.`);
          } else active.push(c);
        }
        lastNumber = n;
      }
    }
    if (historyGap)
      cautions.push(
        'Earlier report history is missing or nonconsecutive; any usable current baseline begins at a full restatement.',
      );
    if (files.length && !active.length)
      issues.push('No complete current voting record can be resolved from these reports.');
    if (issues.length) active = [];
    if (active.some((c) => c.confidential))
      cautions.push(
        'The filing indicates omitted confidential information; these public records are not the complete undisclosed record.',
      );
    const ids = active.map((c) => c.accession);
    return fundVoteResolutionSchema.parse({
      cik,
      series,
      status: !files.length
        ? 'missing'
        : issues.length
          ? 'unresolved'
          : active.every((c) => c.reportType === 'FUND NOTICE REPORT')
            ? 'notice'
            : 'voting-report',
      filings: files.map((c) => c.accession),
      active: ids,
      superseded: issues.length
        ? []
        : files.filter((c) => !ids.includes(c.accession)).map((c) => c.accession),
      issues: [...new Set(issues)],
      cautions: [...new Set(cautions)],
    });
  });
}
