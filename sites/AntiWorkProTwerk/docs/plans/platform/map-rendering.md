# Map rendering and loading feedback

## Diagnosis, not a speculative visual rewrite

The previous software-graphics timing failures remain valid stress-test receipts.
They are not representative measurements of every browser. The original harness
forces `--use-angle=swiftshader` even when displaying the SVG map.

`npx tsx scripts/civic/map-render-profile.ts --trace` now retains a paced,
single-desktop diagnostic and optional Chromium trace under
`.local/patterns/render-profile/`. These traces have overhead and are not timing
gates. Inclusive trace durations overlap and must not be summed across categories.

The baseline trace at `2026-09-17T08:48:10.227Z` had about 3,146 ms across 29
`NativeViewGLSurfaceEGL:RealSwapBuffers` events (maximum 311 ms), compared with
39 ms total Paint and 16 ms total Layout. The worst event handlers took about
17 ms. This directed the investigation toward frame presentation, not a rewrite
of the correlation calculations.

Browser-only experiments cover layer promotion, opacity, labels, animation,
borders, combined border paths and a cached-image representation. Most did not
resolve the delay. The combined-border experiment was slower. Hiding the map or
its borders reduced some timings but is not a suitable product solution. None of
these experimental styles or reduced map features were shipped. One initial
image probe failed because tsx's function-name helper was absent from the browser
context; the diagnostic harness now supplies that helper, and the subsequent
probe completed without page errors.

`--default-graphics` leaves the browser's graphics selection unchanged. The same
unmodified map had diagnostic interaction maxima of 16/24/16/24/104 ms in the
`08:53:24.211Z` trace. This is evidence that the forced graphics backend materially
affects this laboratory workload, not proof that all slow devices are fast.

## Separate production profiles

The regular six-sample harness now records graphics configuration and Chromium's
reported renderer/compositing/rasterization state. Commands:

```
npx tsx scripts/civic/patterns-performance.ts
npx tsx scripts/civic/patterns-performance.ts --vector
npx tsx scripts/civic/patterns-performance.ts --default-graphics
npx tsx scripts/civic/patterns-performance.ts --vector --default-graphics
```

The original commands still exercise forced software graphics. Default-graphics
receipts have separate `latest-*-default-graphics.json` files, preserving the
software receipts. The action sequence, six samples, CPU/network throttling,
error checks and strict below-200-ms interaction threshold are unchanged.

Pre-loading-card checkpoint, 2026-09-17 UTC:

| Receipt | Renderer | Desktop maxima (ms) | Throttled-phone maxima (ms) |
| --- | --- | --- | --- |
| `08:54:39.266Z` | Vector, default graphics | 64 / 40 / 40 | 176 / 168 / 176 |
| `08:55:44.613Z` | WebGL, default graphics | 80 / 32 / 32 | 184 / 168 / 176 |

Both passed their own six-sample gates without page/load errors or overflow. The
backend was hardware NVIDIA/D3D11, with compositing and rasterization enabled.
The emulated phone still uses that desktop GPU: this is **not physical-phone
performance**, a field percentile or a replacement for the failing software stress
profile. Phone map DOM readiness remained about 3.95 s vector versus 13 s WebGL,
while evidence controls were ready around 2 s. Readiness is not final paint.

## Visible loading feedback

The live map now distinguishes starting graphics from loading boundaries, explains
that records load separately, and offers an explicit **Switch to lightweight map**
action. This saves the existing device preference, preserves data filters/cohort
and moves focus to the persistent renderer control. There is no fake percentage,
invented map, automatic change of records or blocking modal. The loading indicator
respects reduced motion and fits between the title and toolbar on a short phone.

Nineteen targeted map/inspector/layout/representatives tests passed, including
focus restoration. The two loading tests passed again after strengthening the
slow-geography test to change the comparison year while loading and preserve
that choice when switching renderers. Svelte check reports zero errors/warnings.
The loading-card screenshot was inspected at 320×568. The previous full 85-test
suite predates this card; this is a scoped regression, not a new full-suite claim.
Both site production builds pass. The preview temporarily returned 404 after the
build; a separate health check confirmed HTTP 200 and the new loading-card HTML
before the final timing batches began. No failing batch was silently retried.

Final vector/default-graphics receipt `2026-09-17T09:02:39.084Z` completed all six
samples without page/load errors or overflow. Desktop maxima were 80/40/40 ms;
phone maxima were 200/184/168 ms. It **fails** the strict below-200-ms gate because
the first phone inspector-opening interaction reached 200 ms (about 186 ms
presentation delay). Earlier passing batches are retained, not substituted for
this result. Phone vector-map DOM readiness was 3.88–4.00 s. Normal-graphics
consistency, software-graphics stress and map-loading latency remain distinct open
performance concerns.

Final WebGL/default-graphics receipt `2026-09-17T09:03:52.530Z` passed its six-sample
gate: desktop maxima 72/32/40 ms, phone 184/176/176 ms, no page/load errors or
overflow. Phone map DOM readiness was still 13.05–13.10 s. This passing interactive
profile does not close the separate vector borderline result, software-backend
stress failures or physical-device verification.
