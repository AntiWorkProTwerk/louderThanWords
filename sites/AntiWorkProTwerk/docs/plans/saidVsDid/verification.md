# Local pipeline verification — September 15, 2026

## Implemented and exercised

- 27 automated code/integration tests pass. They cover raw parsing, source restrictions, exact grounding, model output rejection/repair/cache, evaluation leakage, private endpoints, publication corrections and existing site behavior.
- 10 browser tests pass, including the existing explorer, map persistence, phone layout, new inference consent, local review and diagnostic downloads. An earlier cold-development run timed out during map startup; the complete rerun passed. A whitespace-sensitive new test assertion was corrected.
- Svelte reports zero errors and warnings. The root build passes for both existing sites. The lockfile still includes native build dependencies for every declared platform; coworker site directories were not changed.
- Real Luna-high execution completed through the installed Codex CLI, not a mocked response or a request-file export. The final adapter supplies exact source quotes in code and accepts schema-validated semantic proposals. Initial model errors were rejected; bounded repairs and usage are retained privately.
- Official-source discovery and collection ran against the example House scope. Five documents yielded 41 marker-bounded turns, 12 scoped individual votes and one measure. Forty turns were eligible for extraction; Luna returned 30 validated claims. All 30 candidates remain held for evidence/review. **No real-person comparison was auto-approved or published.**
- Collection replayed from offline byte archives. All ten final-model batches were reused without new inference, and pipeline replay returned `reused: true`.

## Production browser benchmark

Latest command: `npm run said-did:performance -- --runs 3 --enforce` against the local production preview. Exit status 0.

| Metric | Desktop p75 (3 runs) | Emulated mobile p75 (3 runs) | Lab budget |
| --- | ---: | ---: | ---: |
| LCP | 516 ms | 1,280 ms | <2,500 ms |
| Event Timing INP estimate | 184 ms | 112 ms | <200 ms |
| Cached comparison navigation | 12.8 ms | 43.2 ms | <200 ms |
| Initial requested app JavaScript, gzip | 114,619 bytes | 114,619 bytes | ≤200,000 bytes |

Optional MapLibre/worker JavaScript is identified separately and excluded from the initial-application budget. The initial application is not the entire map-inclusive payload. The mobile profile uses 4× CPU throttling, 1.6 Mbps download, 80 ms latency and a 390×844 viewport. Chromium uses software WebGL. One earlier single desktop sample measured 264 ms interaction latency; a subsequent three-run benchmark and the final three-run benchmark passed. These are small lab samples, not universal guarantees. Raw final samples and frame diagnostics are retained in ignored `.local/said-did/performance/`.

## Evidence still required for acceptance

- The real pilot's 41-case annotation set is prepared but has **zero human-reviewed labels**. The evaluator correctly reports `pending_human_evaluation`, null precision/recall, and unmet human-label gates. The roughly 200-case target and ≥95% held-out exact-reference precision are **not established**. Expand to independent bills/debate days before using this one-day pilot as a held-out benchmark.
- Physical-phone and field measurements are not supplied by desktop emulation. The opt-in `/said-vs-did/?diagnostics=1` panel exports local device-session measurements, but no physical-device or field-p75/60fps certification is claimed.
- Current acquisition coverage is documented in `plan.md`. Unsupported document formats and amendment targets are held explicitly; this is not a claim to parse every historical government format.

## Local artifacts

### AI second-pass development preview

Implemented `review-ai` and the local workbench's **AI checking AI** panel. It uses
Luna/high through the existing read-only Codex runner, has exact-evidence validation,
cached batches and immutable receipts, and never edits human labels or publication
approvals. Partial validated batches are visible with an explicit incomplete label;
the workbench polls for updates every 15 seconds.

Verification for this addition: 33 code tests passed; all 11 browser tests passed
on the final full run; Svelte reported zero errors/warnings; the root build passed
for both present sites. The initial browser run had a cold-start map timeout and
a whitespace-sensitive assertion in the new test; the assertion was fixed, the
targeted rerun passed, and the full rerun passed. No map implementation was changed.

The real audit is a running experiment, not an accuracy claim. Its first prompt
overcounted procedural remarks as missed claims and was replaced with the explicit
position-only v2 rubric. Original receipts remain archived. A later request hit
the three-minute limit; the request limit is now five minutes and completed
batches are reused. At the latest checkpoint, 18 of 41 real passages had validated
AI reviews (15 extraction agreements, 3 disputes), with the remainder still being
processed. Read the live report/cache for current counts rather than treating
this checkpoint as completion. These agreements are **not human ground truth**.

All new code and data changes are local, uncommitted and unpushed. The fictional
working queue still has nine candidates; the pilot audit is isolated.

All paths below are relative to this site and ignored by Git:

- `.local/said-did/real-pilot/acquisition/`: discovered plan, exact raw archives, normalized corpus and diagnostics.
- `.local/said-did/real-pilot/model/`: validated claims, per-attempt records, cache and usage report.
- `.local/said-did/real-pilot/evaluation/eval-9c2d5539b62f14e9.json`: annotation template for the final corpus; `report.json` records the pending acceptance result.
- `.local/said-did/real-pilot/public/`: isolated pilot output, with no approved comparisons.
- `.local/said-did/performance/`: latest and immutable benchmark reports.

The live public-facing demo remains fictional. No credentials were copied into the repo, no database/task service was deployed, and no changes were committed or pushed in this task.
