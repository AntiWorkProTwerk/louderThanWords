# Competitors, Shared Investors (#22)

The local product connects the frozen Quarterly Holdings collection to explicit
public-company identities and visible peer-group definitions. It does not require
a database, account credential, AI call or hosted task service.

## Collection and meaning

Initial collection: seven companies (Alphabet, Amazon, Microsoft, JPMorgan Chase,
Bank of America, Citigroup and Wells Fargo), three reporting managers (Berkshire,
JPMorgan and Pershing), and March/June 2026 quarter-end snapshots. The configurable
catalog is `shared-investor-catalog.json`; this is selected coverage, not a
market-wide ownership dataset.

The source holdings release is `hf-81419654165699005c66c200`. The initial shared
release is `si-debb34cfab59ad60d3e17d98`: a 20,907-byte index and 42 lazy evidence
files totalling 621,511 bytes, containing 363 selected source-row references.
All investment quantities and dollar amounts come from Form 13F, not Schedule 13G.

Identity is an exact issuer CIK / CUSIP match verified against eight official
Schedule 13G XML cover sections. The catalog gives finite mapping validity dates;
expanding collection past these dates requires reviewing the mapping. It is not
automatically extrapolated. Alphabet's two classes retain separate quantities.
Only explicitly mapped common-equity securities in share units with no put/call
indicator are eligible. No company-name similarity matching, options conversion,
ownership percentages or inferred votes are used.

Company name, SIC and current business-address state come from captured SEC
submissions profiles. Street addresses and signatures stay private. The cloud
group is a curated subset of providers named in Backblaze's March 2026 10-Q;
the exact short excerpt and official filing link accompany the definition. These
are multi-business companies, not pure cloud investments. The bank group uses
captured SIC 6021 classifications. Both groupings are held fixed when comparing
earlier quarters; neither claims an exhaustive competitive market.

Each manager/company/quarter has one of four explicit statuses:

- Reported position: at least one eligible class has positive reported quantity.
- Zero quantity reported: eligible rows exist but no positive quantity.
- Not listed: no eligible rows in an otherwise usable collected report. Not proof
  the manager held nothing; confidential and small holdings can be omitted.
- Unavailable: missing report, notice, unresolved holdings report, invalid amounts
  or out-of-interval mapping. Never a zero or an inferred exit.

Overlap trends use the same managers with usable records in **both** quarters for
the selected company pair. Pershing's June notice therefore does not produce an
invented investment exit. For Alphabet/Amazon, the stable cohort reports one
shared manager in each quarter; unbalanced observed counts are two then one.
Both numbers and the exclusion are inspectable. A manager is counted once even
when it reports multiple classes/discretion rows. Managers may report related or
client holdings; they are not assumed independent beneficial owners and amounts
are never aggregated across managers as a stake in a company.

## Local pipeline and portable contract

Run from `sites/AntiWorkProTwerk`:

```powershell
# Refresh the upstream holdings collection separately when required.
npm run civic -- holdings --plan docs/plans/platform/holdings-managers.json

# Capture official metadata and project the current, frozen holdings release.
npm run civic -- shared-investors --plan docs/plans/platform/shared-investor-catalog.json --holdings public/data/holdings

# Replay cached original metadata without network requests.
npm run civic -- shared-investors --plan docs/plans/platform/shared-investor-catalog.json --holdings public/data/holdings --offline

# A portable input needs no source files, network, database or model.
npm run civic -- shared-investors --input .local/shared-investors/input.json --workspace .local/shared-investors-replay --output .local/shared-investors-replay/public
```

`acquireSharedInvestors` freezes one holdings manifest, reads only hash-verified
positions/filing details and relevant source pages, and captures profiles,
identity XML and curated-group HTML through the paced SEC adapter. Original
bytes, hashes, dates and private source bodies are retained under `.local`.
`input.json` carries those captures and the selected upstream artifacts, so a
future remote job or importer can call the same projection without a service.

`buildSharedInvestors` validates metadata hashes, official URL paths, issuer
identities, group evidence, holdings artifact hashes, row privacy whitelists and
selected-position sums against exact source rows. `runSharedInvestors` writes
immutable `releases/si-…/data.json` and `evidence/<manager>-<company>-<period>.json`
before atomically replacing the manifest. Locks and compare-and-swap prevent
partial/concurrent publication. Replay preserves the release. Stale captures,
shrinking company/manager/period coverage and silent catalog-version changes
are rejected. Expanded mapping or group methodology requires an explicit catalog
version and a new capture, rather than silently rewriting the same release.

Evidence files retain filing context (including other reporting managers), exact
selected INFOTABLE rows, TSV ordinals, row hashes and upstream page hashes.
The index identifies the frozen upstream release and source archive chain.
Selected rows are projections, not copies of entire national archive pages.
The browser verifies its manifest, index and lazy evidence hashes and checks
their identities. Failed/aborted evidence requests do not replace current state.

## UI and connections

Live development route: `http://127.0.0.1:5173/records/shared-investors/`.
Root preview route: `http://127.0.0.1:4173/AntiWorkProTwerk/records/shared-investors/`.

Company/ticker/CIK search, peer groups, quarter selection, consistent-cohort
connection cards, manager/company matrix, lazy source inspector, identity
evidence and downloadable comparison recipes share the existing map/layout.
Transitions honor reduced motion. Source rows are progressively revealed.
Map counts use companies' captured business states, not manager states or
investment locations. A state filter narrows the focal company but leaves its
outside-state peers visible. Inspecting an outside-state peer clears that state
filter and explicitly selects the new focal company.

Two-way exact-manager links connect to Quarterly Holdings. Its current portfolio
view can advance independently, so the UI identifies that difference and offers
the frozen upstream index separately. Exact issuer-CIK links join covered
Microsoft/JPMorgan insider records; these roles do not imply coordinated trading.
Two-way regional paycheck links are geographic context, never causal claims.

## Verification

Eight dedicated synthetic tests cover stable cohorts, notices, options/units,
mapping windows, exact large amounts, metadata/identity/classification failures,
curated-excerpt verification, privacy, immutable replay, stale/scope/version
guards, lazy-reader integrity/abort behavior and XML transport/offline replay.
Rehashed projections are also checked for privacy leaks and position/source-row
amount mismatches; a fresh unrelated capture cannot hide stale company metadata.
The full code suite currently passes 144 tests; typecheck has zero errors/warnings.
Both independently built sites pass the root production build.

All 54 browser regressions pass, including three dedicated scenarios: real evidence and map persistence across
crosslinks; phone notice/retry/download/search behavior; and state/quarter coverage
semantics. Screenshots were inspected at 1672×941 and 390×844; the U.S. map loads,
mobile comparison cards fit without horizontal overflow, and source rows remain
readable. Each of the 42 public evidence hashes and all 363 projected source-row
hashes was independently checked. Offline replay and isolated portable import
produce the same release.

Production timing report `.local/shared-investors/performance/latest.json`
(2026-09-17 01:10 UTC): desktop maximum interactions 120/96/80 ms, simulated phone
104/88/64 ms; encoded HTML 17,172 bytes. Initial readiness: desktop 242–269 ms,
phone 1.64–1.90 s. Maximum long tasks: desktop 202/67/73 ms and phone 127/179/119 ms.
All six runs have no page errors. Phone simulation uses 4× CPU throttling, 1.6 Mbps
download, 80 ms latency and software WebGL; these are local lab observations, not
field INP or physical-device measurements. The first timing script attempt
selected a notice row because its manager locator also matched a company name;
that locator was corrected to target the manager heading before these six runs.

Performance commands must run without concurrent builds:

```powershell
npx tsx scripts/civic/lobbying-performance.ts --shared
npx playwright test
```

These tests do not establish nationwide coverage, independent ownership or causal
inference. Fresh acquisition can encounter SEC rate limits; preserve the previous
release and rerun later. Offline replay remains available.
