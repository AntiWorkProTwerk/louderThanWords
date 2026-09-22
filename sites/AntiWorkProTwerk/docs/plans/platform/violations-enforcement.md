# Violations vs. Enforcement — product 32

Route: `/records/enforcement/`; root preview: `/AntiWorkProTwerk/records/enforcement/`.

## Experience and scope

A local TypeScript job acquires complete, explicit EPA ECHO facility queries and
their detailed reports. The Svelte page places reported compliance quarters beside
dated monitoring/inspection, informal-response and formal-action entries. Year bars
and quarter-to-response filters let readers investigate the sequence without
claiming that a same-window response addressed a particular finding.

Search names, cities and exact program IDs; filter by state, program, or at least
two reported noncompliant quarters in one program source. That threshold never
adds quarters across permits, and recurring status can represent an unresolved
issue rather than separate violations. Each selected record includes original
status strings, refresh dates, table coverage, exact source fields, separate case
history, per-row penalty amounts and downloadable captured evidence.

The persistent map uses EPA facility coordinates, with filtered state-count
anchors. Points open the matching facility evidence; the list supplies a keyboard
alternative. These are not exposure areas, water-service boundaries, severity or
violation-rate estimates. Reduced motion is respected, phone quarters scroll with
44-pixel touch targets, and obsolete detail requests cannot replace a new selection.

Two-way state navigation connects to Economy vs. Paycheck, and a context link opens
the environmental Rulebook collection. Neither is an entity join or causal finding.
No shared cross-facility case identity was found in the initial collection, so no
case-network lines or guessed corporate-family links are drawn. The source adapter
can support future products 16/33/37/38; it does not implement them by itself.

## Sources and interpretation

Official source references checked September 16, 2026:

- [ECHO web services](https://echo.epa.gov/tools/web-services).
- [Detailed Facility Report API](https://echo.epa.gov/tools/web-services/detailed-facility-report).
- [DFR data dictionary](https://echo.epa.gov/help/reports/dfr-data-dictionary).
- [Report help and coverage](https://echo.epa.gov/help/reports/detailed-facility-report-help).
- [Refresh information](https://echo.epa.gov/resources/echo-data/about-the-data).

Queries use `echo_rest_services.get_facilities`, `get_qid` for complete result
pages, and `dfr_rest_services.get_dfr` with `p_gt5yr=Y`. NAICS prefix is **p_ncs**,
not p_naics. `get_qid` can say Working with complete returned rows: completeness
requires matching QueryID, PageNo, QueryRows, unique IDs and exact returned counts.

The exact FRS permit supplies identity and coordinates when available. EPA can
return a program ID in RegistryID when no FRS linkage exists; preserve that ID and
its actual source system. Linked program addresses/industry codes can match a
query even when the displayed FRS city differs. Names do not establish ownership.

EPA program tracking and refresh periods differ. A recorded violation may be
alleged rather than finally adjudicated. Missing federal entries are not evidence
of compliance or agency inaction. Quarter dates come directly from each source;
the additional CWA quarter is provisional. Other programs' additional quarters
are not automatically given that label. Open periods are identified at capture.

In the captured API responses, inspections/notices can cover ten years while
FormalActions stays five years despite the longer-history request. Separate case
histories overlap response records. Penalties can recur across permits or apply
to multi-facility cases. They are never summed into a facility total. Year bars
count returned rows, not distinct cases, rates or like-for-like complete years.
Unknown values are null, not zero; source placeholder dates remain in raw evidence.

## Local and future-job pipeline

From `sites/AntiWorkProTwerk`:

```powershell
# Acquire or refresh the complete named queries, including previously tracked IDs.
npm run civic -- echo --plan docs/plans/platform/echo-chemicals.json

# Rebuild from archived acquisition; no EPA request or model invocation.
npm run civic -- echo --plan docs/plans/platform/echo-chemicals.json --offline

# Import a portable capture into an isolated workspace/public-output directory.
npm run civic -- echo --input .local/echo/input.json --workspace .local/echo/replay-verification --output .local/echo/replay-verification/public --offline
```

`acquireEcho`, `buildEcho` and `runEcho` are reusable functions, with injectable
transport for tests or a future task runner. No database, API key, AI or hosted
service is needed. A recipe declares state/city/NAICS/active queries and a facility
limit (maximum 500). Exceeding the limit fails rather than publishing a top-N slice.
For nationwide scale, use EPA bulk downloads through a separate validated adapter;
this bounded API collector does not claim nationwide acquisition.

Raw exact-response text, SHA-256, URL and retrieval time are archived under ignored
`.local/echo/raw/`. `acquisition.json` holds query pages and complete reports;
`input.json` holds the last validated portable input. Prior facilities must be
refreshed even outside current discovery. Changes distinguish added, changed and
retained records; a changed source projection is not called a newly occurred event.

Acquisition uses two report workers, a workspace lock, exact official URLs, no
redirects, 60-second timeouts and a 20 MB response limit. Failure stops new work,
waits for in-flight archive writes, and cannot publish partial acquisition. Schema,
hash, identity, pagination and scope failures preserve the previous public manifest.
Identical captures replay deterministically; changed evidence at the same capture
timestamp and older/scope-mismatched refreshes are rejected.

Public contract:

```text
public/data/echo/manifest.json
public/data/echo/releases/ep-<24 hash characters>/data.json
public/data/echo/releases/ep-<24 hash characters>/facilities/<source-id-lowercase>.json
```

Manifest and content hashes pin immutable releases. The browser loads only the
small collection index initially; one hash-verified detail loads on selection,
with an eight-entry cache, retry and cancellation. Large raw source tables render
only when expanded. Publication completes all attachments before replacing the
manifest. Outputs are ordinary JSON, independent of the frontend or job runner.

## Captured baseline and verification

Collection started `2026-09-16T22:12:50.3Z`:

- Active-facility NAICS 325 queries: Deer Park TX 20, Richmond CA 30, Sauget IL 9.
- 59 distinct records, 1,834 response rows, 144 program-ID quarter series.
- 19 facilities have at least two reported noncompliant quarters in one source.
- 58 FRS identities and one program-only identity, RCRAInfo `CAC003402119`.
- All 59 records have reported coordinates. This nonrandom collection is selected
  by geography/industry/activity, not by violation outcomes.
- Release `ep-7eb9f0705b6dc39f912183eb`.
- Data SHA-256 `7eb9f0705b6dc39f912183eb0ff88b3955c3949daca226f146610088560b9e38`.

Offline replay and isolated portable import produced that identical release/hash.
Eight EPA tests and all 113 repository code tests pass. EPA browser tests cover
desktop/phone navigation, map continuity/counts, lazy fetching, exact source
periods, duplicate penalty rows, program-only identity, failed-detail retry,
invalid dates, absent state coverage and stale-response isolation.

The full 42-case browser run had 41 passes and one strict-selector failure after
adding a second, distinct quarter-status explanation. The selector was corrected;
all three final EPA browser tests then passed, including a real rendered-map point
click calculated from source coordinates and the current camera. No selection
handler was invoked directly. Site typecheck has zero errors/warnings; the root
production build completed both independent sites without coworker-site edits.

Production lab command (run after the two-site root build, with preview on 4173):

```powershell
npx tsx scripts/civic/lobbying-performance.ts --enforcement
```

It uses three desktop and three simulated phone runs, software WebGL, reduced
motion, and phone 4× CPU / 1.6 Mbps / 80 ms latency. Reports go to ignored
`.local/enforcement/performance/`. These are local lab samples, not physical-device
or field-INP guarantees. Final production/build results are recorded in the ledger.

Final measured samples (run 1 / 2 / 3): desktop ready 327 / 251 / 260 ms, LCP
480 / 176 / 176 ms, maximum Event Timing interaction 136 / 80 / 120 ms. Throttled
phone ready 1,984 / 1,606 / 1,578 ms, LCP 1,328 / 1,160 / 1,144 ms, maximum
interaction 96 / 80 / 80 ms. Initial compressed HTML is 22,908 bytes; no page errors.
Screenshots were inspected at 1672×941 and 390×844, including a program-only
facility detail. Both existing local servers remain running.
