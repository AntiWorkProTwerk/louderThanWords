# Chart Check — requirement 39

Local route: `http://127.0.0.1:5173/records/charts/`. Production path uses the shared contributor registry. This is the defined-series implementation permitted by the root plan, not an arbitrary screenshot interpreter or an automated accusation of cherry-picking.

## Product behavior

Choose average hourly earnings, consumer prices, or unemployment. Change start/end months, compare one-, three-, five-, ten-year and full-history windows ending on the same month, or explicitly fit the vertical scale instead of starting at zero. A second small chart always shows the selected interval within the full captured history. Alternative-window changes are totals over different durations, not annualized growth rates.

Hourly earnings can be expressed in nominal dollars or in the selected end month's prices. Real values join seasonally adjusted earnings and seasonally adjusted CPI-U on the exact month:

`real(t) = earnings(t) × CPI(end month) / CPI(t)`

For dollar/index series: `change = 100 × (end / start − 1)`.

For unemployment: `percentage-point change = end rate − start rate`.

No premature rounding, interpolation, nearest-month substitution, or inflation adjustment of rates is performed. An unavailable endpoint means no change calculation. Missing intermediate months break the line even when an endpoint-to-endpoint change is available. Annual-average `M13` records are excluded, never treated as a thirteenth month. Footnotes, including preliminary status, remain visible in the data table and exports. The chart/table label units, seasonal adjustment, geography, missing months and source vintage.

Average hourly earnings are an aggregate of private nonfarm payroll employees, not median pay or a fixed cohort of workers. Changing job composition can change the mean. CPI-U is a U.S. city-average urban-consumer measure, not household or state inflation. State unemployment is residence-based and uses different estimation methods from the national series. No state averages manufacture a national unemployment rate; no significance test, intent classification, or causal claim about politicians is produced.

## Real data and catalog

The [BLS API documentation](https://www.bls.gov/developers/api_signature_v2.htm) describes structured time-series requests and optional registered-only features. This adapter uses the no-key subset: at most 20 series and ten years per request; it does not ask for catalog/calculation extras or registration credentials. The plan supports up to twenty years by splitting into bounded requests.

Catalog definitions:

| Series | Meaning / use |
|---|---|
| `CES0500000003` | Average hourly earnings of all employees on total private nonfarm payrolls, dollars per hour, seasonally adjusted. |
| `CUSR0000SA0` | CPI-U all items, U.S. city average, seasonally adjusted, index 1982–84 = 100; explicit earnings deflator. |
| `LNS14000000` | National unemployment rate, seasonally adjusted, percent of the labor force. |
| `LASST<state FIPS>0000000000003` | State/D.C. unemployment rate, seasonally adjusted. Example: Texas `LASST480000000000003`. |

The [BLS real-earnings table](https://www.bls.gov/news.release/realer.t01.htm) identifies CPI-U as the deflator for all-employee earnings. The [CPI series-ID guide](https://www.bls.gov/cpi/factsheets/cpi-series-ids.htm) documents the identifier structure. [BLS state-rate notes](https://www.bls.gov/web/laus/laumstrk.htm) explain the rate's denominator, residence basis and revisions. The adapter validates state area IDs/names against the captured [BLS area file](https://download.bls.gov/pub/time.series/la/la.area) and independently checks code/FIPS/name against the site's trusted geographic manifest. An imported label cannot silently move Texas data to California.

Release `ec-88408cfef50caf1ad436ac18`, captured September 16, 2026, contains January 2016–December 2025: 54 series (three national plus 51 state/D.C.), 6,480 monthly slots, 6,427 numeric observations and 53 missing values. Missing values occur in October 2025 in CPI and the unemployment series. Their absence is preserved without inferring a reason. The initial release has no revision comparison against a predecessor. This is a historical window, not a claim to include current-month releases.

Payload: 842,136 bytes / 27,899 bytes gzip. Acquisition used three API batches plus the area lookup. The entire monthly artifact is small when compressed; SVG renders one selected series and its context, while the accessible table renders 24 rows at a time. State cards are 51 bounded entries, alphabetical rather than a performance ranking.

## Pipeline and calculation commands

Run from `sites/AntiWorkProTwerk`:

```powershell
# Acquire real observations, archive responses, validate and publish.
npm run civic -- economy --plan docs/plans/platform/economy-bls.json

# Reproduce the last captured acquisition without any HTTP request.
npm run civic -- economy --plan docs/plans/platform/economy-bls.json --offline

# Supply an acquisition envelope directly.
npm run civic -- economy --input .local/economy/acquisition.json

# Reproduce a chart independently of the browser.
npm run civic -- chart --input public/data/economy/releases/ec-88408cfef50caf1ad436ac18/data.json --plan docs/plans/platform/chart-example.json --output .local/economy/chart-example.json

# A downloaded calculation can itself serve as the plan; its dataset hash must match.
npm run civic -- chart --input PATH-TO-FROZEN-SNAPSHOT.json --plan PATH-TO-DOWNLOADED-CALCULATION.json --output .local/economy/replayed-chart.json
```

`runEconomy` is the local/future-remote acquisition boundary. `buildEconomy`, `analyzeChart`, `alternativeWindows` and `stateUnemployment` are separately reusable functions. A future scheduled job can persist the prior output artifact directory and invoke the same job; consumers read the same JSON. No database, AI model, account, secret or scheduler setup is required.

`--workspace` and `--output` isolate another acquisition experiment. `economy` output is a directory; `chart` output is a calculation JSON file. Keep the original start year/collection identity and extend the end year to grow a tracked collection. Do not silently shorten captured history or remove previously tracked series. A new collection should use a separate output/workspace. A later job must carry forward previous releases if old share links are to remain resolvable.

The input envelope archives the plan, state crosswalk, BLS area text, requests, responses, hashes and capture times. Exact raw API response text is also archived privately under `.local/economy/raw`. HTTP uses fixed official endpoints, redirect rejection, 30-second timeouts, three bounded attempts for transient failures and an 8 MB response cap. No request credentials are accepted. BLS success-with-message responses fail closed because a warning can signal truncation; missing requested series, unexpected identities, overlapping requests, unsupported periods, invalid numbers and checksums fail validation.

All requested series/year blocks must be accounted for. Unreturned months become explicit unknowns, not zeros. A previously numeric month disappearing from a later response blocks replacement, while an explicit source missing-value marker is preserved. Numeric revisions are recorded against the preceding publication. Exact replay retains that revision receipt; it does not reset it to zero. Tests caught and fixed property-order sensitivity in this comparison.

## Frozen outputs and shareable evidence

`public/data/economy/manifest.json` points to immutable `releases/ec-<hash>/data.json`. Schema/hash validation and optimistic predecessor checks protect reads and publication. A saved link includes the release, dates, geography, measure, adjustment and axis choice. A missing pinned release produces an error, not substitution with a newer vintage. Historical snapshot URLs verify their content-addressed release identity. **Load latest published snapshot** is an explicit action and does not run acquisition.

**Download calculation** exports the frozen dataset hash, parameters, formulas, input values, CPI joins, selected points, context, missing months, footnotes and alternative results. The `chart` command checks the dataset hash when replaying that export. The example calculation returned `6.3649461782525645` percent CPI-adjusted hourly-earnings change from January 2016 through December 2025, in December 2025 prices. This is a derived statistic for that window, not a general claim about an individual's purchasing power.

## Map and cross-product connections

Unemployment mode puts one observation marker at each available state label anchor, with end-month rates and start-to-end percentage-point changes in tooltips and the accessible state list. A missing end-month observation has no point; the UI never relabels it as a zero unemployment rate. All points have a common size because they represent observations, not worker counts. State selection changes the chart without replacing the map instance. Highlighted labels use dark text on the light-blue economic geography selection.

Earnings and CPI remain national views; selecting a state explicitly switches to that state's unemployment series. This avoids depicting national inflation as fifty local observations. Geographic links return to the same state's Vote Receipts/representatives, but the UI explicitly disclaims causal attribution. The monthly-series/CPI foundation is reusable by #34; occupational and regional pay/employment requirements for that product remain unfinished.

## Verification

Six economic tests cover monthly/annual distinctions, gaps and footnotes; percentage versus percentage-point changes; exact monthly deflation; broken SVG paths; invalid endpoints; source checksums and BLS warning/partial failures; independent geographic joins; revisions/replay/disappearance protection; ten-year request splitting; immutable outputs; base paths and pinned-release integrity.

Two browser tests exercise real charts, nominal/real switching, axis disclosure, date presets, October 2025 gaps, batched accessible tables, exported arithmetic independently recalculated from source inputs, pinned links/reload, all 51 regional markers, a persistent map canvas, phone layout/reduced motion, malformed links, unavailable CPI endpoints and missing state observations. Screenshots are inspected, not just generated. The reusable CLI calculation and offline acquisition replay were both run on the real artifact.

The full platform goal remains open. This document records one implemented defined-series product, not completion of the other numbered requirements.

September 16 verification: all 59 unit/integration tests and all 20 browser tests passed. Svelte check returned zero errors and warnings. The root production build completed both independent sites; the prerendered chart HTML, contributor-prefixed artifact links, 54-series payload and 51-region coverage were verified directly. Desktop/phone charts were visually inspected, including missing-month breaks and readable phone axis labels. The live route returned HTTP 200 after the build, and the original dev server remained listening on 127.0.0.1:5173. Coworkers' site source directories were unchanged.
