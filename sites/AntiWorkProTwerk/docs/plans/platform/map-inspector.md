# Inspect the map without changing the record

The shared map toolbar now has **Inspect map**. It opens an accessible, nonmodal
panel with a separate preview-state selector. Choosing a preview or following the
pointer over a state changes only the panel and a dashed map outline. It does not
change the URL, current record filters, correlation sample, selected-state outline
or map instance. **Use [state] in this view** explicitly invokes the existing
state-selection behavior. Escape closes the panel and returns focus to the trigger.
Existing direct clicks on map states retain their normal selection behavior.

Pointer-following is optional and turns off when a state is chosen manually.
Touch devices hide that option and use the selector. The panel has viewport-bounded
scrolling, readable touch controls and reduced-motion support. It closes on route
or query changes, preventing a stale preview from lingering in a different view.

## Source-aware interpretation

`src/lib/civic/map-inspector.ts` defines each view's map units and source metadata,
reusing the shared catalog's names and source labels. It distinguishes:

- Collected counts, including explicit zero counts, from absent matching counts.
- Measured numeric values (including zero) from missing or invalid observations.
- Geographic-context-only maps from state-level measurements.
- Unavailable collections from loaded collections with no matching observation.
- Illustrative demos from the real-source record views.

The panel explains that counts are not per-capita rates, quality scores or national
rankings. State anchors are not exact facility, office or worker locations. Its
metric explanation is copied from the actual map value's label, preserving the
selected period, units and geographic meaning. Previewing only reads already
loaded data; it does not collect or infer additional records.

Zero counts no longer receive the WebGL coverage fill merely because a state key
exists. A genuine zero metric remains a plotted observation. This aligns coverage
fill with the existing count-point behavior and the fallback map. The pattern
chart and inspector share one `patternLegend` definition so their colors and labels
cannot drift independently.

## Implementation and verification

- `MapInspector.svelte`: native controls, floating nonmodal panel, preview/apply flow.
- `USMap.svelte`: independent preview outline and marker/polygon pointer events.
- `Explorer.svelte`: current view, loaded-data state and route identity.
- `tests/civic-map-inspector.test.ts`: all catalog sources, exact units, missing,
  explicit zero, nonfinite observations and coverage-color rules.
- `tests/browser/map-inspector.spec.ts`: unchanged URLs/records, persistent map,
  pointer pinning, explicit apply, keyboard dismissal, demo/context/missing data,
  touch layout and a smaller viewport.

182 code tests pass. Svelte check reported zero errors/warnings after correcting a
Svelte rune-name collision and declaration order. The first browser attempt found
the popover had no accessible dialog role; the component now declares its nonmodal
dialog role explicitly. All 11 targeted inspector/pattern/explorer checks then
passed. Desktop and phone screenshots were inspected. The subsequent full 74-test
browser run, final build and production timings are in progress.

The initial full run had 73 passes and one failure on a touch viewport resized to
320×568. The panel was 468 px tall at y=183, extending to y=651 in a 568 px viewport;
only about 373 px were actually available beside its anchor. Its height now also
respects Floating UI's available-height value. All 13 affected inspector/catalog/
explorer tests passed afterward, including the touch resize. Demo warnings were
moved above the data readout so they remain prominent on short screens. Final
full-suite verification is being repeated for that exact build.

The patterns performance script now also measures opening the inspector, changing
its preview without changing the URL, and explicitly applying a state. Its profile
label records the expanded sequence. Prior timing receipts are not evidence for
this new sequence; all raw reports remain in `.local/patterns/performance/`.

The repeated full browser suite passed all 74 tests after the height and warning
placement changes. Fresh desktop and touch-phone screenshots were inspected. The
production measurement at `2026-09-17T07:35:19.424Z` completed all six samples with
no load errors, page errors or overflow. Desktop maxima were 264/192/168 ms; phone
maxima were 144/152/264 ms, with phone readiness 2,022/1,836/1,854 ms. It failed the
strict below-200-ms target. Event Timing identified the first desktop outlier as
opening the inspector (about 235 ms presentation delay on the click). Removed
popover buttons had null targets, so the next measurement also preserves original
input timestamps/labels separately for attribution. The mounted inspector now has
its own animation layer; any speed improvement still requires new measurements.

The expanded chart/inspector sequence at `2026-09-17T07:40:48.566Z` had desktop
maxima 296/272/144 ms and phone 152/184/144 ms, without load errors or overflow.
Desktop frames around chart-scale/source controls still miss the target, so the
animation layer is not treated as a proven overall performance fix.

The earlier static-fallback limitation is addressed by the subsequent lightweight
map iteration (`lightweight-map.md`). Its projected state shapes now support the
same independent inspector outline and selection workflow without WebGL. The main
state selector remains available as an alternative.

Final shared-map/chart refinement verification: 76 browser tests passed and both
site builds passed. Latest expanded production receipt `2026-09-17T07:51:21.190Z`
completed six error-free samples but still failed the desktop timing target
(368/288/360 ms; simulated phone 152/168/160 ms). See `state-patterns.md` for the
retained post-build 404 receipt and exact sequence; performance is not marked done.
