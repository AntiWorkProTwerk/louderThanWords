# Who Is Building a Major Stake? (#27)

The local product reads official Schedule 13D/13G filings and amendments, keeps
each reporting person’s disclosed position separate, and shows the filer’s
purpose or certification in context. It requires no database, AI or hosted service.

## Sources and collection

The initial configurable plan (`major-stakes-companies.json`) covers Howard
Hughes Holdings, Alphabet, Microsoft, Hertz Global Holdings and Seaport
Therapeutics. It collects structured schedules filed January 1, 2025 through
September 15, 2026: **38 filings, 20 histories, 12 initial schedules, 26 amendments,
147 reporting-person entries**. This is an illustrative collection, not a market
census, recommendation or representative sample.

Source indexes are the [SEC submissions API](https://www.sec.gov/search-filings/edgar-application-programming-interfaces).
Each issuer’s recent rows and every historical index page overlapping the requested
window are examined. All matching structured primary documents are collected;
explicit caps fail instead of silently keeping the first N. The XML subject issuer
is checked separately from the filer and the index that exposed the document.
Filings about a different subject issuer are recorded as exclusions.

The [SEC technical specifications](https://www.sec.gov/submit-filings/technical-specifications)
define structured Schedule 13D/G fields. Both legacy 13D `issuerCUSIP`, legacy
13G `issuerCusip` and current multiple-CUSIP containers are supported. A filing
can report a set of securities; the reported quantity is not allocated among
those CUSIPs. Invalid quantities, identity conflicts, malformed XML, duplicate
rows, source checksum failures and incomplete index pages fail before publication.

The current release is `ms-6aa6913972082f7fd85ed4fb`: a 94,494-byte index and
38 lazy evidence files totaling 793,488 bytes. An earlier development
release (`ms-8b37ed9ea20ac7b797c41b46`) lacked legacy 13D CUSIPs; those records
were explicitly unresolved, not guessed. Correcting that field and recapturing
sources joined the earlier/later histories. The original immutable release is
retained. The current release has no unresolved CUSIPs.

## What the figures mean

- Filing date, acceptance time and reported event date stay separate. A new
  initial schedule is not necessarily a new investment or purchase.
- Histories group exact issuer CIK, filer CIK and CUSIP set. Different filer
  entities are not automatically merged because their names look related.
- Reporter identity uses its explicitly supplied CIK, otherwise an exact name
  scoped to that filer. Missing CIKs, renamed reporters and missing reporters
  remain visible; they are not silently treated as the same person or a sale.
- Each reporter’s quantity, percentage and voting/dispositive powers are
  separate. Co-reporters can describe the same shares; quantities and percentages
  are never added together as an aggregate stake.
- Quantity and percentage-point changes use exact decimal arithmetic. Missing
  numbers are null, not zero. Date reversals, repeated event dates, changed filing
  families and unresolved security sets block numerical comparisons. Changes
  between collected disclosures are not labeled trades.
- Incomplete amendment sequences, missing original schedules and references to
  uncollected accessions are shown explicitly. The graph is by filing sequence,
  not elapsed time; incomparable values are not joined by a line.
- 13D Item 4 purpose and 13G Item 10 certification are distinct source fields.
  An amendment omitting text does not erase earlier text. The UI links to an
  earlier collected field and to the official filing/exhibits. It does not
  reconstruct complete operative terms from incorporated exhibits.
- A reported zero can reflect a reporting reorganization. The collected Vanguard
  explanation is displayed alongside the position; a zero is not labeled a sale.

Public evidence uses an explicit field projection. Dedicated street-address,
contact, credential and signature fields are excluded. Original captures stay
under ignored `.local`; narrative fields can themselves mention business
addresses or names and are not represented as completely redacted documents.

## Run locally or in a future worker

From `sites/AntiWorkProTwerk`:

```powershell
# Refresh the configured collection through the paced SEC adapter.
npm run civic -- major-stakes --plan docs/plans/platform/major-stakes-companies.json

# No-network replay from checksum-verified original captures.
npm run civic -- major-stakes --plan docs/plans/platform/major-stakes-companies.json --offline

# Portable import with no network or additional services.
npm run civic -- major-stakes --input .local/major-stakes/input.json --workspace .local/major-stakes-import --output .local/major-stakes-import/public
```

`acquireStakes` returns a portable input containing the plan, source receipts and
exact original bodies. `buildStakes(input, previous?)` validates and projects it.
`runStakes` uses a workspace lock and atomically publishes immutable
`releases/ms-…/data.json` plus `filings/<accession>.json` before replacing the
manifest. Future jobs can call these same functions with their own storage paths.
The shared `sec-submissions.ts` adapter is reusable by later SEC products.

Stale source captures, scope shrinkage and disappearing previously collected
filings are rejected. `changes` describes added or updated records relative to
the preceding release, not investment activity. Replaying against the same
baseline preserves the exact release. A fresh isolated import has identical
evidence but a different release hash because it has no previous change baseline;
repeating that isolated import preserves its own release.

The browser verifies manifest/index/evidence hashes and exact filing identities.
Full narratives load only when selected. Aborted requests cannot overwrite a
new selection; failures have a retry control. JSON downloads remain usable by
another UI or job.

## UI and connections

Development: `http://127.0.0.1:5173/records/major-stakes/`.
Production preview: `http://127.0.0.1:4173/AntiWorkProTwerk/records/major-stakes/`.

The persistent shared map counts selected issuers once by captured business-address
state. Its points are labeled state anchors, not investor homes, offices, trade
locations, portfolio values or inferred control. State changes preserve search
filters and clear the selected history/filing/reporter. Unknown coverage is not zero.

Search supports issuer/reporter names, tickers, exact CIKs and CUSIPs. Company,
schedule and initial-schedule filters are shareable URL state. Cards and source
fields expand progressively. The selected history has filing navigation, reporter
selection, percentage chart, exact changes, voting powers and source explanations.
Focus return, keyboard controls, responsive layout and reduced-motion transitions
follow the existing evidence workspace.

Evidence-supported two-way links connect Microsoft/Alphabet to Shared Investors,
Microsoft to Insider Records, and Pershing’s exact filer CIK to Quarterly Holdings.
Regional Paychecks links by company business state only, with explicit noncausal
language. Seaport Therapeutics is not joined to similarly named Seaport Entertainment.

## Verification

Dedicated tests cover legacy/current XML, namespace prefixes, multiple securities,
exact decimal changes, null versus zero, co-reporters, identity changes, historical
index coverage, caps, source validation, different-subject exclusions, missing
originals, nonconsecutive amendments, map filters, stale captures, publication
replay, lazy evidence checksums and cancellation.

The complete code suite passed 156 tests. Svelte typecheck reported zero errors
and warnings. Root build passed for both existing local sites. The full 57-test
browser regression passed; four dedicated major-stake browser tests also passed,
including a subsequently added stale-response regression. They exercise desktop/phone layouts, map instance persistence,
missing-purpose navigation, real Vanguard reorganization text, retry, downloads,
filters and bounded empty states. Desktop and phone screenshots were inspected.

All 38 published evidence hashes and index/filing identities were audited. Offline
replay preserved the current release; two isolated imports preserved their own
release, with evidence identical to the public collection and only change-baseline
metadata different. The fresh-import release is `ms-dffa1290f1c0eaf25ffaf85c`.
Production measurements were taken after builds and browser regression finished,
using `npx tsx scripts/civic/lobbying-performance.ts --stakes`. The six-run report
is `.local/major-stakes/performance/latest.json`, timestamp
`2026-09-17T01:57:13.729Z`. Desktop maximum Event Timing samples were 112/80/72 ms;
phone samples were 184/152/168 ms. Phone conditions were 4× CPU, 1.6 Mbps download
and 80 ms latency; each profile used software WebGL and reduced motion.
Desktop readiness was 438/241/245 ms; phone readiness 1941/1797/1728 ms.
Encoded initial HTML was 25,171 bytes; all six samples had no browser errors.
These are small local lab samples, not physical-phone or field-percentile guarantees.
No national coverage or ownership/control ranking is claimed.
