# Lightweight map, shared evidence

The shared toolbar now offers **Lightweight map**. It uses the existing frozen
US Census / US Atlas boundaries with an Albers USA projection. Alaska and Hawaii
are explicitly inset, and Alaska is rescaled. The source file includes territories;
the view selects the 50 states and D.C. listed in the current manifest. It does not
invent additional geographic coverage or replace the real source records.

## Interaction and source semantics

- Switching renderers does not change the URL, record filters, correlation cohort
  or selected state. An already-created interactive map is retained, its camera
  animation stopped, and its data updates deferred until it is shown again.
- A device-local preference starts directly in the lightweight view on a later
  visit, without loading the graphics engine/workers. Blocked storage is nonfatal.
  The lightweight component and projection library themselves load on demand.
- If the interactive graphics constructor fails, the same lightweight view is the
  fallback. Boundary loading errors have an explicit retry; no record filters are
  cleared. A failed boundary load never becomes an empty or fabricated U.S. map.
- The state shapes, source-aware colors, selected outline and independent dashed
  inspector preview share the existing data semantics. Missing values are not
  zero, and illustrative records remain labeled in the inspector.
- U.S. overview, Alaska, Hawaii and current-state focus controls move the view
  without selecting new records. Shapes, labels and points move together; reduced
  motion disables these transitions.
- States have one keyboard entry point and alphabetical arrow/Home/End browsing.
  Enter/Space selects. The existing state selector remains available for small or
  overlapping shapes. Location points have a separate keyboard entry point and
  larger transparent hit regions, without moving the actual source coordinates.
- Actual facility/study/organization points remain distinct from state counts.
  Points outside the composite projection are counted as omitted. Relationship
  lines preserve the original anchor and are omitted across displaced insets; an
  unprojectable anchor is never replaced with a new inferred hub.
- Location evidence opens a viewport-bounded native dialog. Escape and close
  restore focus to its point; the data explorer shortcut does not stack over it.
  Exact facility identifiers use the existing evidence-opening callback.
- Projection/source notes remain visible in the desktop caption and the map
  inspector, including on narrow phones where the caption would collide with
  navigation.

## Implementation and verification

`vector-map.ts` validates and projects the geometry and defines camera, keyboard
and relationship rules. It retains the source's simplified degenerate Delaware
ring rather than manufacturing coordinates. `VectorMap.svelte` renders the native
SVG and location dialog; `USMap.svelte` manages renderer preference, lazy loading,
fallback/retry and the retained interactive instance. Immutable boundary arrays
are held as raw state, avoiding per-coordinate reactive proxies.

All 188 code tests passed, including four new boundary/projection/navigation/
inset-anchor tests. The first 14-test targeted browser run had 13 passes and one
failure: the existing error notice placed its retry button beneath the toolbar.
Retry is now an explicit toolbar action. The facility popup was also changed to a
viewport dialog to avoid clipping inside short phone maps. Svelte check is clean
after correcting the test's canvas `this` annotation. Final browser, build and
production timing checks are recorded below.

`npx tsx scripts/civic/patterns-performance.ts` measures the interactive renderer;
add `--vector` for the same sequence with a saved lightweight preference. Both
profiles retain all raw runs and separate `latest-webgl.json` / `latest-vector.json`
receipts. `mapReadyMs` measures DOM availability of 51 regions/labels, not completion
of every paint or camera animation. Neither profile is a physical-device or field
percentile claim. A lighter renderer is not assumed to meet the timing target
without its own measurements.

The corrected 15-test targeted suite passed, including a real graphics-constructor
failure, retry, renderer persistence, exact facility navigation and a 320×568 native
location dialog. Desktop and phone screenshots were inspected. The location
backdrop now dims without the site's default full-screen blur. Focused Alaska and
Hawaii views clip away neighboring inset shapes; state geometry, labels and point
targets remain aligned during camera transitions. Both site production builds and
the final Svelte check pass. The expanded full 83-test browser suite passed before
the following mobile-layout iteration.

## First production comparison and mobile layout correction

The first explicit renderer runs both failed the strict every-interaction-under-
200-ms gate; a lightweight renderer is **not yet a verified performance fix**.
All samples and failures remain in `.local/patterns/performance/`.

| Receipt (UTC, 2026-09-17) | Desktop maxima (ms) | Emulated-phone maxima (ms) |
| --- | --- | --- |
| `08:30:10.300Z`, WebGL | 264 / 256 / 224 | 152 / 152 / 144 |
| `08:31:09.902Z`, vector | 776 / 808 / 704 | 272 / 264 / 264 |

Neither run had document/asset errors, page errors or horizontal overflow. Vector
DOM map readiness was 525–565 ms desktop and 3,883–3,995 ms phone. The WebGL phone
map was not ready when the action sequence ended, so those map readiness fields
are null—not proof that the map failed. The harness now waits explicitly up to
20 seconds for that independent completion after the action sequence, retaining
the original evidence-readiness time and all interaction measurements. It does
not retry failed samples. Large vector durations were predominantly presentation
delay; this identifies a rendering investigation, not an established root cause.

The short-phone screenshot also exposed overlapping title/map/toolbar content.
Click-center checks alone had missed that readability failure. Evidence pages now
reserve separate space for the compact title and state selector, actual geography,
and a three-column touch toolbar. Controls and the evidence-sheet toggle have
44-pixel minimum heights. The toggle visibly says **Explore evidence / Back to
map**, retains focus, and animates the sheet unless reduced motion is requested.
The source data, correlation cohort and selected region remain unchanged.

New layout tests inspect nonoverlapping geometry and hit targets at 320×568,
390×844 and 700×900, for both renderers and two differently titled evidence views.
Their first run exposed the inherited tablet map's negative margins and minimum
height; these are reset only in evidence mode. Both corrected tests pass. The
11 accompanying inspector/vector tests passed in the first run. A subsequent
Svelte check reports zero errors/warnings. The final full browser regression passes
all 85 tests, including the new responsive layout and camera checks. Both site
production builds pass. Rebuilt production timings are recorded below.

State-focus camera padding now scales down with the geographic viewport. The
former fixed 65-pixel padding nearly consumed a 136-pixel-tall phone map, making
"Focus TX" zoom out instead of in. The layout regression also checks that focusing
Texas increases the existing WebGL camera zoom relative to the U.S. overview.

The first post-rebuild timing attempt (`2026-09-17T08:43:41.494Z`) recorded an
actual preview 404 and zero samples. It is retained, not silently retried within
the batch. A separate health check subsequently confirmed HTTP 200 for both the
production page and live development page before starting a new batch.

### Final layout checkpoint: timing gate remains open

| Receipt (UTC, 2026-09-17) | Desktop maxima (ms) | Emulated-phone maxima (ms) | Phone map DOM readiness |
| --- | --- | --- | --- |
| `08:45:02.719Z`, WebGL | 296 / 264 / 192 | 232 / 248 / 224 | 13.03–13.17 s |
| `08:45:44.838Z`, vector | 904 / 704 / 976 | 672 / 560 / 568 | 3.90–4.00 s |

Both six-sample batches finished without load/page errors or overflow. Initial
phone evidence readiness was 1.97–1.99 s for WebGL and 1.96–2.02 s for vector;
that is distinct from loading the map. Both batches fail the strict interaction
target. The larger, readable vector map is not being advertised as a faster
interaction mode. Its slower frames were overwhelmingly presentation delay,
including chart scale/year changes, keyboard preview and inspector opening.
Next performance work should profile paint/compositing and the lazy graphics
payload, preserve animations/reduced-motion behavior, and measure new batches;
these receipts do not establish a CSS or JavaScript root cause.

The subsequent investigation is documented in `map-rendering.md`. It separates
the forced software graphics backend from the browser's default graphics settings,
retains the stress failures, and adds honest loading feedback. No experimental
removal of state shapes, borders, labels or animations was applied to the site.
