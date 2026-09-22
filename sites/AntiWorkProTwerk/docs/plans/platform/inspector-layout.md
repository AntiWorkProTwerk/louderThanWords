# Inspector: stable controls and bounded placement

The map inspector now has a fixed header and action footer, with a separate
scrolling evidence body. Close is a 44-pixel target. Source notes, geographic
limits, background retries and the comparison-state explanation stay available
without pushing Close or Apply off the screen.

## Why the positioning changed

The earlier v5 production samples failed the strict interaction gate at early
inspector openings (200 ms vector, 208 ms WebGL). A separate paced CPU diagnostic
at 4× CPU slowdown reproduced a 224 ms first open, with about 147 ms of click
processing. The profile attributed 36.86 ms of sampled self time to bounding-box
reads under the floating-position update path; further sampled work involved its
size, overflow and placement calculations. Automation's separate bounding-box
checks accounted for 1.566 ms. This is diagnostic evidence with profiler overhead,
not a field percentile or a replacement for the full performance gate.

The inspector uses the installed component library's static-position popover,
retaining its nonmodal focus, Escape, outside-interaction and dismissal behavior.
Our small placement helper reads the toolbar anchor only when opening or resizing
the window. It chooses space above or below, clamps the width/edges, and uses a
viewport-bounded fallback when neither side has enough room. Source content no
longer drives a continuous popup-position measurement loop.

The 160 ms entrance animation remains, with reduced-motion support. Preview and
pointer-follow behavior are unchanged; within the inspector, only the explicit
Apply button selects a state. The scrolling body is a labeled keyboard-focusable
region; Shift+Tab from the initial selector reaches it, and native scroll keys
work without changing the preview. No cohort, statistic, data source, release or
geographic boundary changes.

The one scoped `a11y_no_noninteractive_tabindex` suppression is intentional:
this is a scroll region, not an interactive widget. Keeping `tabindex="0"`
lets keyboard users reach and scroll it without operating the state selector.
It has a region role, accessible name and visible focus outline, consistent with
[MDN's region guidance](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/region_role)
and the [W3C scrollable-content rule](https://www.w3.org/WAI/standards-guidelines/act/rules/0ssw9k/).
The browser regression uses real Shift+Tab and End key presses; it does not
substitute a scripted scroll for keyboard access. No other warning is suppressed.

## Verification checkpoint

All 204 code tests pass. Four new placement tests cover above/below anchoring,
short-screen fallback, edge anchors and invalid inputs. Svelte check reports zero
errors/warnings and both site production builds pass. Existing inspector, map
background/retry and comparison tests pass. Two new browser tests verify fixed
header/footer hit targets during body scrolling, 390→320-pixel resizing, reduced
motion, focus restoration and preserved peer/cohort values. An initial desktop
geometry assertion sampled the entrance animation; it now waits for that animation
to finish before checking the scroll invariant. Both tests then pass.

Desktop and short-phone screenshots were inspected. The diagnostic script is
`scripts/civic/inspector-profile.ts`; labeled, timestamped profiles are retained in
`.local/map-inspector/profile/`. Baseline: `2026-09-17T10:26:01.885Z-baseline.json`.
The full production sequence remains `state-patterns-v5-background`, including
pre- and post-background inspector interactions and the same strict gate. Full
browser and final performance evidence will be appended after the runs complete.

The second paced diagnostic (`2026-09-17T10:34:28.985Z-bounded-shell.json`) records
a 144 ms opening with about 80.9 ms of click processing, versus the baseline's
224 ms / 147.1 ms. The floating-update call chain is absent; a single placement
read remains. These are separate profiled runs, not a statistical speed guarantee.

An intermediate full WebGL/default-graphics batch (`10:36:09.401Z`) passes with
desktop maxima 56/32/48 ms and phone maxima 128/128/120 ms. That batch predates the
final keyboard-focusable region attribute, so final production measurements will
be retained separately. The final nine-test inspector/background browser run
includes actual Shift+Tab/End scrolling, fixed action hit targets, preview, retry,
renderer retention and reduced motion.

## Final production checkpoint — 2026-09-17

The full browser regression run completed with 98/98 passes on the final
keyboard-scroll implementation. The subsequent source-only change documents and
scopes the intentional scroll-region compiler exception; Svelte check then reports
zero errors and zero warnings, and both independent site builds pass. The preview
was verified against the rebuilt HTML and current entry assets before profiling.
After the documented compiler exception, both inspector layout browser tests
were rerun and pass, as does a fresh 204-test code suite. The earlier full 98-test
run is separate from this final two-test rerun; no runtime behavior changed between
them.

WebGL/default-graphics receipt `2026-09-17T10:52:10.867Z` passes the unchanged v5
gate: desktop maxima 48/40/48 ms; emulated-phone maxima 144/128/152 ms. All six
samples have no page errors, load errors or horizontal overflow. Phone evidence
readiness is 1.94–1.98 s, state DOM readiness 6.09–6.10 s, and surrounding geography
readiness 13.35–13.40 s. These readiness signals are not final-paint measurements.

Vector/default-graphics receipt `2026-09-17T10:53:06.047Z` also passes: desktop
maxima 80/40/40 ms; emulated-phone maxima 136/128/144 ms. All six samples have no
page errors, load errors or horizontal overflow. Phone evidence readiness is
1.97–2.26 s and state DOM readiness 4.04–4.13 s. Background readiness is null by
design because the lightweight renderer does not load surrounding-world geometry.

Phone samples use 4× CPU slowdown, 1.6 Mbps and 80 ms network latency on the same
desktop NVIDIA/D3D11 backend. These are laboratory samples, not field percentiles
or physical-phone results. Earlier failed receipts remain retained; this does not
resolve forced-software graphics performance or slow-network geography startup.
