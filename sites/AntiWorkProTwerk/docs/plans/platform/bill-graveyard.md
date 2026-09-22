# Bill Graveyard — product 4

Route: `/records/graveyard/` (root preview: `/AntiWorkProTwerk/records/graveyard/`).

## What this implementation does

A local TypeScript job acquires official GovInfo BILLSTATUS XML, validates every
number in an explicit collection recipe, and publishes an immutable compact index
plus individually downloadable bill histories. The Svelte interface reads that
index, filters proposals, compares official policy areas, and loads detailed
histories only on demand. No database, credential, AI inference, or hosted task
runner is required. `runGraveyard` is the reusable job entry point.

The shared map counts distinct bills by their source-reported sponsor states.
These are state-label anchors, not locations where Congress acted or where a law
has effects. Filtering a state preserves the other filters and clears the open
bill. The existing map instance survives navigation to Vote Receipts and back.

Each bill exposes its last recorded action, introduction date, source update date,
observed milestones, committees and dated activities, complete bill actions,
amendments and their separate actions, laws, and source-described related bills.
An amendment to an amendment retains that parent identity. Submission is not
called adoption. Multiple source entries about one event remain inspectable and
are not counted as distinct votes or decisions.

## Sources and interpretation

Source documentation: [GovInfo bulk bill status](https://www.govinfo.gov/features/featured-content/congressional-bill-status-bulk-xml),
[official XML guide](https://github.com/usgpo/bill-status/blob/main/BILLSTATUS-XML_User_User-Guide.md).
The repository organizes records by Congress and bill type. Each source is fetched
from an exact generated GovInfo URL; redirects are refused. Source action codes
are not globally unique. The adapter interprets known Library of Congress codes
only with source-system code 9, and preserves the source type/name/code on every
action. Unknown codes are not invented milestones.

The displayed progress is the **furthest observed milestone**, not a complete
legislative state machine or an assertion that every intermediate step occurred.
Referral alone is not classified as committee consideration. Law citations require
a dated law action. A related bill's enactment never marks this bill as enacted.
Raw action times are retained without guessing timezones or ordering different
source systems within one day.

Important real example: 119-H.R.29 last records Senate calendar placement on
February 10, 2025. Its XML explicitly identifies 119-S.5 as “Contained in public
law”; S.5 has its own public-law record. The UI prominently preserves that path.
The relationship does not assert interchangeable text versions.

90/180/365 days without a recorded action are optional browsing thresholds, not
legal statuses. No person is accused of blocking a proposal. A Congress ending,
an unchanged record, a missing file, or a reserved number is not converted into
a claim that the policy disappeared from every other bill.

Topic rows are grouped by the official policy area and Congress, with explicit
numerators and denominators. Outcome/inactivity/policy filters do not shrink the
comparison denominator. State, search, chamber and Congress filters do. Rows are
descriptive, not statistically adjusted rates; Congresses have different follow-up
lengths and early bill numbers are a nonrandom sample. No “consistently stalls”
headline is generated from this small, unequal-follow-up collection.

## Real baseline

Recipe: `graveyard-govinfo.json`, H.R.1–50 and S.1–50 in Congresses 118 and 119.
Captured `2026-09-16T21:00:36.707Z`.

- 200 requested numbers, all accounted for.
- 173 substantive records: 100 from the 118th, 73 from the 119th.
- 5 explicit “Reserved for the Speaker.” records and 22 HTTP 404 responses,
  separately reported and excluded from policy denominators.
- 1,289 bill-action entries, 1,145 amendments, 27 assigned policy areas.
- 29 bills have a recorded passage milestone in at least one chamber; 8 became law.
- Initial immutable release: `bg-49e92ef5d2c22574b7c7a903`.
- Index SHA-256: `49e92ef5d2c22574b7c7a903569dd04ae8f297b5144b583d3de37e7b65dcf95e`.

The sample includes both quiet and advancing proposals. Selection is by declared
number ranges, not by whether a bill has a dramatic outcome. Expanding the sample
requires a new named recipe/output scope, not silently changing an existing series.

## Run / update / replay

From `sites/AntiWorkProTwerk`:

```powershell
npm run civic -- graveyard --plan docs/plans/platform/graveyard-govinfo.json
npm run civic -- graveyard --plan docs/plans/platform/graveyard-govinfo.json --offline
npm run civic -- graveyard --input .local/graveyard/input.json --workspace .local/graveyard-import --output .local/graveyard-import/public --offline
```

All three paths produced the same initial release. The input JSON embeds exact
raw source strings, URLs, response statuses, capture times and SHA-256 hashes; it
is portable without the original archive directory. Local acquisition/attempt/raw
artifacts live under ignored `.local/graveyard/`. Every requested number is fetched
again on an online update, including previously absent/reserved numbers.

The job validates identities, complete coverage, nonoverlapping ranges, source
hashes, action chronology, latest-action membership, and declared action totals.
Network errors, partial HTTP responses, invalid XML, DTDs/entities, duplicate
documents and stale/conflicting captures fail before publication. HTTP 404 is an
explicit absence observation, not a transport-error fallback. Failed runs preserve
the prior public manifest. Source-record changes are reported separately from new
records and non-returned records; they may be metadata edits, not new actions.

Publication uses the existing workspace lock, immutable writes and compare-and-swap
manifest check. A future remote runner must provide an appropriate single-writer
filesystem or replace the storage/lock adapter; no distributed job infrastructure
has been deployed.

## Public output / connections / performance design

- `public/data/graveyard/manifest.json`: current release, index hash, detail hashes.
- `releases/<release>/data.json`: compact collection, source hashes, coverage and changes.
- `releases/<release>/bills/<congress>-<type>-<number>.json`: standalone detailed record.

Consumers verify SHA-256, release identity, schema and detail/index agreement.
The browser retains at most eight detail records, aborts obsolete requests, ignores
late results, and offers retry after download or validation failure. Lists and
histories are incrementally rendered; reduced-motion preferences disable entrance
and hover movement. The comparison table has a labeled, keyboard-scrollable local
overflow region rather than widening the phone viewport.

Vote Receipts links use the full Congress/type/number identity in both directions
and are labeled **lookups**: the other product may not collect that bill. They do
not invent exact text-version agreement, matching votes, or stance. Official
related-bill edges include the source's relationship label and identifying body.
Source references to amendments, committees and recorded votes remain direct
evidence links. Other products are not connected by fuzzy policy words or names.

## Verification

Six dedicated code tests cover namespace-sensitive milestones, related-law
separation, amendment-parent histories, source completeness, corrupt/stale captures,
denominators, map grouping, immutable publication, lazy integrity, offline replay,
reserved numbers and failure preservation. Two browser tests cover desktop and
phone flows, detail retry, source relationships, preserved map identity, reverse
Vote Receipts navigation, state filtering and viewport width.

Production performance command:

```powershell
npx tsx scripts/civic/lobbying-performance.ts --bills
```

Results live in `.local/graveyard/performance/`; this is a small local Edge lab
profile, not physical-phone or field-INP certification.

Final verification on September 16, 2026:

- 97 code/integration tests passed; 35 browser tests passed in the final full run.
- Svelte: zero errors and warnings. Root build: both present sites passed.
- The first full browser run had 34 passes and one existing phone-panel test
  failure: it read height on the first frame of the 200 ms expansion animation.
  The trace showed the expanded ARIA state. The test now polls the height change,
  and the representative toggle is disabled until hydration, like the evidence
  toggle. The subsequent full run passed; no CSS animation was removed.
- Desktop and phone screenshots were inspected. The page retains the shared map,
  warm neutral colors, readable source panels and local table scrolling.
- Index: 178,726 bytes / 33,612 gzip. Index plus all 173 detail files: 1,746,417
  bytes uncompressed. Largest individual detail: 19,289 gzip.
- Production initial HTML: 55,968 compressed bytes. No detailed bill file is
  requested before selection (asserted in the browser test).
- Three desktop runs: ready 367/294/281 ms, LCP 412/156/180 ms,
  maximum Event Timing duration 216/280/88 ms.
- Three 390×844 phone runs, 4× CPU, 1.6 Mbps download and 80 ms latency:
  ready 2,080/2,142/1,982 ms, LCP 1,464/1,400/1,248 ms,
  maximum Event Timing duration 120/112/120 ms.
- All six production runs had zero page errors. Reduced motion and software WebGL
  were used. The two desktop durations above the 200 ms target keep shared
  startup/performance investigation open; these samples do not establish field
  INP or diagnose the cause of those spikes.

The development server remains available on port 5173 and the root production
preview on port 4173. No coworker site source was edited and no commit/push was
made for this product.
