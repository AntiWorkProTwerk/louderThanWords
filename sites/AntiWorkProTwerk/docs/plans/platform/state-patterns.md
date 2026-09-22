# State patterns: from two measures to a question

Live development route: `/records/patterns/`. The shared Explore data catalog and
the Connections page both link here. This is a measured cross-series comparison,
separate from the exact-issuer-ID relationship graph.

## What the data is

This reuses two already collected, immutable BLS snapshots. No new source
collection, AI labels, credential, database or external task service is involved.

- Paycheck release `pc-6ebf9cdde76d3f3707d0d18b`: state private-sector average hourly
  earnings and payroll employment, not seasonally adjusted (CES).
- Economy release `ec-88408cfef50caf1ad436ac18`: resident unemployment rates,
  seasonally adjusted (LAUS).

The projection copies December endpoint observations for 2016–2025, preserving
the exact series IDs, values, footnotes and source-receipt hashes. It covers the
50 states plus DC, joined by captured state/FIPS metadata and exact expected BLS
series IDs. Duplicate series, duplicate months and mismatched IDs fail rather than
being guessed. National series are not treated as another state observation.

The initial published projection is `pt-26eff0921455f5bf46b168d3`, 217,428 JSON bytes.
Its output has nine December-to-December windows (2017 through 2025). The reusable
pipeline is `buildPatterns(paycheck, economy, upstream)` / `runPatterns(root, output)`:

```powershell
npm run civic:patterns
npm run civic:patterns -- public/data .local/patterns-export
```

Full source hashes are checked before projecting. Publication verifies any prior
release, rejects upstream time regressions/same-time changed captures, and uses
the existing atomic compare-and-swap snapshot publisher. Replaying identical
sources produces the same immutable release. Browser readers verify the projection
hash and pinned release; an unavailable pin never falls through to newer data.

## What the picture means

Choose **Pay + jobs** or **Pay + unemployment**, then one year. Each dot is one
region's pair of year-over-year changes. Pay and jobs use percentage changes;
unemployment uses percentage-point differences. The comparison uses nominal
average earnings, not inflation-adjusted pay or a typical worker's raise.

Pearson r is calculated across complete region pairs for that one year. Every
region has equal weight. Missing endpoints, absent series and nonpositive
percentage-change baselines are excluded and listed, not replaced by zeros.
An actual zero unemployment rate remains usable for a rate difference. Fewer than
three pairs or a constant axis yields no coefficient. No p-value, causal effect,
prediction or individual-level inference is provided. The selected state does not
change the sample or r; all rows remain available in the data table and download.

The initial 2025 projection yields r≈0.1002 for pay/jobs and r≈0.1196 for
pay/unemployment (51 pairs each). These are calculations on the frozen data, not
independent source assertions. Small coefficients are shown as such, without an
automated “strong relationship” narrative.

CES describes jobs by workplace and LAUS describes residents. LAUS also uses
payroll information among model inputs, so they are not wholly independent
measurements. The differing seasonal adjustments remain explicit. See
[BLS LAUS methods](https://www.bls.gov/lau/laumthd.htm),
[BLS earnings technical note](https://www.bls.gov/news.release/realer.tn.htm), and
[NIST scatter-plot guidance](https://itl.nist.gov/div898/handbook/eda/section3/eda33q.htm).

## Interaction and presentation

- The initial axes fit the selected year, include zero and are explicitly labeled
  as rescaled. Locking axes uses all available years for that comparison and enables
  animated dot movement. Rescaled views do not animate misleading trajectories.
- Native dot buttons support keyboard selection; the state selector and complete
  data table also expose overlapping points. Reduced motion disables transitions.
- Map colors and chart dots use the same change-direction categories, not rankings.
  A selected state has a dark outline; missing pairs remain uncolored. Unknown
  regions do not silently select the default Texas outline.
- State history cells show both values for every available year. Locate on map
  focuses the existing map and collapses the phone sheet without changing the
  comparison. No office or worker location is inferred.
- Source links preserve the state, endpoint dates and original upstream release.
  Downloads contain the configuration, pairs, exclusions, raw endpoints, r and
  upstream identifiers for independent reproduction.

## Verification checkpoint

180 code tests pass; Svelte check reports zero errors and warnings. The first
12-test targeted browser run had 11 passes and one failure caused by an ambiguous
implicit select label. The selector now has an explicit accessible name. All seven
pattern/explorer tests then passed, including exact frozen links, 51-row cohort
preservation, JSON download, one persistent map, keyboard dots and phone overflow.
The full 70-test browser suite subsequently passed. Desktop and phone screenshots
were inspected and the initial compressed all-years
view was replaced with the readable single-year default described above.

Both site production builds passed. The built patterns HTML is 304,163 bytes /
27,257 gzip bytes, including its initial frozen projection; the separate projection
file is 217,428 bytes / 11,479 gzip bytes. Do not double-count embedded initial data
as an additional initial request. Subsequent full-browser/performance verification
is in progress.
Production timing script: `npx tsx scripts/civic/patterns-performance.ts`. It keeps
all receipts under `.local/patterns/performance/`, records document/load failures,
and measures year/pair/state/scale/source interactions with animations on, three
desktop and three emulated phone samples (4x phone CPU, 1.6 Mbps, 80 ms, software
WebGL). The strict local target is below 200 ms, not a field-performance guarantee.
Do not borrow the Connections or catalog timing results for this route.

The first production receipt (`2026-09-17T06:56:21.099Z`) measured desktop maxima
264/152/208 ms and phone 104/96/104 ms. Phone input readiness was 2,004/1,835/1,821 ms;
no page errors or horizontal overflow occurred. The strict timing gate was not
passed. It also exposed three aborted representative-demo summary requests during
rapid state changes in the records view. Those unrelated queries are now disabled
in records routes (re-enabled on return to representatives), with a browser check
for both behaviors. The full data table mounts only when its details panel opens.
State highlighting is no longer a dependency of the correlation/map-color
calculation, and the all-years trajectory depends on the pair, not the selected
year. These follow-up changes require their own measurements; the earlier timing
receipt does not establish their outcome. All 13 affected pattern/explorer/Said-Did
checks passed after query/table changes, before the final reactive-key refinement.

Final iteration verification: the optimized build passes Svelte check with zero
errors/warnings and both site builds. The entire 70-test browser suite passed
again after all query, table and reactive-key changes. The calculated-data module
remains covered by the 180 passing code tests. Initial HTML after table deferral
is 293,160 bytes / 26,451 gzip bytes, with no table body in the initial markup.

The final timing receipt at `2026-09-17T07:04:30.999Z` has no aborted requests,
load errors, page errors or overflow. Desktop maxima are 296/128/96 ms and phone
96/88/88 ms; phone input-ready times are 2,045/1,850/1,926 ms. The first desktop
sample still fails the strict below-200-ms target, so that target remains open.
The later samples are not a reason to discard the first one. This is a small local
emulation run, not a physical-device or field-p75 claim. The live dev and production
preview processes remained running throughout the iteration.

## Read a dot: axis guides and keyboard browsing

The scatter plot now traces a focused/hovered region to both axes with dashed
guides. Its readout explicitly distinguishes a preview from the selected state.
The guide and dot motion share the fixed-axis transition; both disable movement
when axes refit or reduced motion is requested. Labels near the right edge turn
inward. No values, source joins, cohort membership or correlation calculations
change in this interaction layer.

The plot has one Tab entry point (selected state, or the first available point).
Left/right browse regions ordered by horizontal value, up/down by earnings;
alphabetical tie-breaking makes coincident dots reachable. Home/End reach the
alphabetically first/last region, arrows stop at the bounds, and Tab exits.
Browsing only previews; native Enter/Space or clicking selects. The state selector
and evidence table remain available. Pointer and keyboard focus are tracked
separately so moving the pointer away restores the focused region's readout.

`plot-navigation.ts` has two dedicated tests for ordering, ties, bounds, invalid
values and untouched native keys. All 184 code tests pass. The initial 13-test
inspector/pattern/navigation/explorer run passed; screenshots were inspected.
Final screenshot checks now wait for map loading to finish, and assert the added
preview/selected label. Svelte check, final build and timing verification are being
repeated. The production performance sequence now includes keyboard preview and
selection as well as the inspector; previous narrower timing receipts do not prove
the performance of this expanded sequence.

The final 13 targeted checks passed after the label and screenshot changes, and
both site builds passed with zero Svelte errors/warnings. A settled screenshot
also confirms the complete direction-colored map alongside the preview guides.
Expanded production receipt `2026-09-17T07:40:48.566Z`: desktop maxima 296/272/144 ms,
phone 152/184/144 ms, phone readiness 1,991/1,905/1,926 ms. No load/page errors or
overflow. The strict target still fails on desktop. Captured input labels locate
the slow frames around scale changes, pair changes and source expansion; most of
the delay is presentation rather than handler execution. This does not establish
a causal speedup from the inspector's animation layer.

A follow-up separates map-marker label updates (which depend on selection) from
point-data publication (which does not), and supplies a stable empty count object
for metric-only patterns. A read-only browser instrumentation check confirms that
changing CA to WA within a pinned release now updates only selection filters/paint,
not GeoJSON point data or the coverage fill. A scale-only change makes no map calls.
The first transition from an unpinned URL to a frozen release still reloads and
verifies that release, legitimately refreshing data. The initial diagnostic did
not distinguish that transition; it is not evidence of an unnecessary reload.
The shared-map refinement is receiving a fresh full regression and production run.

The shared-map refinement passed the entire 76-test browser suite (including the
two new navigation tests), and Svelte check remained at zero errors/warnings.
All 184 code tests passed earlier in this iteration; the final refinements only
change component dependency boundaries. Final production build/timings follow.

Both final site builds passed. The immediate post-build preview returned a real
404, retained as failed receipt `2026-09-17T07:50:21.913Z` (zero samples). A subsequent
read-only health check confirmed HTTP 200 and the new guide/instruction markup
before a separate measurement was started. Neither server was restarted and the
failed run was not silently retried within its sample batch.

Final receipt `2026-09-17T07:51:21.190Z`: desktop interaction maxima 368/288/360 ms;
simulated phone 152/168/160 ms, with input readiness 2,060/1,924/1,881 ms. All six
samples completed without load errors, page errors or horizontal overflow. The
strict timing target remains **failed** on desktop; these measurements do not
prove an overall speedup from the dependency refinement. The verified benefit is
the absence of redundant data publication on same-release selection changes.
Further desktop rendering profiling and the static-map preview alternative remain
open presentation work. Both local servers remain running. No commit or push was
made during this iteration.
