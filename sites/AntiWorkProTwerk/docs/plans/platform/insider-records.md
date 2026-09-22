# Insider Records — product 26

Route `/records/insiders/`; production subpath
`/AntiWorkProTwerk/records/insiders/`.

## Reader experience and interpretation

Search an issuer, reporting person, symbol, exact CIK or accession. Filter by
issuer business-address state, form, transaction category, filing month and
filing-level trading-plan checkbox. Open Table I and Table II separately, inspect
holdings without calling them purchases, and read exact field-linked footnotes
plus all remaining filing footnotes. Original SEC links, raw row locators and
downloadable JSON remain available.

Source-code explanations distinguish purchases, sales, grants/awards, tax/exercise
payments, exercises/conversions, gifts and other transactions. Code F is not an
open-market sale; P/S can cover private transactions too. Unknown codes retain
their source value. The acquisition/disposition A/D field is not transaction code
A/D. Deterministic translation needs no AI, and produces no motive, investment,
return or wrongdoing score.

Numeric cells remain exact strings without floating-point rounding or an inferred
currency. Blank is not zero. Holdings and derivative/non-derivative rows are not
summed into assumed economic trades. Co-reporting does not multiply rows or
allocate them to individual owners. Amendments stay separate: the reported
original-filing date is shown, but an original accession is not guessed. Missing
footnotes are explicit. Source HTML-like text is rendered as text, never executed.

## Sources and geography

Checked September 16, 2026:

- [SEC Insider Transactions Data Sets](https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets)
- [SEC table definitions](https://www.sec.gov/files/insider_transactions_readme.pdf)
- [SEC developer guidance](https://www.sec.gov/about/developer-resources)
- The actual quarterly ZIP’s `FORM_345_metadata.json`, including `AFF10B5ONE`
  and the tab-delimited dialect.
- Issuer profiles at `https://data.sec.gov/submissions/CIK<10 digits>.json`.

The quarterly archive is a flattened as-filed extract, not a substitute for a
complete filing. Archive membership follows SEC publication cutoffs, not
transaction dates. `AFF10B5ONE` discloses intended Rule 10b5-1(c) treatment at
filing level—not independently verified compliance or a per-row conclusion.
`true`/`1`, `false`/`0`, and missing are separate. An unchecked box does not establish
that every transaction was unplanned. Read the notes for scope and adoption dates.

The persistent map counts filings at **state-label anchors**, using separately
captured issuer business-address states. These are not physical trade sites,
owner residences or historical headquarters. Foreign/unavailable geography is
unmapped. Reporting-owner address columns and signatures are not projected into
public records; original archives remain local. Exact issuer and owner CIK
navigation supports future SEC products without name-based merging. Two-way
Paychecks links provide regional context, not evidence of causation. No guessed
join to CMS owners, lobbying clients or EPA facilities is made.

## Reusable pipeline

From `sites/AntiWorkProTwerk`:

```powershell
npm run civic -- insiders --plan docs/plans/platform/insider-issuers.json
npm run civic -- insiders --plan docs/plans/platform/insider-issuers.json --offline
npm run civic -- insiders --input .local/insiders/input.json --workspace .local/insiders-replay --output .local/insiders-replay/public --offline
```

`acquireInsiderFile`, `acquireInsiders`, `buildInsiders` and `runInsiders` can be
called from a future job runner. No API key, database, AI inference or hosted
scheduler is required. Public requests only read static output. Plans list exact
CIKs and official quarter URLs; new quarters/issuers may be appended. Refresh
retains earlier members; use isolated output for a different/shrunken scope.

Downloads declare this application’s user agent and serialize request starts
below two per second. `SEC_USER_AGENT` can supply the operator’s real organization
and contact for scheduled use; no fictitious email is supplied. Sources are
host/path/quarter constrained; redirects and HTTP errors fail without partial
publication. Bodies are capped (100 MB ZIP, 15 MB issuer JSON), SHA-256 addressed
and saved with retrieval/last-modified metadata. Fetch-decoded HTTP bodies are
not compared to compressed transport lengths.

Seven complete TSV members are scanned with CRC/size checks: submissions, owners,
both transaction tables, both holding tables and footnotes. Signatures are
intentionally omitted. Literal quotes stay text; empty tables require correct
headers. Caps fail rather than silently truncate. Row hashes, headers, parent
keys, duplicates, coverage, old source timestamps and previously collected filings
are validated before publication. Portable inputs exclude owner address columns.

```text
public/data/insiders/manifest.json
public/data/insiders/releases/it-<24 hash characters>/data.json
public/data/insiders/releases/it-<24 hash characters>/filings/<accession>.json
```

All details complete before the manifest changes. The browser verifies hashes and
index/detail identities, caches six successful details, aborts obsolete selections
and offers retry. Lists initially render 20 filings / 12 evidence rows, with more
on demand. Raw fields mount on request. Reduced motion and the shared phone sheet
are supported.

## Initial real collection

- Release `it-cd1b197ddb6649e1eb5df32c`; data hash
  `cd1b197ddb6649e1eb5df32c8e9f0b9e45b089ed87d686562a5240ef0f63b4ad`.
- Observed through `2026-09-16T23:31:28.718Z`.
- Q1 archive: 13,874,904 bytes; hash
  `3dcb680593f5829bc951cb0969e858b60fc21a6835b094838218093a849592d6`.
  Q2: 11,498,860 bytes; hash
  `11f1b2bbbdcbe6347a34437c02d04202fda0eca1dbb023726e4b56504b802e27`.
- 125,361 submission rows scanned across both national archives. All seven
  member counts and selected counts are preserved in the index.
- 305 selected filings: Apple 28, Boeing 53, JPMorgan Chase 103, Microsoft 64,
  NVIDIA 46, Tesla 11. This is a nonrandom example, not a market-wide screen.
- 299 Form 4, five Form 3 and one Form 3/A. No Form 5 in the selected real slice;
  its parsing/amendment behavior is covered by explicit fixtures.
- 447 non-derivative transaction rows, 159 derivative transaction rows and 288
  holding rows. These are row counts, not unique economic-event totals.
- 827 footnotes; zero unresolved field references in this release.
- Trading-plan checkbox: 56 reported, 243 unchecked, six unavailable.

## Verification

Seven dedicated tests and all 127 code tests pass; typecheck has zero errors and
warnings. Dedicated coverage includes decimal precision, co-filers, code/holding
distinctions, checkbox/date variants, missing notes, privacy, corrupt/incomplete
captures, retained refresh, immutable publication, literal TSV quotes, empty
tables, HTTP decoding, offline replay and lazy browser integrity.

The real offline national rescan and isolated portable replay reproduce the same
release/hash. All 305 public attachment hashes, schemas and index identities were
separately audited. An actual original-filing link returned the matching SEC
accession. Initial three desktop/phone browser checks pass; screenshots were
visually inspected. Final full browser/build/performance results are in the ledger.

Production lab command after the root build:

```powershell
npx tsx scripts/civic/lobbying-performance.ts --insiders
```

Lab results are not a physical-device or field-INP guarantee.

Final production report `.local/insiders/performance/latest.json`, captured
`2026-09-16T23:49:27.48Z`, uses three desktop and three simulated-phone runs
(4× CPU, 1.6 Mbps download, 80 ms latency, reduced motion, software WebGL).
Maximum interaction durations were 184/120/72 ms desktop and 96/72/96 ms phone.
Phone hydration-ready times were 2,163/1,814/1,790 ms; LCP was
1,444/1,172/1,164 ms. Encoded initial HTML was 50,117 bytes. No page errors were
reported. The final root build completed both independent sites successfully.

The final full browser regression passes all 48 checks (3.3 minutes), including
the two-way Paychecks/Insider Records navigation with the same map, phone
amendment/holding rendering, retry and stale-response isolation. The final phone
screenshot was visually rechecked after giving the evidence page an opaque
background for legibility. Development and production previews return HTTP 200.
The six remote branch tips remain unchanged, no PRs are open, and coworker site
worktrees are untouched. No commit or push was performed in this task.
