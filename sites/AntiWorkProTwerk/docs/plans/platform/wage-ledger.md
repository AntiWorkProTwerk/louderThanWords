# Wage-Violations Ledger — product 29

Open `http://127.0.0.1:5173/records/wages/`. Search employers or case IDs, inspect
exact reported legal-name groups, open case evidence, and filter by employer state,
findings-end year and whether the source reports a positive or zero violation count.
The live development server remains available; this is not a hosted deployment.

## What this collection contains

The [DOL Open Data Portal's WHD Enforcement dataset](https://data.dol.gov/datasets/10362)
describes concluded Wage and Hour Division compliance actions since fiscal 2005.
The downloadable archive includes earlier **findings** dates: those dates describe
the underlying findings period, not when an investigation opened or closed.
The [Data.gov entry](https://catalog.data.gov/dataset/wage-and-hour-division-compliance-action-data)
identifies the source as public-domain government data.

The old enforcement portal redirects to the new DOL portal. Its authenticated
query API requires registration, but the dataset page provides a **public complete
ZIP download without a key**. This pipeline uses that displayed bulk link, not a
borrowed key, login bypass or unofficial mirror:

`https://data.dol.gov/data-catalog/WHD/enforcement/WHD_enforcement.zip`

Metadata/definitions are acquired from the same public endpoint used by the portal:
`https://apiprod.dol.gov/v4/datasets/10362`. Both archive and metadata are hashed.
No credential or service setup is needed. The two new development dependencies,
`yauzl` and `csv-parse`, stream archive members and correctly handle quoted CSV;
neither is a browser dependency. The ZIP is not extracted onto arbitrary paths.

Initial release `wl-f4dc90cebb11cbc6289f49b1`, observed September 16, 2026:

- Original ZIP: 199,815,438 bytes, eight CSV members, 367,890 rows. SHA-256:
  `f847c24d2c2cf42e100c2916d35dd16fe5ea020021886db0fb207433b03b6296`.
- Source Last-Modified: September 14, 2026. This is an archive timestamp, not the
  date of every action in it. Catalog publication dates may differ.
- Selected food services/drinking places, industry prefix `722`, with findings
  ending January 1, 2023 through December 31, 2025, across all reported states.
- 6,615 selected cases; 5,810 with positive recorded case-violation counts and
  805 with zero recorded counts. Zero is not omitted from search or totals.
- 6,352 exact legal-name groups, of which 160 have more than one case. Thirteen
  cases lack a legal name and each remains separate; there is no unknown-name mega-group.
- 51 mapped states/D.C.; 88 cases in territories or otherwise outside that map
  crosswalk remain in national totals and source records.
- $71,975,624.83 total back wages **agreed to pay**, 59,986 employees agreed to pay
  summed across cases, and $43,072,262.64 total civil penalties **assessed**. These
  are not verified recoveries, current outstanding balances, deduplicated workers
  or employer misconduct rankings.
- Public JSON: 5,106,771 bytes; 879,814 bytes gzip. It is a portable collection
  of projected records, source locators, field definitions, coverage and changes;
  not a copy of the full 200 MB archive. Lists initially render only 24 cards.

The full archive has 954 rows without findings-end dates and one with a date after
capture; those source-quality counts are visible. Missing findings-end dates cannot
be selected by a findings-end range. A future date is not silently corrected.
Within the selection, reversed findings ranges produce explicit case cautions.

## Evidence and matching rules

- Trading/employer names and reported legal names are displayed separately. Group
  keys match the **exact legal-name string**, without changing punctuation, case,
  whitespace, corporate suffixes or aliases. Missing legal names use a per-case key.
  The source has no verified global company identifier here: even identical legal
  names can refer to different entities, while spellings can split a real entity.
  These are inspectable name-match groups, not asserted parent-company ownership.
- Shared franchise brands do not merge independent legal-name groups. For example,
  a trading name can be shared by separately named franchisees. There is no guessed
  link to procurement recipients, political donors or owners.
- Multiple cases do not independently prove statutory repeat/willful status.
  The case detail separately shows the source's FLSA `R`, `W`, or `RW` designation
  when reported, without deriving it from our grouping.
- Current `CMP_ASSD` is described as **currency / total CMP assessments**. It is
  not the older `cmp_assd_cnt` count mentioned by some third-party documentation.
  The pipeline requires the current currency-field metadata and never computes
  totals by adding overlapping FLSA and child-labor penalty components.
- `BW_ATP_AMT` means back wages agreed to pay; `EE_ATP_CNT` means employees agreed
  to pay. `EE_VIOLTD_CNT` is a separate employee-in-violation count. Case sums do not
  deduplicate workers who appear in more than one investigation.
- Money is parsed into exact integer cents, and malformed/negative/fractional-count
  values fail. Missing numeric fields remain null. Aggregates distinguish known
  subtotals and missing counts instead of filling unknown observations with zero.
- DOL explicitly warns that violation-count collection changed October 1, 2025.
  Cases loaded before/after that threshold are not directly comparable by violation
  count. The UI does not sum or chart those counts as a time series or ranking.
  Internal `LOAD_DT` supports a caution; it is never called a closure date.
- Nonzero statute fields and their original definitions are available in details.
  They are source fields, not additive subtotals or AI classifications. Original
  raw CSVs retain zeros and the remaining columns for full audit.
- There is no stable public case-detail URL on this portal. Every displayed case
  gives the original ZIP link, member filename, data-row number (excluding the
  header), case ID and record hash. A dataset landing page is not misrepresented
  as a case-specific record. The public snapshot also preserves those locators.

## Map, connections and interaction

The existing U.S. map/canvas persists across product navigation. Counts are matching
cases by reported employer state, not worker locations, exact workplaces, rates of
violations or company rankings. Points are the existing state-label anchors; no
street geocoder, employer-headquarters guess or personal home marker is added.
State selection filters the list; map counts retain alternative states for browsing.

Selecting an employer group produces a findings-end-ordered case list with a subtle
timeline. This ordering is not investigation or publication chronology. Case detail
entrances and hover effects respect reduced motion. Mobile uses the shared
expandable evidence sheet, single-column evidence and accessible native controls.

The ledger and Regional Paychecks link in both directions, preserving the selected
state. Their industries, dates and units are explicitly different. Shared geography
provides context, not evidence that enforcement caused a pay trend or vice versa.

## Run locally or inside a future remote job

From `sites/AntiWorkProTwerk`:

```powershell
# Download the current complete archive, scan every member, select and publish.
npm run civic -- wages --plan docs/plans/platform/wages-dol.json

# Re-scan the saved archive and metadata with no network access.
npm run civic -- wages --plan docs/plans/platform/wages-dol.json --offline

# Import a portable bundle, with raw/<archive-hash>.zip next to its input.json.
npm run civic -- wages --input .local/wages/input.json --workspace .local/wages-import --output .local/wages-import/public --offline
```

The recipe has a title, findings-end date range, optional exact states and industry
prefixes, plus an explicit selected-record cap (default 15,000, maximum 50,000).
Empty state/prefix arrays mean all values. The entire archive is still validated.
Use a new output directory for a changed recipe; refreshing a published collection
cannot silently change its meaning. No rolling-date schedule is currently running.

`acquireWageSource`, `inspectWageArchive` and `scanWageCsv` are reusable source stages.
`runWages` provides orchestration; `projectWageCase` and `finalizeWages` provide
projection/validation. The client module exports typed schemas, filters, exact-name
grouping, aggregate calculations and currency formatting. A later task runner can
invoke these same functions and publish static JSON; no database is needed.

Ignored local artifacts: `.local/wages/source.json`, content-addressed ZIPs in
`raw/`, and `input.json` containing the recipe and source receipts. To move a bundle,
copy `input.json` **and its referenced ZIP** into the same relative layout. Import
rechecks and re-scans the ZIP; it does not trust a caller-provided selected-row list
as proof of completeness. The acquisition receipt also preserves raw metadata.

Public output is `public/data/wages/manifest.json` and immutable
`releases/<release>/data.json`. The browser instead reads `index-v1.json`, a compact
tuple transport containing every case's search/filter/map summary, then loads full
case evidence from `cases-v1/00.json` through `3f.json` on demand. The complete
download remains unchanged. The manifest binds each attachment by SHA-256; the
reader checks the parent release, shard membership and agreement with the index.
An eight-shard LRU avoids repeat requests. Aborted/obsolete requests cannot replace
a newer selection, and failed requests expose a retry without caching the failure.
The index is 1,155,266 bytes / 352,042 gzip; the largest detail shard is 18,643 gzip.
Offline replay generates the same attachments from the same archived evidence.

The shared publisher uses locking, compare-and-swap
and atomic manifest replacement, after all attachments are written and verified.
Hash/schema validation is required on read. Failed
collection/validation leaves the preceding public pointer intact. Source change
receipts distinguish new-to-capture cases, updated source fields and cases no longer
returned by the selected scope; none automatically means a new case or exoneration.
Exact offline replay reproduces the release and retains the original capture time.

### Transport / parsing bounds

Fixed official HTTPS endpoints; no redirects or credentials. Metadata requests
time out after 30 seconds; bulk download after five minutes. The archive is capped
at 350 MB and streamed to a uniquely named partial file, with declared-length and
SHA-256 checks. Interrupted partial files remain local diagnostics, not releases.
The job does not silently retry a full large download; rerun on a transport failure.

ZIP entry names/layout, member count, decompressed sizes, CRC32, one-million-row
archive cap, duplicate case IDs, CSV column identity, row shape and selected-record
cap are validated. Source columns must match the captured metadata. CSV parsing
handles quoted commas/newlines without splitting records incorrectly. No files are
extracted by archive-supplied paths. Selected records preserve exact raw-row hashes.

The complete-archive claim is scoped to all CSV members in the downloaded source,
not an independently measured count of every case DOL holds internally. Source
availability, suppression and data-quality limitations remain visible.

## Verification

Code tests exercise exact monetary arithmetic, nulls and malformed values, calendar
dates, source cautions, separate worker concepts, non-additive penalty totals,
franchise/legal-name separation, unknown-name isolation, CSV/ZIP integrity, local
publication, offline/import replay, filter behavior, revisions, corruption and
preservation of the prior manifest on a capped/failed run.

Browser tests exercise the actual 6,615-case collection, totals, 15-case exact-name
group, source locators, disclosure of October 2025 definitions, zero-violation
filters, Texas map selection, persistent canvas, two-way pay navigation, snapshot
download, mobile layout, reduced motion, case pagination and empty results.
Desktop/phone screenshots were visually inspected. The real archive was acquired,
fully scanned and then replayed offline to the same release.

Functional verification on September 16, 2026: all 80 code/integration tests
and all 29 browser tests pass. The three wage browser tests and Svelte check were
rerun after the last race-test synchronization change: all pass, zero errors/warnings.
New tests cover lazy requests, retry, cache, stale-response isolation, attachment
immutability and rejection of corrupt or mismatched index/detail evidence. The root build
passes for both independent sites, including the native-platform lockfile check.
The built `/AntiWorkProTwerk/records/wages/` route serves the verified 6,615-record
release and supports two-way Texas pay-context navigation with the same map canvas
and zero page errors. Coworker site source files were not edited.

The compact split reduces compressed initial HTML from 914,375 to 376,873 bytes
(about 59%). A reproducible benchmark checks a production build, refuses the dev
server, asserts no initial full-data/detail requests, exercises search and case
navigation, and retains timestamped reports under ignored `.local/wages/`:

```powershell
npx tsx scripts/civic/wage-performance.ts --runs 3
npx tsx scripts/civic/wage-performance.ts --runs 3 --network --output .local/wages/performance-network
```

The September 16 reports use three fresh contexts per profile, reduced motion,
software WebGL, desktop 1672×941 and phone 390×844 with 4× CPU throttling. Nearest-rank
p75 of three samples is their maximum; these are small lab samples, not field INP
or physical-device results. Every sample fetched one detail shard and had zero page errors.

| Profile | LCP p75 | Hydrated ready p75 | Maximum interaction p75 |
|---|---:|---:|---:|
| Desktop, first batch, unthrottled network | 540 ms | 467 ms | 328 ms |
| Phone, unthrottled network | 592 ms | 1,567 ms | 128 ms |
| Desktop, second batch, unthrottled network | 604 ms | 367 ms | 144 ms |
| Phone, 1.6 Mbps / 80 ms latency | 1,344 ms | 4,247 ms | 104 ms |

Phone interactions improve over the earlier 208 ms sample, but the first desktop
batch includes a **328 ms cold-run outlier** whose cause is not established. It is
not erased by the later 144 ms result. Network-throttled hydration still takes
about 4.25 seconds. Shared performance work remains open; functional completeness
does not establish that every device/network meets the 200 ms interaction target.
