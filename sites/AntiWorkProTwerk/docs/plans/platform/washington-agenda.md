# A Company's Washington Agenda — product 7

Development URL: `http://127.0.0.1:5173/records/lobbying/`.
Production path: `/AntiWorkProTwerk/records/lobbying/`.

## Source and first collection

The official [LDA API](https://lda.gov/api/) supplies registrations and quarterly
activity reports. Its [OpenAPI specification](https://lda.gov/api/openapi/v1/)
identifies `lda.gov` as the replacement for the retired `lda.senate.gov` API.
No account, API key, database or model inference is required for this pipeline.
The [terms](https://lda.gov/api/tos/) allow anonymous access at 15 requests/minute.
The collector spaces requests at least 4.1 seconds apart and stops on a rate-limit
response, preserving its Retry-After instruction in the error. Do not run many
jobs concurrently against the same anonymous allowance.

The UI and export retain the required notice:

> Senate Office of Public Records cannot vouch for the data or analyses derived from these data after the data have been retrieved from LDA.gov.

First configured scope: **client ID 59201, ANTHROPIC, filing years 2024–2025**.
This is the direct-client record, not an inferred corporate family or the total
universe of lobbying involving Anthropic. A name search also returns separately
identified clients and intermediaries; those are not silently merged into this ID.
Users can supply up to twenty explicit client IDs and one to six filing years.

Captured September 16, 2026. Active release `la-4dbc5bcf5347db0c48011f6c`:

- Eleven filings: six for 2024, five for 2025. All API pages for both queries were
  acquired and validated; no top-N or partial query is published.
- Eight quarterly report series, plus registration/registration-amendment records.
- Seven distinct official general-issue codes. Five code introductions relative to
  the adjacent preceding reported quarter: energy in 2025 Q2 and four in Q3.
- The 2025 Q2 original reports $910,000 in expenses; the later amendment reports
  $920,000. Both are preserved. Neither is added to the other.
- Reported client metadata places this client in California. Map points are state
  anchors, not addresses, meeting locations or inferred geographic influence.

The initial development release remains immutable. The current release includes
correct registration-amendment classification; its source-change receipt reports
no changed source records between the two captures. Source changes and changes in
our projection logic are different concepts.

## Meaning and comparison rules

Search the captured company names, registrants, official issue categories, exact
specific-issue descriptions, bill mentions and listed government entities. Filter
by client ID, filing year, issue code or reported client state. Cards show quarterly
history; a separate view includes every filing, registration and amendment.

Quarterly series use exact **client ID + registrant ID + filing year + quarter**.
The default card uses the latest posting time within that series, retains every
version and makes earlier versions inspectable. This is a display rule, not a
claim of independently verified formal supersession. Tied latest posting times
leave the comparison unresolved. Explicit no-activity/termination report types
are recognized; unknown filing types fail rather than being guessed.

“Newly listed” compares official general-issue codes across **adjacent reported
quarters in the same relationship**. A missing report is not a zero baseline.
The first captured quarter and unresolved ties do not produce introductions.
Comparisons are computed before search filters, preventing a filtered-out quarter
from creating a false new issue. A change within an existing issue code can still
be significant: exact source descriptions remain visible, but this version does
not claim semantic detection of every such change or a new private policy priority.

Income and expenses are separate nullable integer-cent fields. They are displayed
per filing, never combined across self-reported expenses and retained firms' income,
never allocated to issues, and never added across original/amended versions.
Unknown money is not zero. Invalid, negative or unsafe values fail validation.

Government entities are attached to each source activity in the supported filing
years (2022 onward). The API's older, pre-February-2021 activity/entity limitation
is avoided by the explicit supported-year bound. These entries do not document
every meeting, identify particular officials contacted or prove lobbying success.

Bill references preserve matched text and character offsets into the exact issue
description. They are **unresolved mentions**, not automatically joined legislative
IDs: a number can recur across Congresses and mention alone does not establish a
position or bill version. Rulebook and Vote Receipts links provide adjacent public
records to explore, not a claim that lobbying caused either outcome. Same-state
paycheck navigation is geographic context only.

Client state metadata is as retrieved and is not asserted to be a historical
filing-time address. Map counts include amendments/registrations, not independent
engagements or an influence score. Foreign/unknown/unmapped states are not guessed
into U.S. points. Contact details, streets, ZIP codes and raw lobbyist details are
omitted from the public projection. Full source responses remain local for audit;
future product 10 requires its own explicit implementation and branch check.

## Portable local pipeline

Run from `sites/AntiWorkProTwerk`:

```powershell
npm run civic -- lobbying --plan docs/plans/platform/lobbying-lda.json
npm run civic -- lobbying --plan docs/plans/platform/lobbying-lda.json --offline
npm run civic -- lobbying --input .local/lobbying/input.json --workspace .local/lobbying-import --output .local/lobbying-import/public --offline
```

`acquireLobbying` captures official JSON; `projectLobbying` and `buildLobbying`
validate/project it; `runLobbying` orchestrates the job. These exported functions
can run inside a future task service without rewriting data processing. No job is
currently scheduled. Changing collection identity/scope requires a new output
directory instead of silently replacing a differently defined collection.

Ignored workspace output:

- `raw/<hash>.json`: URL, exact response string, hash and observation timestamp.
- `acquisition.json`: complete validated capture, used for offline replay.
- `input.json`: self-contained portable input with raw response strings; it needs
  no external files or credentials for import.

Public output: `public/data/lobbying/manifest.json` and immutable
`releases/<release>/data.json`. The manifest binds SHA-256 to the complete output.
Public records preserve the original filing URL, official detail API URL, parent
page hash and original record-object hash. SHA-256 hashes raw response strings as
UTF-8, and record/output objects through `JSON.stringify` in preserved property
order; these are integrity receipts, not source authentication.

The collector permits only reconstructed official endpoint queries, refuses
redirects, bounds requests to 30 seconds and responses to 4 MB, and caps each
client/year at the configured limit (default 200; maximum 1,000). It checks every
page count/link, duplicate ID, filing source identity, year/client scope and
capture chronology. Changed totals, stalled/partial pages and malformed data stop
the run. The API lacks an atomic snapshot token, so these checks are not proof of
an unchanged upstream database throughout acquisition.

Publication holds a workspace lock, reads the previous release before acquisition,
and uses the shared output lock, compare-and-swap and atomic manifest replacement.
Failure leaves the prior public pointer intact. Refresh receipts distinguish newly
captured records, changed raw records and records no longer returned; these are not
new engagements, terminations or findings. Offline replay against the same prior
release preserves its change receipt and reproduces the identical release. Import
into a fresh output starts a new observation baseline, so historical change receipts
are not recreated without the preceding published snapshot.

## Interface and verification

The page uses the existing persistent map and mobile evidence sheet, a slate-blue
palette, restrained timeline/hover/detail motion and reduced-motion support. It
renders at most 24 cards at a time. Source detail receives focus when opened and
scrolls into view. Interactive buttons/filters stay disabled until hydration,
preventing early clicks from being lost. Official links remain ordinary links.

Six code tests cover source projection, privacy omissions, exact cents/nulls,
literal source spans, report/amendment/no-activity types, consecutive-quarter rules,
ties, identity separation, multi-page validation, corruption/unsafe links, local
publication/import, offline replay, rate-limit handling and repository integrity.
Two browser tests exercise real records, amendment switching, complete download,
filtering/empty states, persistent-map navigation, phone layout and reduced motion.
Desktop and phone screenshots were visually inspected. The real acquisition was
replayed offline to release `la-4dbc5bcf5347db0c48011f6c` without model or network access.

Final functional verification on September 16, 2026: **86 code/integration tests
and 31 browser tests pass**, with zero Svelte errors/warnings. The repository-root
build passes for both buildable independent sites and the native-platform lockfile
check. Coworker site source files remain untouched. Local development (5173) and
the rebuilt root production preview (4173) remain running.

Public JSON is 24,538 bytes / 3,381 gzip. Compressed initial HTML is 13,355 bytes.
Run `npx tsx scripts/civic/lobbying-performance.ts` against the root production
preview to reproduce the three-fresh-context desktop/phone sample. Timestamped
reports and `latest.json` remain under ignored `.local/lobbying/performance/`.
It validates production delivery and the actual $920,000 amendment/$910,000 original
while exercising issue filters, detail selection and version switching.

| Local production profile | Ready, three samples | LCP, three samples | Maximum interaction, three samples |
|---|---|---|---|
| Desktop, unthrottled network | 315 / 250 / 253 ms | 408 / 156 / 160 ms | 288 / 96 / 104 ms |
| Phone, 4× CPU, 1.6 Mbps / 80 ms network | 1,640 / 1,607 / 1,645 ms | 1,244 / 1,092 / 1,120 ms | 152 / 104 / 136 ms |

Every sample has zero page errors. The phone profile is 390×844; desktop is
1672×941. Reduced motion and software WebGL are enabled. This is not field INP
or a physical-phone test. **The 288 ms cold desktop interaction exceeds the 200 ms
lab target**, consistent with an unresolved shared-startup performance edge also
seen in Wage Ledger. The cause is not established, and the later faster runs do
not erase it. This bounded collection is not proof of nationwide coverage,
universal device performance, complete semantic topic extraction or lobbying causation.
