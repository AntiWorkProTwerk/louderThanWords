# State-first map loading

The WebGL map now makes U.S. states usable before loading the surrounding-country
background. The source geometries, tolerances, coordinates, provenance and release
URLs are unchanged: this is progressive loading, not geographic simplification.

## Evidence for the change

The frozen `states.geojson` is 579,081 bytes and `world.geojson` is 3,938,398 bytes
on disk, before HTTP compression. A pre-change production trace with the existing
4× CPU / 1.6 Mbps / 80 ms phone profile took 13,117 ms to produce the 51 state
markers. The state request finished in 2,338 ms and the world request in 8,168 ms,
measured relative to each request's own start. The global map `load` event waited
for both. The ready-dependent release effect then redundantly requested states
again; that second request used the browser cache but repeated source work.

## Behavior

- The initial map style includes states and evidence sources, but not the world
  background. Existing state selection, comparison outlines, previews, source
  points, camera controls and the complete correlation cohort are retained.
- After the initial map is ready, the unchanged world URL loads in MapLibre's
  worker. The original land and country layers appear beneath the state layers
  with a 300 ms opacity transition, or no transition under reduced motion.
- The overview control gives a compact loading/failure hint. The inspector
  explains that state boundaries remain available and offers a separate retry
  if surrounding countries fail. A screen-reader status announces the stages.
  Retry moves focus to the stable explanation, not to a disappearing button.
- Switching to the lightweight renderer removes an unfinished background source,
  cancelling the worker request. Completed background layers stay on the retained
  WebGL map for a return visit. Cleanup ignores obsolete callbacks.
- Release changes replace the background with that release's URL; they do not
  reuse context from another release. State source updates now occur only when
  its actual release changes, not every ready/render-mode transition.
- A surrounding-country failure is not a state-data failure. Missing background
  geography is disclosed, never substituted with a fabricated image or counted
  as missing statistical evidence.

MapLibre's installed implementation was inspected: URL sources load/parse in the
worker; `removeSource` aborts its pending request; worker errors can resolve the
`setData` promise after emitting an error. The implementation therefore observes
source readiness/error events instead of assuming promise resolution means success.

## Verification

Initial lifecycle tests and five focused browser checks pass. They cover separate
state/background readiness, exact URL/layer order, missing background with retry,
no duplicated state request, renderer changes, retained canvas and the existing
slow-state/lightweight loading paths. The next expanded run additionally asserts
actual network cancellation, retained keyboard focus and existing narrow layouts.

The production profile is now `state-patterns-v5-background`. It preserves the
v4 interaction sequence and adds an inspector preview/dismissal after geographic
context is ready. It keeps the strict below-200-ms gate, while separately recording
`mapReadyMs` (51 state controls in the DOM), `backgroundReadyMs` (background source
and tile readiness), and completed geography-request timings. Neither readiness
measure claims final paint. WebGL samples wait for the background too; the test
does not silently stop measuring before the larger dataset completes.

Earlier receipts remain intact. Full regression, build, visual and production
timing evidence will be appended as each check completes. No database, service,
new source collection, model inference or external write is involved.

### Functional checkpoint

All **200 code tests pass**, including four background lifecycle tests. The
expanded **18-test map browser regression passes**, including actual request
cancellation, retained completed backgrounds/canvas identity, keyboard retry focus,
two-state comparisons and the existing mobile layout matrix. Svelte check reports
zero errors/warnings and both independent site builds pass. Desktop state-first
and scrolled phone retry screenshots were inspected. The final full browser
suite and production batches are recorded below once complete.

WebGL/default-graphics receipt `2026-09-17T10:13:51.170Z` completes six samples
without page/load errors or overflow. Desktop interaction maxima: 88/32/40 ms;
phone maxima: 192/176/**208** ms. The last sample fails the strict interaction
gate; its early inspector opening takes about 128 ms of event processing plus
input/presentation delay. No sample was retried or discarded.

Phone state DOM readiness is now **6.10–6.25 s**, compared with **13.13–13.28 s**
in the preceding v4 batch on the same graphics/profile configuration. Full
surrounding geography is separately ready at **13.41–13.50 s**. Each new sample
has one state request (about 1.20–1.24 s) and one world request (about 7.04–7.07 s).
These request durations start at their own request times, not page navigation.
The improvement is earlier usable states, not a smaller dataset or faster complete
background. The change does not solve borderline inspector timing, software-graphics
stress or field/physical-device performance.

Vector/default-graphics receipt `2026-09-17T10:14:55.648Z` also completes six
samples without page/load errors or overflow. Desktop maxima: 64/40/40 ms; phone
maxima: 176/176/**200** ms. It fails the strictly-below-200-ms gate at an early
inspector opening. Phone state DOM readiness is 4.06–4.11 s; background readiness
is intentionally null because this renderer uses only the original U.S. geometry.
Both current batches therefore retain an open interaction-performance gate even
though the WebGL startup critical path is substantially shorter.

### Final regression checkpoint

The full 96-test browser run finished with **94 passes and two strict-locator
failures**. Bill Graveyard and Quiet Rulebook each used an unscoped
`getByRole('status')`; the new map status correctly coexists with their evidence
status, making that locator ambiguous. Both expected evidence messages were
present. The two assertions now select status within `.evidence-workspace`,
preserving both the original checks and the map accessibility announcements.

The final nine-test rerun of both affected views plus background/loading coverage
passes. No application code changed after the production build/timing batches;
only those two test locators were corrected. This is **not** a claim of a fresh
single-run 96/96 result after the test edits. The 200 code tests, clean typecheck
and both builds remain the current implementation checks.

All six vector production samples requested states once and world geography zero
times. The next performance investigation is the early inspector opening seen in
both renderer receipts, separate from the now-shorter WebGL state-loading path.

Subsequent inspector iteration: a fresh full browser run now passes 98/98 tests,
including both corrected evidence-status locators and two new inspector layout
regressions. See `inspector-layout.md` for that implementation and its separate
production receipts; the historical failure results above are intentionally kept.
