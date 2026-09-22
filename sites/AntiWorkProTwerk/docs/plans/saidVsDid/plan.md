# Said / Did — local implementation on the current stack

This replaces the greenfield/service-first architecture in [research-reference.md](research-reference.md). The original research is preserved there; its provider endpoints, historical prices, estimates and proposed accuracy thresholds are not implementation guarantees.

## Product and editorial contract

Connect a recorded statement to an individual's legislative action. Keep **source fact**, **connection evidence**, and **interpretation** separate. No honesty ranking, inference of motive, or assumption that a bill match establishes a contradiction.

Use “Recorded statement” by default. Inserted material remains labeled. Verified floor wording requires media evidence. Never attribute third-party quotations or unresolved speakers to a member. Present, Not Voting, voice votes, procedure, combined passage motions, changed text, qualifications and uncertain chronology retain their distinct meanings.

The bundled corpus is fictional: four fictional members, three measures, nine speaker turns, eight actions and seven publishable examples. Demo review receipts are synthetic, not actual editorial approval. Real inputs require Bioguide identities, official source provenance and real review.

## Current stack, no new services

| Concern         | Implementation                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| UI / routing    | Existing SvelteKit 2, Svelte 5, TypeScript, static adapter                                                                                    |
| Map             | Existing persistent MapLibre instance, state selection, sample-coverage fill                                                                  |
| Presentation    | Shared typography/palette, custom CSS, Svelte transitions, reduced motion                                                                     |
| Data access     | Validated async repository, release-pinned files, TanStack Query freshness checks                                                             |
| Search          | Small approved metadata index, URL filters, bounded result pages                                                                              |
| Processing      | Node/TypeScript functions and CLI in `scripts/said-did/`                                                                                      |
| Private storage | Ignored `.local/said-did/` files; no database                                                                                                 |
| Review          | Loopback-only Vite workbench and immutable decision receipts                                                                                  |
| Publishing      | Validated immutable JSON releases; atomically replaced manifest                                                                               |
| AI execution    | Installed authenticated Codex CLI, `gpt-5.6-luna`, high reasoning; schema-constrained semantic proposals, grounded quotations, cached batches |
| Acquisition     | Bounded official GovInfo/House/Senate discovery and downloads, raw byte archives, chamber-specific parsers                                    |
| Evaluation      | Frozen corpus, bill/day grouped annotation sets, held-out metrics, Wilson intervals, human-review gates                                       |
| Performance     | Repeatable production-browser benchmarks and opt-in device-local diagnostics                                                                  |

No database, hosted task service, scheduler or new API key is required. Codex must already be installed and signed in. Files and orchestration stay local; **Luna inference sends eligible source passages to OpenAI through the existing Codex account and consumes its usage allowance**. It is not offline inference. Only explicit CLI commands or a consent-gated local workbench operation invoke the model. Public page requests never fetch government data or invoke AI. The existing account/subscription backend is not involved.

## Portable pipeline

```text
corpus.json + optional AI claims.json
  → validate identities, dates, rights, source facts and exact spans
  → archive source text, hashes and newline offset mappings
  → extract/import attributable claims
  → direct-reference, scoped-context or policy candidates
  → local review queue and two-pass decision receipts
  → approved snapshots and correction notices
  → immutable release → current manifest → SvelteKit views
```

`src/lib/said-did/schema.ts` is the executable contract. Input includes a declared scope, dated member terms, source documents, measure versions/provisions, attributable passage boundaries and individual actions. Measure identity includes Congress/type/number; vote uniqueness includes Congress/chamber/session/roll/person. Quotes use newline-only normalized text with original UTF-16 offset mappings in the archive. No spelling or wording cleanup is performed.

Adapters now produce this contract from official documents. `discover` reads GovInfo MODS and chamber vote indexes for a bounded 1–7-day, 1–10-measure scope. `collect` handles GovInfo Congressional Record HTML/text granules, legislative bill/resolution XML, House roll-call XML and Senate roll-call XML. It also accepts saved local source files through the CLI. Exact raw bytes, redirects, hashes and retrieval metadata are archived; `--offline` replays saved downloads. Size limits, official-host allowlists, redirect validation, soft-404 checks and bounded retries are enforced. XML external entities are never loaded.

Record parsing distinguishes margin-level speakers, officer/clerk boundaries, indented quotations, and inserted remarks. Speaker identity requires a unique dated alias; official MODS speaking metadata can supply Bioguide names and **event-day** membership evidence, not invented full term dates or districts. Senate LIS identifiers require a supplied dated Bioguide crosswalk. Unresolved identities, unsupported amendment targets or document formats produce explicit diagnostics/holds. PDFs are not silently OCR-guessed. Acquisition does not infer an operative text version from the latest bill file: source-backed `operativeBindings` establish it during review. Keep raw corpora and model output outside `public/` and Git.

The offline fallback extractor recognizes narrow explicit positions and keeps whole attributable turns; sentiment defaults to `not_assessed`. `extract` or `run --ai` actually invokes Luna high via Codex to propose type, stance, meaning, targets, qualifications and sentiment. Code, not the model, supplies complete saved quotations, IDs and offsets. Qualification alignment permits only unique whitespace-reflow matches; words, punctuation and negation cannot change. Quotes/references are validated before acceptance. The model cannot approve, publish or infer honesty. Sentiment alone is never voting intention.

Codex runs in an isolated temporary directory, read-only, with user/project configuration, shell execution, applications, browser tools, hooks and delegation disabled. Unexpected tool activity is rejected. Each batch has a timeout, bounded output and at most two validation-repair attempts. Raw attempts (including rejected results), token usage and completed validated batches are saved privately. Cache keys include the exact prompt, model and reasoning configuration. Replays reuse completed batches; errors never silently fall back to a different model. Set `SAID_DID_CODEX_EXECUTABLE` only if the CLI cannot be found automatically; point to its executable or installed `bin/codex.js`, not a shell command.

### Commands

From `sites/AntiWorkProTwerk`:

```sh
npm run said-did -- seed
npm run said-did -- contracts
npm run said-did -- discover --input docs/plans/saidVsDid/discovery-example.json --workspace .local/said-did/real-pilot
npm run said-did -- collect --input .local/said-did/real-pilot/acquisition/discovered-plan.json --workspace .local/said-did/real-pilot
npm run said-did -- collect --input .local/said-did/real-pilot/acquisition/discovered-plan.json --workspace .local/said-did/real-pilot --offline
npm run said-did -- run --input path/to/corpus.json --dry-run
npm run said-did -- run --input path/to/corpus.json
npm run said-did -- extract --input path/to/corpus.json
npm run said-did -- run --input path/to/corpus.json --ai
npm run said-did -- extract-request --input path/to/corpus.json
npm run said-did -- run --input path/to/corpus.json --extractions path/to/claims.json --extractor-version local-model-prompt-v1
npm run said-did -- review --review path/to/decision.json
npm run said-did -- publish
npm run said-did -- status
npm run said-did -- evaluate
npm run said-did -- annotate --input path/to/corpus.json
npm run said-did -- evaluate --input path/to/corpus.json --dataset path/to/annotations.json --extractions .local/said-did/model/claims.json
npm run said-did -- replay
npm run said-did -- rollback --release sd-previousreleaseid
```

Commands accept `--workspace path` and `--out path` for isolated experiments. Keep a real pilot's output isolated with `--out .local/said-did/real-pilot/public` until real editorial approval. `npx tsx scripts/said-did/cli.ts example` prints a complete example input. `contracts` exports corpus/acquisition/discovery/annotation schemas. `extract-request` and extraction-file import remain available for alternative providers. No model weights are bundled. `--ai` is explicit remote inference, not compatible with `--offline` or a dry run. `--batch-size 1` through `8` controls model request size (default 4).

`prepare`, `addReview` and `publish` are reusable async functions. A future Trigger.dev task can call these stages with appropriate storage adapters without changing the public contracts. Acquisition, model calls and their costs stay outside visitor requests.

### Replay, corrections and recovery

- Hashes plus parser/extractor versions identify runs; identical runs do not duplicate records, reviews or publications.
- Archive writes precede completed checkpoints. Validation failure leaves the last valid publication available; CLI failures retain a replay record.
- A workspace lock prevents overlapping writes. After a crash, verify no process is active before removing a stale `pipeline.lock`.
- Approvals bind to candidate fingerprints. Changed evidence or extraction requires review again.
- `run` publishes only previously approved current versions. Invalidated prior findings become correction notices; they are not silently retained as current assessments.
- Immutable outputs are validated before the manifest moves. Archived versions remain inspectable.
- Rollback must not revive withdrawn or stale assertions. Back up the entire ignored workspace and public releases; source versions and decision receipts remain reproducible without the upstream provider.

## Review desk

For current development, start with the **AI checking AI** panel rather than the
annotation worksheet. A fresh Luna/high pass audits the extraction and candidate
comparisons, including abstentions, with exact-source citations and preserved
evidence blockers. This is local, private `agent_draft` output—not human ground
truth, measured accuracy or publication approval. See [AI review workflow](ai-review.md)
for the CLI, cache/report contracts, safeguards and live preview. Human annotation
is not required to continue development; its independent accuracy gate is retained
for later validation.

Visit `/said-vs-did/review/` on the local Vite server. Upload a corpus, select a candidate and inspect its whole passage, original text, action question and operative provisions. Check identity, quotation, action and text in a facts pass. Record a later context pass addressing chronology, conditions and contrary evidence. Enter the explanation, limitations and rationale; approve, reject, request evidence or withdraw; publish the approved batch.

The expandable **Collection, Luna extraction & quality checks** panel collects official URLs from an acquisition plan, runs consent-gated Luna extraction, and exports usage/collection reports. It also creates, edits/imports, exports and evaluates annotation sets. Annotation revisions are recoverable files. Imported corpus changes invalidate old approvals. Model results cannot overwrite a working corpus that changed while inference was running. Browser requests cannot use arbitrary local file paths; use the CLI for those imports.

Unresolved identity, unsupported quotes, missing operative text, vague aspirations and action-before-statement candidates cannot be approved. Qualified, procedural, absence and same-day-unknown cases remain context-dependent in v1. A single reviewer doing two passes is labeled as such, not independent review. Quote changes require adjusting the supplied turn and rerunning; no unsafe clipping shortcut is offered.

The endpoint exists only in Vite development middleware. It checks loopback hostname, request origin and a per-server token; limits input size; and returns no-store responses. No private queue or filesystem writer is deployed in the production Worker. This local boundary is not a replacement for authentication if review is later hosted.

## Public views and map integration

1. **Explore:** search person, measure, policy or phrase; filter state, chamber, action date/type, assessment and strictly earlier statement date. Show sample coverage, publication freshness and meaningful no-match states.
2. **Member:** chronological comparison feed, representation at event time and corpus limitations.
3. **Measure/policy:** precise proposition, operative versions and linked comparisons.
4. **Comparison:** statement/action columns on desktop, stacked on phones; visible qualifications; connection explanation; chronological context; expandable sources and provenance; version history; copying with dates and limitations; correction-request download.
5. **Methodology:** explain the evidence layers, exclusions, coverage counts and freshness.

The real map remains mounted across these routes. State selection filters the ledger; comparison/member pages select their state. Blue fill means sample coverage, never a politician score. State pickers and links remain usable without WebGL. The map does not delay initial evidence rendering. Mobile keeps a visible map and scrollable evidence sheet.

Public comparison/member/measure pages have prerendered useful HTML, canonical URLs, descriptions and social metadata. Rebuild after adding public routes; JSON consumers can read new releases immediately. Archived revisions are labeled separately from current findings. Correction downloads are local files, **not submissions to a service**.

## Verification and honest acceptance boundaries

Run `npm test`, `npm run check`, and `npm run test:browser` in the site; run root `npm run check` to build both present teammates' sites.

Regression coverage includes exact spans, newline mapping, fabricated model output, ambiguous/third-party speakers, duplicate votes, floor-media requirements, procedure, conditions, absence, chronology, missing text, no match, replay, stale reviews, correction publication, rollback, private-data exclusion and review endpoint isolation. Browser checks cover persistent maps, URL filters, sources, member/measure navigation, phone stacking and correction downloads.

The nine authored examples are synthetic regression tests, not held-out accuracy evidence. The implemented evaluator includes all passages (including abstentions), joins shared bills/debate dates into indivisible groups, detects split leakage/stale source hashes, and checks speaker/quote boundaries, stance, targets, conditions, qualifiers, sentiment, retrieval, chronology, action type and acceptable interpretations. It reports error categories, recall, precision, sample size and 95% Wilson intervals. Only `human_reviewed` held-out annotations count toward acceptance; agent drafts and pending labels do not. Unannotated predictions prevent acceptance. `evaluate --dataset ...` exits 2 if gates are unmet. The approximately 200-human-case and ≥95% exact-reference precision gates are executable, but not claims established by demo tests or model self-grading.

Run the production benchmark after `npm run check` from the root and starting a local production preview:

```sh
npm run said-did:performance -- --url http://127.0.0.1:8788/AntiWorkProTwerk/said-vs-did/ --runs 3 --enforce
```

It records desktop and throttled mobile LCP, Event Timing INP estimates, click-to-cached-comparison navigation, gzip sizes of requested application scripts (separately identifies optional map chunks), frame-time diagnostics, map count and overflow. It emits a JSON report in `.local/said-did/performance/`; `--enforce` fails unmet lab budgets. One initial desktop sample exceeded 200ms; repeated measurements and their sample sizes are retained in the verification notes, not hidden as a guarantee.

For a real device, open `/said-vs-did/?diagnostics=1`, enter the device/network description, interact with the application, and download the session metrics. The panel persists through comparison navigation. No telemetry endpoint, cookies or beacons are used. This local session collector is not a field-p75 certification, and headless software-rendered frame samples do not certify physical 60fps. Human-reviewed ground truth and physical-device/real-user measurements remain external evidence requirements, not functionality an agent can honestly manufacture.

## Later adapters, not present setup requirements

Authenticated hosted review; full-corpus search; database/R2 storage; scheduled Trigger.dev jobs; field monitoring; accounts, alerts and subscriptions. Additional provider-specific formats (such as OCR-only historical PDFs or unresolved amendment-text packages) must receive explicit adapters and source-level fixtures, never silent guesses. The current functions remain reusable from a later task runner. None of these hosted services is required for the local pipeline.

## Implementation references

- [Codex non-interactive execution and structured outputs](https://developers.openai.com/codex/noninteractive), [Codex configuration](https://developers.openai.com/codex/config-reference), [Luna model](https://developers.openai.com/api/docs/models/gpt-5.6-luna).
- [GovInfo Congressional Record](https://www.govinfo.gov/help/crec), [GovInfo metadata URL conventions](https://www.govinfo.gov/about), [House XML documents](https://xml.house.gov/), [Senate roll-call XML example](https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00001.xml).
- [Event Timing/INP measurement and limits](https://web.dev/articles/inp), [Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds).
