# Map-first atlas redesign

The user rejected the large left headline overlapping geography and the evidence
column consuming most of the screen. This redesign changes the shared evidence
shell, not the sources, filters or data meaning.

## Design direction and research

Reviewed the current upstream [Anthropic frontend-design skill](https://github.com/anthropics/skills/tree/main/skills/frontend-design)
and [Mapbox's floating-sidebar camera-padding example](https://docs.mapbox.com/mapbox-gl-js/example/offset-vanishing-point-with-padding/)
on 2026-09-17. The skill guided a map-led composition, restrained typography,
progressive disclosure and screenshot critique. No third-party scripts were run,
no global skill package installed, and no map service or credential was introduced.
The Mapbox example informed the occlusion-aware camera behavior; this application
still uses its installed MapLibre renderer and local boundary files.

Palette: paper #fbfdff, geographic wash #edf4f8, ink #193a4a, edge #cedee7,
brand accent #e82545. Existing Inter provides controls/body text and Barlow
Condensed provides short record titles. Actual data layer colors are unchanged.
The large U.S. map, not a decorative headline, is the central visual.

```
brand     explore data / connections / patterns             account
┌ context ┐                                      ┌ records ──────┐
│ state   │          real U.S. geography          │ expand / hide │
└─────────┘                                      │ filters       │
                                                 │ source records│
map controls                                     └───────────────┘
```

Desktop evidence pages use a 420 px floating dock, 20 px from the viewport edge,
instead of the old 58–67% column. A compact context card replaces the oversized
left heading; map limitations are available through “What the map shows.” The
short top navigation links to the searchable data catalog instead of listing
every product in a horizontally scrolling strip.

“Expand” provides an optional wider reading dock (up to 760 px). “Map only” hides
the dock without unmounting records or replacing the map; “Open records” restores
it. Focus moves to the restore button when hiding, and back to the dock controls
when reopening. Filters, peer selections, releases and data are unchanged.

MapLibre draws beneath the overlays and fits geography to the unobscured area.
The lightweight SVG map reserves the same geographic space with a responsive
inset. The existing national/state camera transition responds to layout changes;
reduced motion remains respected. Below 901 px, the layout becomes a map with an
evidence sheet rather than compressing a desktop sidebar further.

The dock is an inline-size container: forms and record cards adapt to the panel
width, not just viewport width. Insider Records receives a smaller introduction
and a native disclosure for its full interpretation warning. The warning title
stays visible; the source caveats are not deleted.

## Verification checkpoints

Initial Svelte check: zero errors/warnings. Twenty targeted browser checks pass
across the new atlas controls, both map renderers, 1280–2048 px desktop layouts,
compact correlation controls, insider evidence, catalog navigation, map inspector
and 320–700 px phones. Screenshot review caught a specificity collision affecting
the SVG inset; it was corrected before the final atlas tests. Final screenshots
show geography clear of the context card and dock in both renderers.

The full browser regression and final build checks are recorded below when complete.
Earlier v5/v6 interaction receipts predate this redesign and do not prove its
performance. No physical-device or universal accessibility claim is made.

The first broad run was deliberately stopped after exposing an early-hydration
control issue and a navigation assertion against the removed link strip. New dock
buttons now wait for mount, and dock layout resets only when the route pathname
changes, not when record filters change. Five cross-product tests now navigate
through the real catalog. The vote test explicitly selects Texas after opening
the catalog's all-state view; its original receipt count and evidence assertions
are preserved. A fresh full suite was then started, rather than counting the
interrupted run as a pass.

The complete run finished with 100/103 passes. The remaining cases identified:

- The EPA click test needed to respect camera padding; the map click handler also
  now rejects a feature ID removed from the current filter while worker geometry
  is catching up. The original exact-facility identity assertion remains intact.
- A WebGL layout assertion still expected the canvas itself to occupy a separate
  column. It now checks actual rendered WA/CA/TX/ME/FL anchors against the context
  card, dock and toolbar. Reading transient `getPadding()` values was insufficient
  because fitting can commit an offset center and reset padding afterward.
- Patterns retained a higher-priority old heading size; the atlas now explicitly
  overrides it and keeps a larger SVG/context gap, including the 800 px layout.

After corrections, the 12-test atlas/EPA/comparison/trials run had 11 passes and
the transient-padding assertion failure described above. All four comparison tests
then passed using rendered-anchor checks. This is not a claim of a new 103/103 full
run after the fixes. Final code tests: 207/207; Svelte check: zero errors/warnings.

The first production build exposed four routes that had depended on the old
always-rendered navigation for crawl discovery. The site config now explicitly
enumerates its static record-page directories, alongside the existing Said/Did
entries. No missing-route warning was suppressed. A new test asserts that every
catalog destination is included. Both independent site builds then pass, and the
final code suite is **208/208**. Development remains running on port 5173.
