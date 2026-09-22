# Annual correlation history

The State Patterns page now places **Does the relationship persist?** below the
current-year scatter plot and Pearson readout. It shows all nine separately
calculated annual correlations for the chosen pay/jobs or pay/unemployment comparison.

## Meaning and interaction

- These are the existing December-to-December change pairs from the same two
  frozen BLS collections, recalculated separately across regions in each year.
  No observations are pooled across years and no additional source collection,
  inference model, database or external service is used.
  Regions recur and neighboring change windows share endpoints; the years are
  not independent experimental replications.
- The vertical r scale always spans −1 to +1. Lines connect consecutive available
  calendar years only. An unavailable coefficient is a gap with an explicit
  explanation, never a zero; an actual zero remains a point on the zero line.
- The included/excluded counts accompany each estimate. Cohort stability compares
  sorted region IDs, not merely the counts. Changed membership is disclosed as
  another possible reason for a changing correlation.
- Hover and arrow-key browsing preview a year without changing the selected year,
  state, scatter plot, correlation or map. Enter/click selects through the existing
  release-pinned navigation. The map instance is retained and state/pair choices
  are preserved. The selected guide and point emphasis animate; reduced motion
  disables those transitions. A clamped value chip above the plot keeps the active
  year/r visible on a short phone even when the detailed readout is below the fold.
- The chart has one keyboard entry, chronological Left/Right navigation and
  Home/End endpoints. A native details/table view exposes every annual coefficient
  and coverage count with year-selection buttons. Existing year controls remain.
- The calculated-pairs JSON download now includes additive `history` metadata:
  year, r, count, exclusions, exact included-region codes, line segments and the
  cohort-stability flag. Its existing release, data hash and upstream identities
  preserve the source basis. Current-year results keep their original structure.

`pattern-history.ts` is a pure reusable calculation/presentation adapter. It
retains the input coefficients, sorts without mutating inputs and rejects mixed
comparison types, duplicate years/regions and invalid coefficients. It does not
introduce significance tests, causation, forecasts or a pooled-year r.

## Verification

All 192 code tests pass. Four new tests compare the actual frozen-source annual
calculations, missing/nonconsecutive years versus true zeros, exact cohort
membership, validation and bounded keyboard movement. Svelte check is clean.
The initial nine-test history/chart/map-loading browser regression passed. New
browser coverage checks independent preview, explicit selection, persistent map,
preserved state/pair, narrow-screen table/downloads and reduced motion. The final
phone screenshot uses the real scrolled viewport rather than a clipped screenshot
of an element taller than its scrolling panel; touch-center hit tests are added.

The performance profile is now `state-patterns-v3-history`, adding chronological
history keyboard preview, selection and restoration to 2025 before the existing
chart/source/inspector sequence. Prior timings do not validate this expanded
sequence. Final browser, build and timing results follow below.

The final full browser regression passed all **89 tests**, including all 21 data
views and the two new annual-history tests. The final desktop and real scrolled
phone screenshots were inspected; every year marker's center remains tappable
at 320×568. The current-year plot/map and annual history retain separate preview
states. The numeric chip stays within the chart and reduced motion disables its
movement as well as the guide/point transitions.

The final Svelte check reports zero errors/warnings and both site production
builds pass. The preview briefly returned 404 while its asset manifest refreshed;
a later health check confirmed HTTP 200 and the final `history-chip` markup before
starting measurements. No failed timing batch was retried or discarded.

Final expanded-sequence receipts, 2026-09-17 UTC, browser-default graphics:

| Receipt | Map renderer | Desktop maxima (ms) | Throttled-phone maxima (ms) | Strict gate |
| --- | --- | --- | --- | --- |
| `09:24:04.086Z` | Vector | 88 / 32 / 40 | 168 / 160 / 168 | Pass |
| `09:25:29.988Z` | WebGL | 64 / 32 / 32 | 184 / 184 / 200 | Fail |

Both batches completed six samples without page/load errors or horizontal
overflow. The target is strictly below 200 ms, so the final WebGL phone sample
remains a failure. Vector phone map DOM readiness was 4.04–4.26 s; WebGL was
13.14–13.18 s. Evidence readiness was separately recorded. These are desktop-GPU
lab measurements with phone CPU/network emulation, not field percentiles or
physical-phone results. Earlier software-graphics stress failures remain open;
the passing vector batch does not establish universal performance.
