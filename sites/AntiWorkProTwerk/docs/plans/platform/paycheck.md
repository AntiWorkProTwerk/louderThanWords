# The Economy vs. Your Paycheck — product 34

Open `http://127.0.0.1:5173/records/paycheck/`. The existing dev server remains the
live preview; production uses the registered site's normal base path.

## Browser walkthrough

1. Choose a state or the United States and two dates. Compare the **same calendar
   month** in different years. This is required because these series are not
   seasonally adjusted.
2. Read three separate changes: average nominal hourly earnings, those earnings
   adjusted with a common national CPI reference, and private payroll jobs.
3. Switch the chart between inflation-adjusted pay, nominal pay and jobs. Both the
   selected geography and the independently reported national series start at 100.
   This shows change, not wage levels. The axis is explicitly fitted; missing
   values remain gaps rather than being joined or interpolated.
4. Select a state on the map or in the accessible state list. Green means a positive
   change, amber a negative change, and gray zero/no metric as explained by the
   labels. The selected state's fill preserves the same sign encoding. The `Δ`
   label is a percent change, not a wage level or unemployment rate. Points are
   state-label anchors, not geocoded workers or workplaces.
5. Expand source evidence for actual hourly amounts, employment in thousands,
   monthly observations, footnotes, and direct BLS series links. Download the source
   snapshot or the complete calculation and copy a frozen comparison link.
6. Follow the link to unemployment in Chart Check for the same state and date
   window. That is a separate, seasonally adjusted, residence-based series—not an
   identity with private payroll jobs. NIH funding links use the same state only
   as geographic context, with an explicit warning against causal inference.

The existing map canvas persists across product navigation. Mobile uses the shared
expandable evidence sheet. Native SVG charts and state cards respect reduced motion;
there is no added map instance, perpetual animation loop, backend or model inference.
The monthly evidence table renders 24 rows at a time with a next-page action. All
state metrics remain available without using the map.

## Source and exact scope

This implements the plan's **selected regions** capability, using all 50 states
and D.C. It does not claim occupation-specific wages. All measures concern private
nonfarm payrolls, except the all-items national CPI reference:

| Measure                          | BLS series                       | Unit / geography                                |
| -------------------------------- | -------------------------------- | ----------------------------------------------- |
| National average hourly earnings | `CEU0500000003`                  | Dollars per hour, U.S. total private            |
| National payroll employment      | `CEU0500000001`                  | Thousands of jobs, U.S. total private           |
| State average hourly earnings    | `SMU<state FIPS>000000500000003` | Dollars per hour, statewide total private       |
| State payroll employment         | `SMU<state FIPS>000000500000001` | Thousands of jobs, statewide total private      |
| Consumer prices                  | `CUUR0000SA0`                    | All-items CPI-U, U.S. city average, 1982–84=100 |

All are **not seasonally adjusted**. The geographic crosswalk is checked against
the independent site manifest's state codes, names and FIPS codes. The catalog is
fixed to statewide total-private measures; callers cannot relabel arbitrary series
as local wages. BLS responses must return the exact requested IDs.

Official references: [BLS state/metro data](https://www.bls.gov/sae/data/),
[Texas publication structure and series labels](https://www.bls.gov/sae/additional-resources/list-of-published-state-and-metropolitan-area-series/texas.htm),
[CPI identifier semantics](https://www.bls.gov/cpi/factsheets/cpi-series-ids.htm),
[CPI scope and interpretation](https://www.bls.gov/cpi/questions-and-answers.htm),
[BLS public API](https://www.bls.gov/developers/api_signature_v2.htm).
The `download.bls.gov` state/industry/data-type flat-file probes returned Access
Denied during development. No bypass or alternate identity was used. The working
pipeline requests the documented fixed series directly from the public API; it
does not depend on those unavailable flat files or claim to have archived them.

Real release `pc-6ebf9cdde76d3f3707d0d18b`, captured 2026-09-16:

- 2016-01 through 2025-12; 105 series across 51 state/DC regions plus national data.
- 12,599 numeric observations out of 12,600 monthly slots.
- The one missing source value is October 2025 national CPI. It therefore also
  prevents CPI-adjusted earnings for that month in every geography. Employment and
  nominal earnings remain independently available.
- Six API requests, at most 20 series and ten years per request, without a key.
- Public JSON is 1,658,750 bytes, 77,542 bytes compressed with gzip. Repeated source
  hashes preserve provenance and compress well.

The checked-in example compares Texas from December 2019 to December 2025. Its
replayed calculation gives approximately +4.2842% CPI-adjusted hourly earnings and
+11.5908% private payroll jobs. These are dataset calculations, not individual
financial predictions or a causal assessment of policy.

## Run locally or as a future remote job

Run from `sites/AntiWorkProTwerk`:

```powershell
# Fetch the defined regional catalog, archive, validate and publish.
npm run civic -- paycheck --plan docs/plans/platform/paycheck-bls.json

# Rebuild from captured bytes without government or model requests.
npm run civic -- paycheck --plan docs/plans/platform/paycheck-bls.json --offline

# Import a portable acquisition bundle supplied by another collector.
npm run civic -- paycheck --input .local/paycheck/input.json --workspace .local/paycheck-import --output .local/paycheck-import/public

# Reproduce a calculation, including every state's comparison, without the browser.
npm run civic -- paycheck-calc --input public/data/paycheck/releases/pc-6ebf9cdde76d3f3707d0d18b/data.json --plan docs/plans/platform/paycheck-example.json --output .local/paycheck/example-calculation.json
```

`paycheck-calc --plan` also accepts a downloaded calculation, checks its dataset
hash, and reuses its `configuration`. A different snapshot cannot silently replace
the data behind a saved calculation. The browser pins date/state/measure edits to
the loaded release; **Check latest snapshot** is the explicit refresh operation.

The recipe accepts 2–10 captured years and a nonempty unique set of known state
codes. Use a separate output directory for a changed scope/year set rather than
changing the meaning of an existing collection. The pipeline exports `runPaycheck`,
`buildPaycheck`, and `paycheckCatalog`; the client library exports schemas,
calculations, indexing, selection, and region comparisons. A future task runner can
invoke the same functions and publish the files; no database, account, scheduled
service or AI adapter is required. A scheduled refresh is not currently running.

The job reuses the existing bounded BLS transport. Requests have a 30-second
timeout, at most three attempts, redirect rejection and an 8 MB response limit.
Public unregistered API limits still apply: avoid repeatedly fetching unchanged
historical data and use offline replay for iteration. Raw responses, requests,
timestamps and SHA-256 hashes stay under ignored `.local/paycheck/raw/`;
`acquisition.json` and `input.json` are portable source bundles.

`public/data/paycheck/manifest.json` points to immutable content-addressed
`releases/<release>/data.json`. Hash/schema verification is required on read. The
shared publication helper provides locking, compare-and-swap and atomic pointer
replacement. Source changes produce a new release; numeric revisions are reported
against the previous capture. Offline replay retains the data's observation time
and release, rather than implying a new government fetch.

## Calculation and evidence safeguards

- Average hourly earnings are neither an individual's paycheck nor median pay.
  Changes in industry, job and workforce composition can move the average. This
  is not a panel following the same people over time.
- Private payroll employment counts jobs at workplaces, in thousands, not unique
  workers or the resident labor force. No inflation adjustment is applied to jobs.
- National CPI is a common temporal price benchmark, not local price levels,
  state-specific inflation or a household spending basket. No ZIP-level measures
  are invented. A national and state comparison uses the same deflator but does
  not certify equal local purchasing power.
- Real hourly earnings at month `t` = earnings(t) × CPI(end) / CPI(t). Changes use
  exact start and end observations. Percent change is `(end/start - 1) × 100`;
  zero or missing baselines make it unavailable. A difference between state and
  national percent changes is labeled **percentage points**, not percent.
- National estimates are fetched independently, never summed or averaged from
  states. Same-month endpoints reduce seasonal mismatch but do not remove seasonal
  patterns in the intervening monthly series.
- Annual-average `M13` values are excluded. Invalid numeric strings, duplicate
  series/months, unexpected IDs/years, BLS error messages, hash failures and missing
  requested series fail the job. Missing monthly values are explicit nulls.
- Numeric disappearance from a previously published capture fails for investigation
  rather than silently erasing history. Stale captures, scope changes and conflicting
  same-time observations cannot replace the public pointer. Earlier releases remain
  available; observed revisions are not a full historical-vintage database.
- Missing endpoint CPI blocks only the affected real-earnings/inflation results;
  nominal earnings and employment do not become unavailable by association.

## Verification

`tests/civic-paycheck.test.ts` checks series identity/geography/units, exact
arithmetic, CPI adjustment, indexing, seasonal-window validation, missing and zero
baselines, malformed/incomplete source data, revision replay, local acquisition,
offline publication, pinned loading and corruption rejection.
`tests/browser/paycheck.spec.ts` checks real-data calculations and exports, state
selection, signed map metrics, shared-map navigation, URL restoration, phone layout,
reduced motion, missing-CPI behavior and refusal to substitute a missing pinned
release. Source data and derived values are separate from test fixtures.

Verified 2026-09-16: 70 code/integration tests and all 24 browser tests passed;
Svelte check reported zero errors and warnings. The repository build produced both
independent sites. The prerendered page includes the real 105-series summary, its
relative links resolve inside the registered site, and the frozen JSON exists in
the build. The live route returned HTTP 200 on the existing port 5173 server. No
coworker site sources were changed, and no commit or push was performed.
