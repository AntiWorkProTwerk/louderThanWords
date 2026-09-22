# Who Votes Your Retirement? (#20) — implementation in progress

Acquisition, normalization, amendment resolution, compact publication and the CLI
are implemented and have fifteen focused tests. A real offline candidate release
`fv-dd237fee87fe035d894cea07` was produced in `.local/fund-votes/public-candidate`:
30,709-byte root index, 1,017 lazy files, 804 meetings, 16,975 proposals, 3,328
comparable proposals and 1,856 with differing disclosed direction sets. The lazy
files total 110,046,725 bytes including original row XML. It is not a browser payload
to download all at once. Candidate artifacts have not yet received an independent
full-file audit. The fund/proposal UI, map integration, crosslinks and browser/
performance verification are **not finished**. No N-PX records are on the live
website yet. This document is a checkpoint,
not a completion claim for product #20 or the forty-product plan.

## Real source collection

The explicit catalog is `fund-votes-funds.json`: thirteen fund series across
Vanguard Index Funds, Domini Investment Trust, Parnassus Funds and Parnassus Funds II.
It contains Vanguard 500 Index Fund, all four Domini series, and eight Parnassus
funds/ETFs reported in the selected period. This includes a bond-fund notice.
The choice is illustrative, not a representative market sample, recommendation
or ranking. Eligibility does not depend on how a fund voted.

The annual reporting period ends June 30, 2026; the collection examines filings
from that date through September 16, 2026. The actual annual vote interval is
July 1, 2025–June 30, 2026. Current source collection:

- 34 captured documents, 34,112,949 original bytes.
- Four registrant submissions profiles and sixteen candidate N-PX covers.
- Five in-scope covers: four fund voting reports and one fund notice.
- Eleven other Vanguard-series covers explicitly excluded by the configured series.
- 38,828 voting-record rows; every table row scanned, no first-N truncation.
- 16,975 exact-wording/security/date/source proposal groups, including 3,328
  with records from more than one selected fund. These are initial matching
  diagnostics, not an independently adjudicated benchmark.
- One source record with a positive shares-voted field but no vote directions:
  Vanguard 500’s STERIS director proposal labeled `*Withdrawn Resolution*`,
  source row 75. Its amount and source wording are preserved; its voting choice
  remains unresolved. It is not classified as a vote for, against or abstaining.

The collection succeeded after an earlier SEC HTTP 503 stopped acquisition.
Partial acquisition was never published. Another early implementation check
identified EDGAR’s two links to the same original XML (rendered and raw views);
the index parser now deduplicates equivalent same-role links, while rejecting
conflicting roles and links outside the verified accession directory.

## Authoritative references and source distinctions

The [SEC Form N-PX instructions](https://www.sec.gov/servlet/sec/about/forms/formn-px.pdf)
distinguish fund voting reports, notices, manager reports, full restatements and
added voting records. The [technical-specifications page](https://www.sec.gov/submit-filings/technical-specifications)
links the actual N-PX v3.1 XML schemas. The separate **N-PX CTR** specification
is for confidential-treatment requests, not this voting-record parser.
The correct specification ZIP is archived locally under SHA-256
`857b33522d12f6de55c54205250a61203791a77aa17fbf0df5b28fdf20b39492`.

The parser keeps exact fund-series IDs, manager serial numbers/file numbers,
report types, filing/meeting/period dates, share quantities and source explanations.
Manager file numbers are not assumed to be CIKs. A registrant can file separate
reports for different fund series in the same period.

Proposal matching currently requires the same usable CUSIP (otherwise ISIN/FIGI),
parsed meeting date, whitespace-normalized source wording, and issuer-versus-
security-holder source. Names, broad topics and approximate wording alone do
not establish a match. Distinct wording remains unmatched rather than being
silently interpreted by AI. Source categories are preserved, not inferred sentiment.

Each source row retains its complete vote-direction breakdown and manager group.
Rows reported for different manager groups can overlap. They are not added as
independent votes or converted into a majority vote. The direction helper returns
one direction, multiple directions, no shares voted, not reported, or unresolved.
It does not produce a support score. Share quantities use exact decimal arithmetic.
Missing/invalid numbers are null, not zero. Ambiguous dates remain raw text and
cannot match a proposal. Non-reconciling vote breakdowns are flagged, not repaired.

## Reusable code and local artifacts

- `scripts/civic/sec-filing-index.ts`: exact accession URLs, captured directory
  verification and XML document-role discovery, including filename case.
- `scripts/civic/fund-vote-parser.ts`: structured covers and bounded record-by-record
  parsing of large voting tables. Whole-file XML validity, unknown table children,
  explicit source limits and forbidden entity declarations are checked.
- `scripts/civic/fund-votes-acquisition.ts`: configurable acquisition, offline replay
  and portable-input normalization. Historical submissions pages overlapping the
  filing window are required. Caps and missing sources fail without truncation.
- `src/lib/civic/fund-votes.ts`: portable schemas and vote-direction semantics.
- `tests/civic-fund-votes.test.ts`: deterministic fixtures and acquisition replay.

The exported functions are `acquireFundVotes(plan, workspace, offline?, fetcher?)`
and `normalizeFundVotes(input)`. They use the existing paced SEC transport and
checksum-verified receipt/archive layout. No database, external task runner or AI
call is required. The future CLI/publication stage should call these functions,
not introduce a second acquisition implementation.

Ignored working files:

- `.local/fund-votes/input.json`: portable plan plus original captures.
- `.local/fund-votes/normalized.json`: normalized source records and exact row XML.
- `.local/fund-votes/normalization-report.json`: hashes, counts, source anomalies,
  offline replay result and explicit `publicationReady: false`.
- `.local/fund-votes/matching-report.json`: preliminary cross-fund match diagnostics.
- `.local/fund-votes/sources/`: original bytes and receipts.
- `.local/fund-votes/research/`: discovery/specification captures.

Dedicated address/contact/signature/credential fields are not copied into normalized
cover output. Original publicly filed XML stays local. Narrative explanations are
retained as evidence and are not represented as completely redacted documents.

## Verification and remaining work

Nine dedicated tests and the complete **165-test code suite passed**. Tests cover
exact quantities, separate manager groups, missing choices, withdrawn wording,
notices, amendment flags, identity/count checks, XML namespaces, caps, malformed
XML, document-role conflicts, source tampering, missing tables and no-network replay.

The real corpus also replayed identically with network access explicitly forbidden.
Captured through `2026-09-17T02:13:26.858Z`; normalized SHA-256
`0fd07576db9180491db74a7b363aa3da13905644d1483576688e9696bde8768c`.
The development normalized JSON is 89,693,284 bytes, including original row XML;
it is not an acceptable browser bootstrap payload. Compact publication and lazy
evidence are required before UI integration, rather than shipping this file to
every page visitor.

Still required before marking #20 implemented:

1. Resolve applicable full restatements versus added proxy records; ambiguous
   amendment chains must not produce a silently merged voting history.
2. Publish immutable, hash-verified compact fund/meeting/proposal indexes and lazy
   source evidence. Keep unassigned records and notice/missing states explicit.
3. Add the CLI/job entry point and update/replay safeguards for public releases.
4. Build searchable fund selection and a readable same-proposal voting comparison,
   including split directions, overlapping manager groups, source amounts,
   management recommendations, loaned shares, source wording and JSON exports.
5. Integrate the persistent map using accurately labeled registrant geography;
   connect other SEC views only through verified identifiers and dated coverage.
6. Add keyboard/focus/reduced-motion/mobile behavior, source retry/stale-request
   checks, full browser regression, both-site builds and production measurements.

The existing website remains running; no coworker site files were modified.
