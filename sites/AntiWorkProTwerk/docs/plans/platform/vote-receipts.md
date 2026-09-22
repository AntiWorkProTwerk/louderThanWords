# Vote Receipts: local job and public explorer

Route: `/records/votes/` under the existing AntiWorkProTwerk base path. Development: `http://127.0.0.1:5173/records/votes/`.

Run from `sites/AntiWorkProTwerk`:

```powershell
# Current expanded collection: full House roll-call rosters and certified passage text.
npm run civic -- votes --plan docs/plans/platform/votes-house-expanded.json --workspace .local/votes-expanded

# Replay this collection without requesting source documents again.
npm run civic -- votes --plan docs/plans/platform/votes-house-expanded.json --workspace .local/votes-expanded --offline

# Fetch a bounded, checked-in official-source recipe. No API key or database.
npm run civic -- votes --plan docs/plans/platform/votes-pilot.json

# Reprocess the archived acquisition without network access.
npm run civic -- votes --plan docs/plans/platform/votes-pilot.json --offline

# Or supply any corpus conforming to src/lib/said-did/schema.ts.
npm run civic -- votes --input .local/said-did/real-pilot/acquisition/corpus.json

# Isolate a remote-job artifact or experiment from the site's current release.
npm run civic -- votes --input path/to/corpus.json --output .local/job-output/votes
```

`--plan` accepts the existing acquisition contract: scoped House/Senate documents, dated identities (including Senate LIS crosswalks), legislative text and explicit operative-text bindings. The collector bounds document count/size, validates official hosts, archives raw bytes, and supports offline replay. Its current roster and supported-question limits remain explicit exclusions, not imaginary missing votes. Acquisition is separate from deterministic transformation. `publishVoteReceipts(input, output)` is the portable job entry point; a future remote scheduler only needs to supply input and persist its output directory.

Public output is `public/data/votes/manifest.json` plus `releases/vr-<content hash>/data.json`. Publication is locked, content-addressed, and pointer-last. Invalid input does not replace the pointer. Every release carries scope, exclusions, original source URLs/times/provenance, exact questions and raw choices, measures/text versions, member terms, state receipt counts and evidence connections. Do not serve `.local` as public files. No model prompts, private reviews or credentials are part of the projection.

The original `votes-pilot.json` recipe still reproduces the limited 12-member H.R. 29 pilot with unresolved text. The current public collection instead uses `votes-house-expanded.json`: 868 individual records from House roll calls 3 and 6 in January 2025, covering all 50 states. It is not all Congress, current activity, or a score. A search match in an available contextual version is not proof of a vote on that specific provision.

### Full-row acquisition and certified text

`houseRoster: "roll_call"` opts into all individual House XML rows. The collector requires valid unique Bioguide IDs and exact agreement with all four official choice totals; missing or malformed totals fail acquisition. It records state/party only for the observed date, preserving a supplied longer dated term only when it agrees. Source surname/display labels are not expanded by guessing. These vote-derived aliases are **not** supplied to the speech-attribution parser. Senate acquisition still requires its explicit LIS/Bioguide crosswalk.

`operativeBindings[].basis: "engrossed_house_passage"` requires the same measure, successful `On Passage` question, an actual House-engrossed bill XML stage, and exact dated House attestation in that version's source. A failed vote, procedural vote, different date, unrelated source or introduced version cannot satisfy this binding. GovInfo describes EH as the certified House-passed copy, including floor changes. [GovInfo version definitions](https://www.govinfo.gov/help/bills). This does not claim the version is the later Senate-passed or enacted text.

For H.R. 29, the [House roll call](https://clerk.house.gov/Votes/20256) and [EH source](https://www.govinfo.gov/app/details/BILLS-119hr29eh) agree on January 7, 2025. All 434 receipts—including 11 non-votes—retain the question's text binding; a non-vote never becomes support or opposition. H.Res. 5 roll call 3 remains a procedural decision with unresolved exact motion text. Its available later engrossed resolution is context only; the introduced XML was unavailable and is not fabricated.

Connections use source action IDs, Bioguide-backed person IDs, canonical Congress/measure IDs and original passage IDs. Statements link through explicit measure references or verified debate context, within the member's dated term; linkage is not a judgment of agreement or a claim that the statement preceded the vote. Only uniquely attributed records are included. AI-generated interpretations are not published by this pipeline. The separate Said / Did ledger remains explicitly demo until its real evidence gates are met.

The map reuses the existing MapLibre instance. Dots count records grouped by represented state, not vote location or ideology. Search/state/type/member/measure/receipt filters are URL-addressable. Mobile uses the existing expandable evidence sheet. Animations respect reduced-motion settings. There are accessible state controls and a non-WebGL geographic fallback.

Verification: `npx tsx --test tests/civic-votes.test.ts`, `npm run check`, `npx playwright test tests/browser/vote-receipts.spec.ts`, and the site production build. See `progress.md` for remaining #1 work and the full 40-product scope; this first slice is not completion of the entire plan.

## Verified 2026-09-16

- Full code suite: 39 passing tests, including six new receipt-pipeline tests. Invalid source facts cannot replace the current pointer; source rights and dated identity gates hold; checksum mismatches and unsafe release paths are rejected.
- Svelte check: zero errors and zero warnings.
- Full browser suite: 13 passing tests, including desktop/phone Vote Receipts, shareable filters, source text, empty-state behavior and persistent map identity. Reduced-motion phone screenshot inspected; shared mobile navigation adjusted to keep the account control within the viewport.
- Root production build: both independent sites succeeded. The built `/AntiWorkProTwerk/records/votes/index.html` contains actual receipts, the real-pilot label, and base-aware data links—not an error placeholder.
- Public release: `vr-47029b0f1d6d813daae81310`; 12 receipts, 11 states, seven explicitly connected statements. Payload 235,814 bytes uncompressed / 35,932 bytes gzip. This is payload size, not a claim about page-load performance at future corpus scale.
- Fresh recipe acquisition and subsequent offline replay in `.local/votes` both produced `vr-705ae4088daa789c0b278509`. It differs from the public release because the earlier archived corpus has different fetch provenance. The offline run required no new service or credentials.

### Expanded collection, 2026-09-16

Branch recheck before continuation: fetched origin, all six remote tips unchanged; no open PRs or visible competing Vote Receipts work. Public snapshot now `vr-30816fde6d016a0152cfda41`: 868 receipts, 50 states, two measures, seven direct recorded-statement connections. The fresh acquisition and offline replay returned the same hash. Parser version is now `official-documents-v2` so altered acquisition behavior is recorded in provenance. Full code suite passes 42 tests, including new roster-total/identity/certification/replay tests. Legislative search indexes each measure once rather than duplicating full-text searches for every member; lists render 30 records at a time with a load-more control, without dropping later matches.

Still outstanding for #1: amendment targets and supported amendment text, exact procedural motion text, broader multi-chamber acquisition, and larger-scale performance validation. Existing parser unit tests alone do not prove comprehensive live acquisition. Older public releases are preserved; the earlier verification above describes their historical state, not the current coverage.

Expanded-release verification: all 42 code tests and all 14 browser tests pass, including real procedural-vote warnings, certified passage text, pagination, preserved map identity and phone layout. Both sites pass the root production build. Current payload is 2,141,201 bytes raw / 124,646 bytes gzip. A 200-query local Node benchmark (detention, member name, procedural question and unmatched term) measured search p95 0.24 ms; the maximum including first-index construction was 11.32 ms. These are local search costs, not mobile-network or end-to-end performance guarantees.

Visual follow-up at full coverage: national-view circles now scale with zoom and stay small; count labels appear on selection or closer zoom, with exact totals retained in tooltips. This avoids overlapping 50-state bubbles. The three receipt browser tests and Svelte check passed again after this adjustment. Measure headings omit a source version prefix (such as IH) so a receipt bound to EH is not misleadingly titled as an introduced-version vote; exact version IDs remain in the evidence details and JSON.
