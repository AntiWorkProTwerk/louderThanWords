# Where Are the Trial Results? — requirement 40

Live development route: `http://127.0.0.1:5173/records/trials/`. Production path comes from the shared site registry, not a hard-coded username.

This product compares completed registry records with and without posted registry results, groups the records by reported sponsor name or topic, preserves first-results-posted dates, and records later observed changes. It does not judge treatment efficacy, reporting-law compliance, concealment, or whether research exists outside the registry.

## Local acquisition, replay and remote-job boundary

Run in `sites/AntiWorkProTwerk`:

```powershell
# Query the official API, refresh tracked studies, then publish a snapshot.
npm run civic -- trials --plan docs/plans/platform/trials-asthma.json

# Reprocess the last saved acquisition without network access.
npm run civic -- trials --plan docs/plans/platform/trials-asthma.json --offline

# Supply a previously captured input envelope instead of making API requests.
npm run civic -- trials --input .local/trials/acquisition.json

# Isolate an experiment or job's output.
npm run civic -- trials --plan docs/plans/platform/trials-asthma.json --workspace .local/trials-job --output .local/trials-job/public
```

No account, API key, database, model or external scheduler is required. `runTrials` in `scripts/civic/trials.ts` is the portable job entry point. A later scheduler can call it with a filesystem/artifact directory; clients consume the same static JSON output. AI is unnecessary for these structured status fields.

The checked-in recipe selects asthma, listed United States sites and completed status, sorted by registry update date. Two pages of 25 records establish the first bounded collection. `pageSize` (1–100), `maxPages` (1–10), and `maxTracked` (1–2,000) are explicit limits. Change the condition/collection ID and use separate output/workspace directories for another cohort. Increasing discovery bounds on the same cohort retains its history. The sample is not representative or a complete query result.

Every subsequent online run refreshes previous study IDs that moved out of the bounded discovery results, using the registry's ID filter. If a tracked record cannot be refreshed, publication fails rather than interpreting absence as removal or losing its history. Hitting `maxTracked` fails explicitly; it does not silently evict old studies. Source pages are archived privately under `.local/trials/raw/`; `acquisition.json` stores the input envelope and per-record hashes. Offline replay verifies those record hashes and the plan identity. Per-page HTTP errors, repeated page tokens, duplicate IDs, oversized responses, unsafe source URLs and inconsistent timestamps fail closed.

The API is ClinicalTrials.gov v2, documented by [NLM](https://www.nlm.nih.gov/pubs/techbull/ma24/ma24_clinicaltrials_api.html) and the [registry API documentation](https://clinicaltrials.gov/data-api/api). Actual requests use `query.cond`, `query.locn`, `filter.overallStatus`, `sort`, pagination, and `filter.ids` for retained records. No private contacts, participant information, or raw descriptive text are projected into the public artifact.

## Output contract and history

`public/data/trials/manifest.json` points to `releases/tr-<hash>/data.json`. The writer uses immutable payloads and an atomic manifest replacement. An optimistic predecessor check prevents a slower concurrent job from overwriting a newer publication. The browser validates both schema and content hash, and pins payload loading to the manifest's release.

Public fields include NCT IDs, source display titles, reported sponsors, conditions, registry MeSH identifiers, dates with original precision/type, explicit results flags, listed U.S. locations, registry-supplied PubMed references and source hashes/observation times. A missing boolean is `unknown`, never `false`. Month/year dates are not padded to invented days; no deadline or overdue calculation is made.

History rules:

- Results already posted at first observation establish a baseline, not a newly detected event.
- A later explicit `false → true` results flag produces a `results_appeared` event between the two **record observation times**. This interval is separate from the registry's first-results-posted date.
- `true → false` records the changed flag without inferring why. Registry status changes also remain visible, including a study that is no longer marked completed.
- An unchanged offline replay produces the same data release and does not duplicate events. An older/conflicting observation cannot replace a newer one.

Keep the previous public snapshot when running future jobs; it is the history baseline. A fresh empty output directory starts new tracking, not a reconstruction of unobserved history.

## UI and connections

The explorer shares typography, navigation, map instance and responsive evidence sheet with Vote Receipts and Said / Did. Search/state/results/sponsor/topic/view/study selections are URL-addressable. Study and group lists progressively render bounded batches. Sponsor/topic groups are alphabetical, not compliance rankings; topic groups overlap.

State map counts deduplicate a study within each state, but a multi-state study contributes to several states. Selected-study points use available registry coordinates, which can be city-level approximations. Optional lines connect sites listed for that study; they are not participant movements or travel routes. A location list is available without interacting with WebGL. Animations respect reduced motion.

Sponsor keys identify exact reported names, **not verified legal entities**. NCT, MeSH and PubMed IDs provide explicit future connection points to the research-funding feature (#35). Publication reference types remain visible, so a background citation is not mislabeled as a results paper. Switching to legislative records shares geography only and makes no causal or political link.

## Verification and current source scope

Initial release `tr-394844e013c8fa2e9d4031d3` observed on 2026-09-16: 50 completed studies, 21 results-posted, 29 not-posted, zero unknown, 830 listed U.S. locations across 47 states. The API reported 1,324 matching records; the configured discovery limit is disclosed. This first snapshot has zero observed-change events. Payload: 173,920 bytes raw / 27,367 bytes gzip. Offline replay reproduced the release hash.

`tests/civic-trials.test.ts` covers date precision, missing flags, state deduplication, invalid coordinates, preserved identifiers/reference types, baseline versus subsequent arrivals, status transitions, replay, corrupt/stale/duplicate/incomplete inputs, retained-ID refresh, safe URLs, hash-validated reading and publication concurrency. Browser tests exercise sponsor/topic groups, filters, sources, site connections on the persistent map, shareable URLs, phone layout, reduced motion, baseline messaging and empty states. A missing accessible select label found by the phone test was corrected in the UI.

This implements the requested behavior for configurable bounded collections. It does not claim all clinical trials are collected, nor that a future real-world results event has already occurred in this baseline. Keep larger-scale performance and multi-collection navigation within the overall platform follow-up work, without treating those as evidence that the other 39 products are complete.

September 16 follow-up: desktop and phone screenshots were inspected; the selected-site connection diagnostic now counts actual line features (coincident coordinates do not create lines). The full browser suite passed (18 tests after the rulebook addition), the site unit/integration suite passed 53 tests, Svelte check had zero errors/warnings, and the root production build completed both independent sites.
