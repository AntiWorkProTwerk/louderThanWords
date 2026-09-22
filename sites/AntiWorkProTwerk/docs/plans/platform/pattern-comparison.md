# Two-state comparison

State Patterns adds an optional `peer=CA` alongside the primary `state=TX`.
Choose a comparison under **Put the changes side by side**, swap the two regions,
return to the marked scatter chart, or open each region's exact source window.
The share URL preserves both regions, year, pair, axis choice and frozen release.

## What the graphics mean

- Both observations come from the existing frozen BLS collections. No new data,
  AI interpretation, external service or guessed entity match is introduced.
- Each measure has its own paired-dot track. The circle is the selected region;
  the diamond is its comparison. A connecting segment shows their numeric gap.
- Scales include zero and all available annual values for these two regions.
  Changing the year moves the markers on the same scale. Changing participants
  or measures remounts the graphic instead of animating across unrelated scales.
- Values retain their original units: percent earnings/jobs growth or percentage
  points of unemployment-rate change. Subtracting the two annual changes produces
  a **percentage-point** difference, not relative growth or a dollar difference.
- A missing value has no marker. Missing either value suppresses the difference
  and connecting segment for that measure, without hiding the other measure.
- The comparison never recalculates Pearson r from just two observations. The
  full annual sample and annual-history estimates remain unchanged.

The persistent map shows a purple dashed comparison boundary, separate from the
solid selected outline and temporary inspector preview. The scatter chart marks
the existing comparison observation, never a duplicate point. A region with an
incomplete pair can still have a geographic outline but has no scatter dot.
The map does not automatically frame both states; overview/Alaska/Hawaii controls
remain available. Geographic outlines do not establish statistical coverage.

Unknown or identical region choices show an explicit message and a clear action;
they do not silently substitute another region. Downloads include `stateComparison`
with both full source-linked rows and the calculated differences. Source links
preserve exact state, dates and collection release. Reduced motion removes marker
and bridge transitions. Mobile controls remain touch-sized.

## Verification checkpoint

Four calculation tests pass: real frozen-source rows and gap arithmetic, unchanged
input/cohort, invalid choices, missing/zero distinctions and zero-inclusive domains.
Svelte check reports zero errors/warnings. The initial three browser tests pass
for both map renderers and a real touch-enabled phone context, including exports,
source round-trips, retained map identity and reduced motion.

Visual inspection exposed desktop title/map overlap. State Patterns now reserves
a measured heading area above both geographic renderers, with more compact title
typography. Final layout/regression/build/performance evidence is recorded below
as checks complete. Earlier performance receipts do not validate this new workflow.
The expanded profiling sequence is `state-patterns-v4-comparison`, adding comparison
swap/restore/chart-link/clear clicks. Native picker latency is not measured by its
programmatic selector setup. The strict interaction target remains below 200 ms;
previous software-graphics stress failures remain open.

The final dedicated browser run passes all four tests, including fixed comparison
domains during a 2025→2020 change and non-overlapping desktop geography at 1672×941,
1280×900, 1024×768 and 800×720. The initially conflicting scoped vector style was
corrected; compact desktop layouts omit the duplicate caption while the inspector
retains projection notes. The narrow desktop toolbar uses two rows. Desktop and
390×844 phone screenshots were inspected. These bounds are not a claim about every
short landscape viewport or arbitrary text-zoom setting.

All **196 code tests pass**. The final full browser regression passed **93 tests**
(6.6 minutes). Final Svelte check reports zero errors and zero warnings, and both
independent site production builds pass. The existing preview returned temporary
404s while its asset manifest refreshed; direct and routed health checks then
confirmed the new comparison markup before either timing batch started. Neither
timing batch was retried or discarded.

Final `state-patterns-v4-comparison` receipts, 2026-09-17 UTC:

| Receipt | Map renderer | Desktop maxima (ms) | Throttled-phone maxima (ms) | Strict <200 ms gate |
| --- | --- | --- | --- | --- |
| `09:57:02.434Z` | Vector | 80 / 40 / 48 | 184 / 168 / 160 | Pass |
| `09:58:04.389Z` | WebGL | 64 / 40 / 48 | 176 / 176 / 168 | Pass |

Both batches used browser-default NVIDIA/D3D11 hardware graphics, animations
enabled, three desktop samples and three 4× CPU / 1.6 Mbps / 80 ms emulated-phone
samples. No page/load errors or horizontal overflow were recorded. Phone evidence
readiness was 2.00–2.04 s vector and 1.94–2.24 s WebGL. Map DOM readiness was
4.05–4.13 s vector and 13.13–13.28 s WebGL; that is not a final-paint measurement.

These are bounded local lab results, not field percentiles or physical-phone
measurements. The older forced-software-graphics failures remain open and were
not remeasured for this expanded sequence. The passing batches do not establish
universal performance or remove the need to improve slow-network map startup.
