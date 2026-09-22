# Consumer Problem Radar — product 30

Open `http://127.0.0.1:5173/records/complaints/`. This is real CFPB public data,
not generated complaints. The collection is deliberately identified by exact
companies, financial product and received-month range. It is not market-wide.

## What to do in the browser

1. Read the collection scope and the allegation warning. Choose a company,
   state, search terms and the month that separates baseline from recent records.
2. Inspect rising categories. Each card shows both raw counts, records per
   calendar day, daily-volume change, and its share of the filtered collection.
   All categories includes small, flat and declining groups.
3. Open a category to inspect its records. Change **Records and map** to see
   recent, baseline or both periods. Examples are selected across the date order;
   the complete matching list remains available, 24 cards at a time.
4. Open a record for its original issue/sub-issue, product, company, received and
   sent dates, reported consumer state and company-response fields. Follow its
   original CFPB record link. These fields are not a generated narrative.
5. Use the persistent U.S. map or accessible geography selector. Counts are
   matching records in the selected period. Points are state-label anchors, not
   homes, branch locations or headquarters. Unknown/unmapped states remain in
   totals. The geographic filter narrows records; map counts keep other states
   available for navigation.
6. Use **Capture changes** for differences between complete local observations,
   not a claim that an old complaint just happened. Download the immutable public
   snapshot from the method disclosure. Links preserve the current filters, but
   the route loads the latest manifest; the downloaded release is the frozen record.

Regional paychecks and complaints link in both directions using the selected
state. They have different date windows, units and populations. Geography is the
only asserted connection; wages do not explain or cause the complaint pattern.
No fuzzy company-to-politician, donor, owner or bank-headquarters edges are drawn.

The route shares the existing map canvas, fonts, navigation and mobile evidence
sheet. Plum accents distinguish it from the economic series. Detail transitions
respect reduced motion. Monthly bars use native HTML/CSS, and record/category
lists render 24 items initially rather than thousands of DOM nodes.

## Sources, limitations and the missing narratives

The input is the [CFPB Consumer Complaint Database search API](https://cfpb.github.io/ccdb5-api/),
using its public JSON endpoint and exact product/company filters. Responses
identify the data license as CC0. We preserve API page hashes and capture times.
Company aliases/parents are not merged by name similarity.

CFPB [announced on August 14, 2026](https://www.consumerfinance.gov/about-us/newsroom/the-cfpb-to-cease-discretionary-publication-of-complaint-narratives-and-visualizations/)
that routine narrative publication and its visualizations would cease. The live
API returned structured records without consumer narratives during this collection.
Older API documentation still describes narratives; the current source response
and dated announcement take precedence. Previously published narratives have a
[separate FOIA archive](https://www.consumerfinance.gov/foia-requests/foia-electronic-reading-room/cfpb-consumer-complaint-database-narratives-archive/).
This pipeline does not acquire or republish that archive. There is no AI sentiment
stage and no invented consumer story standing in for missing text.

Complaints are unverified allegations, not adjudicated violations. Published
complaints are not a random customer survey. Collection/reporting differences,
publication lag, issue taxonomy changes and business size affect counts. No
customer-count or market-share denominators were acquired, so raw counts are not
a fair company ranking or a probability that a customer encounters a problem.
Response labels such as "Closed with explanation" do not establish resolution.

Public records omit ZIP codes, demographic tags, precise received timestamps and
any narrative/personal address fields. Source pages are archived locally, ignored
by Git; do not publish the raw acquisition directory as the consumer dataset.
Each public record has a fingerprint of the validated source object (not a hash
of verbatim record bytes); each source-page hash covers the exact captured JSON
string. A fingerprint change signals changed source representation, not necessarily
a substantive change to the allegation. The immutable output has its own SHA-256.

## Captured baseline and calculation

Release `cr-8d19741354b785ee49d6405e`, observed September 16, 2026:

- Checking or savings account, January–June 2025.
- Exact companies: `ALLY FINANCIAL INC.` and `SOFI TECHNOLOGIES, INC.`.
- 1,230 records, 71 exact product/sub-product/issue/sub-issue groups, 16 pages.
- Monthly totals: 265, 203, 203, 164, 188 and 207. Every month matches the API's
  exact total; no capped/truncated month contributes a trend.
- 51 mapped states/D.C.; three records without a mapped state across both periods.
- Public JSON: 789,358 bytes; 82,023 bytes gzip. No model calls or new service.

The default baseline is January–March (671 records / 90 days), recent is April–June
(559 / 91 days). Group volume is `records / calendar days`. Growth is
`(recent daily volume / baseline daily volume - 1) * 100`. Shares use the counts
in the corresponding period after company/state/search filters. Share differences
are percentage points. Neither calculation is a per-customer rate.

**Rising:** at least five records in each period and daily-volume growth of at
least 25%. **New in this slice:** zero baseline records and at least five recent
records; percent growth is undefined, not infinity. These are transparent display
thresholds, not significance tests, forecasts or discoveries of misconduct. At
baseline, two groups meet the rising threshold: funds not handled/disbursed as
instructed (26 → 34; about +29.3% per day) and problems making/receiving payments
(16 → 22; about +36.0%), both within checking-account management.

Examples are first, middle and last after received-date/numeric-ID sorting. This
selection spans the slice but is **not statistically representative**. The complete
structured records remain inspectable. No claim of semantic narrative clustering
or independent accuracy evaluation is made.

## Local pipeline / future job interface

Run from `sites/AntiWorkProTwerk`:

```powershell
# Acquire, validate and publish this collection.
npm run civic -- complaints --plan docs/plans/platform/complaints-cfpb.json

# Replay captured bytes, preserving their observation time and release.
npm run civic -- complaints --plan docs/plans/platform/complaints-cfpb.json --offline

# Import a portable acquisition bundle without contacting CFPB.
npm run civic -- complaints --input .local/complaints/input.json --workspace .local/complaints-import --output .local/complaints-import/public
```

The recipe supports four to twenty-four consecutive months, one exact product,
one to ten exact companies, pages of at most 100, and an explicit per-month cap
of at most 10,000. Change the recipe and use a separate output directory for a
different collection; an existing collection cannot silently change meaning.
This historical example does not roll its dates forward automatically. A future
scheduler supplies an explicit new scope or refreshes this one.

`runComplaints` is the async acquisition/publication entry point; `buildComplaints`
accepts a portable source bundle. The client module exports schemas, filtering,
period calculations, grouping and example selection. A future remote job can call
these same functions and publish the resulting files. No database, credentials,
hosted scheduler or AI dependency is necessary. No recurring job is currently set up.

Sources live under ignored `.local/complaints/raw/`; `acquisition.json` and
`input.json` retain complete request/response bundles. Public files live under
`public/data/complaints/releases/<release>/data.json`, with an atomic manifest
pointer. Shared publication uses locking and compare-and-swap; consumers verify
the hash and schema before rendering. A failed validation preserves the last
published pointer. Later captures record newly observed IDs, updated fingerprints
and IDs not returned by the complete query; disappearance is not labeled deletion,
withdrawal or resolution because the cause is unknown. Exact replays preserve
those change receipts and the original tracking start.

### Acquisition safeguards

- Fixed HTTPS CFPB endpoint, no redirects, JSON content type, 30-second request
  timeout, maximum three attempts and 4 MB response bodies. Requests are at least
  1.1 seconds apart, with retry backoff and server Retry-After pacing.
- Live API date maxima were verified **inclusive**, unlike the older swagger
  description. Each query uses the month's first and last day, and every returned
  record must belong to that month. Leap-year month ends are tested.
- Ascending received-date/ID cursors, exact request URLs, validated optional API
  breakpoints, unique IDs, exact totals, non-stalled pages and matching company/
  product/date scope. `format` is omitted so JSON pagination is not bypassed by
  the API's export behavior.
- A single source index timestamp is required throughout the collection. If the
  index refreshes partway through, the capture fails rather than mixing vintages.
  Timed-out/shard-failed/stale/data-issue responses, approximate totals, cap
  overruns, corrupt hashes and partial coverage cannot publish trends.
- Existing scope changes, stale observations and conflicting same-time bundles
  fail. Raw diagnostic archives may remain after a failed job; they do not make
  that job a successful public release.

## Verification

`tests/civic-complaints.test.ts` covers boundaries/pagination, exact totals,
privacy projection, malformed/stale/out-of-scope sources, index refresh, hashes,
daily-volume arithmetic, filtered shares, small/zero baselines, deterministic
examples, change receipts, local acquisition, offline replay, corruption rejection
and preservation of the previous public pointer on failure.

`tests/browser/consumer-radar.spec.ts` checks the real baseline, both example
trends, downloading the 1,230-record release, category/record pagination, source
details, company and state filters, persistent-map cross-navigation, phone layout,
reduced motion, empty results and invalid dates. Screenshots were visually
inspected at desktop and phone sizes. Offline replay reproduces the exact release.

Final verification on September 16, 2026: all 75 code/integration tests and all
26 browser tests pass, including both new radar tests. Svelte check has zero
errors and warnings. The root production build passes for both independent sites.
A browser smoke check against the built `/AntiWorkProTwerk/records/complaints/`
route verified both trends, the served snapshot hash and 1,230 records, two-way
paycheck navigation with the production base path, and zero page errors. The
original CFPB detail URL responded with HTTP 200. Development remains running
on port 5173; no hosted deployment or recurring acquisition was started.
