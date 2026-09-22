# Research Funding — product 35

Open `http://127.0.0.1:5173/records/research/` while the development server is running.
The production route uses the existing registered site's base path. No database,
task service, credentials, model calls or account setup is required.

## What to do in the browser

1. Start with **Institutions**. The two bars and their printed dollar amounts compare
   fiscal years within the displayed query. Change **Compare from** or **Selected
   fiscal year** to change the endpoints.
2. Select an institution to see its application records. **Topics** uses the NIH's
   own spending-category labels; the categories overlap and cannot be added.
3. Open a project for its reported amount, budget period, original description,
   source link and other collected applications with the same core-project number.
4. Expand publication identifiers to open the actual PubMed records. Where a
   publication ID also appears in Trial Results, follow the connection. The trial
   detail's publication section links back to the NIH funding records.
5. Select a state on the persistent map or in its selector. Counts mean application
   records at funded organizations in the selected fiscal year. Points mean reported
   organization locations. Opening a project maps that core's collected applications
   across years; optional lines connect their locations, not money transfers.

Filters and project selection survive reload through URL parameters. The map is
not recreated when moving between records products. Mobile uses the existing
expandable evidence sheet; all records are available without interacting with WebGL.
Detail entrances and bar transitions respect reduced motion. Lists render 24 entries
at a time. No perpetual animation loop or browser-side government/AI calls were added.

## Real source and sample

Source: [NIH RePORTER API](https://api.reporter.nih.gov/), POST
`https://api.reporter.nih.gov/v2/projects/search` and
`https://api.reporter.nih.gov/v2/publications/search`.
The older `/v1/publications/search` returned `UnsupportedApiVersion` during the
2026-09-16 source probe; the working implementation uses v2 for both endpoints.

The checked-in recipe `research-nih.json` selects FY2023 and FY2024, U.S.
organizations, NHLBI-administered NIH projects, and all search terms `childhood
asthma` in the project title. This is a complete result for that query in each year,
not a complete NIH or institutional funding census. Completeness refers to the
API's returned query total, not independent certification of its reporting coverage.

Observed 2026-09-16, release `rf-56672d93c7f0946dd9adc2fc`:

| Measure                                | Captured result                  |
| -------------------------------------- | -------------------------------- |
| FY2023 applications / nominal amounts  | 12 / $3,930,867                  |
| FY2024 applications / nominal amounts  | 13 / $6,039,292                  |
| Institutions / core projects           | 8 / 14                           |
| Organization states                    | IL, IN, MA, NC, PA, TN           |
| Source spending-category labels        | 53 overlapping labels            |
| Core-project–PMID links / unique PMIDs | 203 / 196                        |
| Source response pages                  | 16                               |
| Public snapshot                        | 115,275 bytes; 32,357 gzip bytes |

Six of the grant–PMID edges share a PMID with the existing trial snapshot. The
relationship is an exact shared reference, not a semantic or name-similarity guess.
Reference types such as `BACKGROUND` and `RESULT` are preserved and displayed.
The NIH publication endpoint supplies the PMID, core project and latest application
ID—not paper titles, publication dates, or proof of fiscal-year attribution. We
link to PubMed rather than invent those missing details. Links can disappear or
appear as either product's independently versioned snapshot updates.

## Local and future-job pipeline

Run these commands from `sites/AntiWorkProTwerk`:

```powershell
# Fetch official records, archive raw responses, validate, publish immutable output.
npm run civic -- research --plan docs/plans/platform/research-nih.json

# Replay the acquired source snapshot without any external request.
npm run civic -- research --plan docs/plans/platform/research-nih.json --offline

# A different collector can provide the same validated, source-bound input contract.
npm run civic -- research --input .local/research/input.json --workspace .local/research-import --output .local/research-import/public
```

`--workspace` and `--output` are configurable. Recipes require 2–5 distinct fiscal
years, a title query, an institute and collection bounds. For a different query or
year set, use separate workspace/output directories; an existing collection cannot
silently change meaning. A new capture of the same recipe updates that collection.
The first collection is a historical comparison, not a scheduled live feed.

`scripts/civic/research.ts` exports `runResearch()` and the pure `buildResearch()`;
the CLI is only an adapter. A future remote job can call those functions with a
recipe or already-acquired input and publish the generated files. No orchestration
service is baked into the data logic. `src/lib/civic/research.ts` exports the Zod
output contract, filters, totals, grouping and exact-PMID cross-product joins.

Acquisition spaces requests at least 1.1 seconds apart, has bounded retries,
30-second request timeouts, response-size limits, fixed official endpoints and
redirect rejection. It honors Retry-After for retry pacing. NIH recommends no more
than one request per second and off-hours/weekends for large jobs. Do not turn the
small recipe into a large daytime harvest. API pagination uses search IDs when
supplied and enforces the 14,999 offset bound. Ordering is not treated as a quality
or relevance ranking, and all records within the query must be collected.

Raw response text, request, retrieval time and SHA-256 are archived under ignored
`.local/research/raw/`; `acquisition-<recipe hash>.json` enables offline replay and
`input.json` is the portable acquisition bundle. Individual source records retain
their own object hashes in the public projection; response-page hashes are included
in the source inventory. Local input hashes detect modification, not independent
government signatures. PI/contact fields in upstream responses are not projected
into public output. Public files contain no credentials or model output.

Public consumers read `public/data/research/manifest.json`, then the content-hashed
`releases/<release>/data.json`. The reader checks the hash and schema. Publication
uses the shared lock, immutable release and atomic pointer/CAS workflow. Older
releases are retained. Offline replay preserves the observation timestamp and data
release; it does not pretend that the government source was fetched again.

## Interpretation safeguards

- Every application ID is unique; fiscal year, NIH agency and administering institute
  are checked against the recipe. Pagination gaps, changed totals/search IDs,
  duplicate applications/publication edges, corrupt hashes and missing batches fail
  the job. Exceeding configured caps refuses publication rather than comparing
  arbitrary truncated samples.
- Top-level reported award amounts are nominal and not outlays. Subprojects are
  excluded from monetary aggregation to avoid parent-plus-child double counting.
  Null amounts are unknown; they suppress numeric changes in the affected group.
- A missing application in a fully collected year means zero _matching records_,
  not zero NIH funding outside that query. Title changes can alter membership in
  the query, and historical source corrections can alter a later capture.
- Institution identity uses NIH IPF, with unresolved identities isolated by
  application. No inferred corporate hierarchy or merging of similarly named
  campuses. A renamed organization can retain its IPF; details preserve the names
  reported on each application. NIH category strings are not paired by array
  position with numeric categories and are never presented as MeSH identifiers.
- A publication linked to a core project can precede or follow the two sampled
  fiscal years. The latest-application field is not an award-year attribution.
  Shared publications do not establish sole funding, efficacy, causality or ROI.
- Map locations mean funded organizations, not study sites, participants or the
  local economic benefit of an award. The selected core's optional connecting lines
  indicate identity across applications; coincident coordinates do not create lines.

## Verification

`tests/civic-research.test.ts` exercises source projection, overlapping categories,
organization identity, unknown amounts, excluded subprojects, complete/empty year
comparisons, invalid and multi-page inputs, exact-PMID linkage, real acquisition
orchestration with test responses, offline replay, immutable output, stale/scope
rejection and public hash checking. `tests/browser/research-funding.spec.ts` checks
the real snapshot's totals, institutions/projects/topics, map points, two-way trial
navigation, persistent canvas, URL restoration, phone layout and reduced motion.
No model-generated labels or fictional fixture values are reported as real funding.

Verified 2026-09-16: all 65 code/integration tests and all 22 browser tests passed;
the extended Research Funding browser check also verified a real two-location
core-project connection. Svelte check reported zero errors/warnings. The root build
produced both independent sites, and the prerendered research page's relative links
resolve to the correct registered-site paths and included snapshot. The live route
returned HTTP 200 on the existing port 5173 server. Coworker site sources were not
modified, and no commit or push was performed.
