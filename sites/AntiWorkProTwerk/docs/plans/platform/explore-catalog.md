# Explore data and map context

The shared **Explore data** button opens a searchable catalog of the 21 implemented
public views. It is navigation metadata, not a new collection of records. Topic
filters, plain-language questions and source labels help explain what each view
can answer. Said / Did remains explicitly labeled as an illustrative public demo.
Unpublished products (including fund votes) are not advertised as available.
The twenty-first view is State patterns; see `state-patterns.md` for its measured
cross-series comparisons and separate verification checkpoint.

Use the header button or Ctrl/Cmd+K. Search matches titles, questions, source names,
topic labels and curated keywords; it does not search every underlying record.
Escape closes the dialog and returns focus. An existing representative dialog is
not covered by a second dialog when the shortcut is pressed.

When a selected company exists in the currently loaded issuer collection, opening
the catalog checks the small, integrity-verified Connections index. Its contextual
links carry the exact SEC issuer CIK into other collected views. A name resemblance
does not qualify. Unmatched companies receive no guessed links; lookup failure
leaves the full catalog available and reopening retries. Ordinary catalog cards
open the destination's full collected scope, not an implicit cross-product filter.

The Connections page also offers **Locate on map**. It uses the existing map,
focuses the recorded business-address state and collapses the phone evidence sheet.
It does not rewrite record filters, reload the map, create an office pin, or claim
that a transaction took place there. Keyboard focus moves to the map's state-focus
button. Navigating to another record clears the temporary map context.

The dialog keeps a fixed viewport-bounded frame while results filter, with an
independent scrolling results region. Its clear-search control reserves space so
the input does not resize while typing. Short landscape screens use a compact
heading. Entry and connection-line animations respect reduced motion. The dialog
uses a tinted overlay instead of a full-screen blur and has its own paint boundary
above the WebGL map.

Implementation:

- `src/lib/civic/catalog.ts`: topic/search metadata and implemented routes.
- `src/lib/components/ExploreCatalog.svelte`: accessible catalog and exact-ID links.
- `src/lib/civic/map-focus.ts`: map-focus context shared with the persistent shell.
- `tests/browser/catalog.spec.ts`: search, stable geometry, keyboard dismissal,
  source labels, reduced motion, landscape overflow, lookup retry and exact links.
- `tests/browser/connections.spec.ts`: locator, unchanged record filters and map identity.

Verification: 176 code tests pass and Svelte check reports zero errors and warnings.
The complete 67-test browser suite passed after the paint-isolation refinement,
including all catalog/connection tests and the existing data views. Desktop and
phone screenshots were inspected. Both site production builds passed. Do not reuse
pre-catalog timing results for this expanded interaction sequence.

Performance receipts are retained in `.local/connections/performance/`. The
2026-09-17T06:24:27.977Z run had no load errors or overflow, but exceeded the local
200 ms target in four of six samples (desktop maxima 216/248/208 ms; phone
168/216/184 ms). A preceding run timed out before measuring readiness; a subsequent
direct browser diagnostic loaded successfully without errors. The timeout cause
is not established. Paint isolation is a later change and is not measured by that
report. These are local software-WebGL measurements, not field-user guarantees.

The post-isolation production run at `2026-09-17T06:31:23.335Z` measured desktop
maxima 288/200/240 ms and phone 152/192/184 ms, with no load errors or overflow.
An instrumented repeat at `2026-09-17T06:32:30.082Z` measured 192/304/248 ms desktop
and 200/176/200 ms phone. **The strict below-200-ms gate is not passed.** Isolation
has not demonstrated a consistent improvement in these samples; further profiling
is required. The slow desktop topic click spent about 0.6 ms in its event handler
and 236 ms between handler completion and presentation. Phone opening took about
122–132 ms in event processing with 4x CPU throttling. These point to different
desktop rendering and phone mounting costs, not one proven common cause.

The instrumented failed navigation at `2026-09-17T06:30:41.635Z` captured the root
preview's actual 404 page immediately after a rebuild. The root build clears
generated assets while the preview is running; subsequent requests succeeded.
This establishes the response, not the exact watcher/cache cause. The measurement
script now fails immediately on a non-OK document, records load failures and page
state, and separates input delay, handler processing and presentation delay.
Failed reports remain archived and no measurement automatically retries a sample.
