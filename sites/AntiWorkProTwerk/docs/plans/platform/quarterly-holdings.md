# #21 — Quarterly Holdings

Live local route: `/records/holdings/`. This implements the plan's quarter-to-quarter
holdings explorer, not a live trade feed. #22's competitor classification and shared
investor network remain a separate product.

## Sources and interpretation

Official [SEC Form 13F archives](https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets),
[table dictionary](https://www.sec.gov/files/form_13f_readme.pdf) and
[Form 13F instructions](https://www.sec.gov/pdf/form13f.pdf) were inspected before implementation.
The publication windows ending May/August are not holding dates. Each filing keeps
its quarter-end date, filing date, source archive and source-capture timestamp.

The configurable initial collection selects exact manager CIKs for Berkshire
Hathaway, JPMorgan Chase and Pershing Square Capital Management across the
March–May and June–August 2026 archives. It contains seven filings, six manager/period
snapshots and 67,695 original information-table rows. There is no first-N holdings
sample: the complete selected tables are retained after scanning the national files.
This is not all managers, all holdings, all asset classes or all filing history.

Five snapshots contain resolved reported holdings. Pershing Square's June report
is a notice saying its holdings are now reported by its public parent. The page
shows that reporting relationship and refuses to call the missing table a selloff.
The [original notice](https://www.sec.gov/Archives/edgar/data/1336528/000117266126003777/0001172661-26-003777-index.html)
was independently checked against the archive identifier/date.

JPMorgan's original March report in the bulk archive has 378 rows and does not
reconcile to its declared totals. Its complete
[restatement](https://www.sec.gov/Archives/edgar/data/19617/000001961726000225/0000019617-26-000225-index.html)
has 33,063 rows, reconciles, and replaces the original in the active snapshot.
Both filings remain inspectable. We do not silently repair the earlier source or
add its rows to the restatement.

## Reusable local pipeline

Run from `sites/AntiWorkProTwerk`:

```powershell
npm run civic -- holdings --plan docs/plans/platform/holdings-managers.json
npm run civic -- holdings --plan docs/plans/platform/holdings-managers.json --offline
npm run civic -- holdings --input .local/holdings/input.json --workspace .local/holdings-replay --output .local/holdings-replay/public
```

`acquireHoldings`, `buildHoldings`, `assembleHoldingSnapshot` and `runHoldings`
are ordinary reusable async/pure stages for a future remote job. No database,
API key, AI model, task platform or extra service is required.

- SEC transport is shared with Insider Records: fixed official source validators,
  declared user agent, under two request starts/second, timeout, streamed caps,
  content hashes, atomic receipts and verified offline original bytes.
- Six tab-separated tables are scanned completely with CRC/size/header checks.
  Capture records retain national row counts, selected counts, exact fields,
  source-row ordinals and row hashes. Unknown/ambiguous identities fail publication.
- Cover-page street/postal fields and the signature/contact table are excluded
  from projected/public data. Full official archives stay under ignored `.local`.
- Source gaps, duplicates, stale captures, scope shrinkage and lost previously
  collected filings are rejected. New managers/windows can be added explicitly.
  Caps abort instead of quietly truncating the collection.
- Restatements replace the table; new-holdings amendments supplement it. Ambiguous
  numbering/types, missing active-chain amendments, inconsistent dates, bad units,
  unresolved included-manager references or unreconciled totals prevent a combined
  comparison. A complete restatement can stand alone with a history-coverage caution.
- Notices and combination reports remain distinct. Confidential omissions/releases
  are visible; an amendment disclosing old holdings is not a new trade.

To broaden collection, edit a copy of the plan and add exact CIKs and official
archive URLs. Preserve earlier manager IDs/windows for a refresh. Use isolated
workspace/output directories for a different scope. The process never discovers
and merges similarly named managers or follows a parent relationship automatically.

## Output contract

`public/data/holdings/manifest.json` points to a content-addressed `hf-…` release:

- `data.json`: source receipts, scope, compact filing/snapshot index and observed
  added/updated filing history; no giant position tables in initial HTML.
- `positions/<CIK>-<report-date>.json`: exact grouped quantities/values, issuer/class
  labels and filing-local references to every component source row, in a versioned
  dictionary/tuple wire format. `decodeHoldingPositions` restores the named object
  model; old object-format releases remain readable. The largest quarter files
  shrink from 2.94/3.03 MB to 0.87/0.90 MB (about 70%) without losing any rows.
- `filings/<accession>.json`: projected cover/summary, separate reporting-for and
  included-manager relationships, reconciliation issues and row-page hashes.
- `rows/<accession>-<page>.json`: at most 500 original information-table rows each.

Every artifact has a SHA-256 manifest hash and is written before the manifest is
atomically replaced. Browser reads check hashes, schemas, identities and references,
with bounded caching, cancellation, stale-selection protection and explicit retries.
Portable comparison downloads identify their frozen release and two snapshots.

The version-2 positions file has `formatVersion`, `id`, `filings`, `names`, `classes`
and `rows`. Each row is `[cusip, unit, option, nameIndexes, classIndexes, quantity,
valueDollars, references]`; each reference is `[filingIndex, informationTableIndex]`.
Indexes are zero-based. An information-table index selects page `floor(index / 500)`
and offset `index % 500` in that filing's row pages. The row itself retains its
original national TSV ordinal (one-based excluding header). Quantity/value strings
are exact decimals, not JSON numbers. `unit` is `SH` or `PRN`; `option` is empty,
`Put` or `Call`. Consumers must not collapse those units/options into one position.

Current release: `hf-81419654165699005c66c200`. Offline full ZIP replay and a separate
portable-input publication reproduce that release exactly.
All 154 artifacts and 67,695 row hashes were independently audited. Every decoded
position equals the earlier uncompressed release, including exact quantities and
every source-row reference. A wire-format upgrade cannot alter source receipts or
filing facts at the same capture timestamp.

## Comparison and connected UI

Exact CUSIP + quantity unit + put/call is the comparison key. No fuzzy company-name
join or conversion of options/principal amounts into common shares. Multiple
discretion rows in the same active report aggregate, with all contributing rows
available. Distinct managers are never summed as unique market ownership.
Arbitrary-precision decimal arithmetic retains quantities above JavaScript's safe
integer range. Dollars use the filing-date January 3, 2023 unit change, not the
quarter date. Concentration direction uses exact cross multiplication; displayed
percentages are rounded separately.

The interface includes manager/quarter selection, new/missing/increased/decreased/
unchanged filters, issuer/CUSIP search, growing reported-value concentration,
top-ten concentration cards, exact before/after quantities, source-row expansion,
original filing history and downloads. A position absent from one table is
**not** reported as a known zero holding. Corporate actions are not adjusted away;
value-share changes are not inferred trades or returns. Small/omitted/confidential
positions and incomplete asset coverage remain explicit limitations.

The persistent map uses latest collected manager cover-page **state-label anchors**,
not fabricated investment or transaction coordinates. State filtering connects
two-way to Paychecks with noncausal geographic context. JPMorgan has a two-way exact
CIK link to Insider Records, explicitly distinguishing investment-manager versus
issuer roles. No name-only ownership or operating-control inference is made.

Responsive layout, reduced-motion support, animated concentration bars/transitions,
keyboard controls, focus on opened evidence and 25-position incremental rendering
keep both small and large portfolios usable. Large comparisons compute in cancellable
100-position batches that yield to the browser; exact sort fallback preserves ordering
when adjacent large values round to the same floating-point approximation.
Source-row downloads also expose
historical/unresolved filings without falsely approving them.

## Verification

Nine dedicated code tests and all 136 current code tests pass. They cover exact
decimals/value units, unit/option separation, amendment replacement/addition,
confidential omissions, notices, mismatched totals, row integrity/privacy projection,
atomic publication, scope/capture retention, CRC-checked offline replay, lazy evidence,
retry and cancellation. Type checking reports zero errors/warnings.
Additional tests prove dictionary round-trip/legacy compatibility, invalid-reference
rejection, cooperative/synchronous calculation equivalence and cancellation mid-job.

Three dedicated browser tests pass: desktop comparison/raw evidence/state connections,
phone failed-request retry/notice relationships/empty state, and the largest manager's
restatement/CIK navigation with a delayed stale response. Desktop and phone screenshots
were visually inspected. Production build, full browser regression and production
performance verification were repeated after the wire-format and cooperative-work
changes. Both independent sites build successfully. The final full browser regression
passes all 51 tests (3.4 minutes), including all three holdings tests against the final
compact/batched implementation. Branch tips/open PRs were rechecked unchanged; coworker
site directories are untouched. Both the development route and production-preview
route return HTTP 200, and the development server remains running.

Final uncontended production lab report: `.local/holdings/performance/latest.json`,
captured `2026-09-17T00:34:51.899Z`. Three desktop runs had maximum interaction
durations of 88/104/136 ms; three 4× CPU / 1.6 Mbps / 80 ms latency phone runs had
112/104/112 ms. Maximum measured main-thread long tasks were 115/57/70 ms desktop
and 158/169/154 ms phone. The pre-batching large-portfolio pause (794–939 ms phone)
is not present in these final samples. Encoded initial HTML is 20,145 bytes.

Phone initial readiness is 1.76–2.17 seconds. Loading, verifying and comparing both
JPMorgan quarters takes 5.67–5.73 seconds on that throttled connection (about four
seconds downloading); the UI exposes loading and remains cancellable. Unthrottled
desktop large-manager readiness is 0.91–1.00 seconds. These are six local lab samples,
not field-INP guarantees or claims that all data is instantly available. Zero browser
errors were observed in all six samples. The supplied performance command exercises
both the small default manager and the largest manager, not just the easy case:

```powershell
npx tsx scripts/civic/lobbying-performance.ts --holdings
```
