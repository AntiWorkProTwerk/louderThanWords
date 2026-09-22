# Your Water System’s Record — product 33

Route `/records/water/`; root production preview `/AntiWorkProTwerk/records/water/`.

## What it does

Search public water systems by name, PWSID or collected county association. Filter
by system type, jurisdiction, and violation category. A system's history separates
contaminant/disinfectant limits, treatment requirements, monitoring, reporting,
and other obligations. Each record preserves its exact source category, decoded
rule/contaminant/violation descriptions, dates, status, historical value/units when
provided, source-row locators and linked enforcement/resolution actions.

The year chart counts unique system + violation IDs by reported interval start,
not enforcement rows, annual rates or current water quality. A violation with
several linked actions is counted once. Action-only rows without a violation ID
appear separately; no synthetic violation is invented. Status explanations preserve
the distinction between Resolved, Addressed, Archived and Unaddressed. None is a
live tap-water safety determination. A monitoring record naming a contaminant is
not evidence that it was detected above a limit.

The persistent U.S. map shows filtered system counts at state-jurisdiction anchors.
The official archives used here have no coordinates or service-boundary polygons;
mailing/contact addresses are not geocoded or exposed. PWSID state prefixes are
explicitly labeled as jurisdictions. Geography is not an exposure/safety map.
County associations shown are those matching the declared collection, not a
complete service area. Numeric regional/tribal-prefix IDs outside this state/county
recipe are not represented; the general ID contract preserves nine-character IDs.

Two exact PWSID matches connect this release to the EPA facility explorer: Equistar
`TX1012680` / FRS `110034641635`, and `TX1011097` / FRS `110038705817`. The join uses
the facility's SDWA source ID, not its name or approximate location. Different
capture dates/windows remain explicit. EPA SDWA quarter views link back to a water
ID lookup, which reports unavailable IDs honestly. Rulebook navigation is general
environmental context, not a claim that a particular rule applies or caused a record.

## Sources and selection

Official [EPA downloads](https://echo.epa.gov/tools/data-downloads) and the
[SDWA dictionary](https://echo.epa.gov/tools/data-downloads/sdwa-download-summary)
were checked September 16, 2026. The two public archives are:

- `https://echo.epa.gov/files/echodownloads/SDWA_latest_downloads.zip`
- `https://echo.epa.gov/files/echodownloads/SDWA_system_search_download.zip`

The pipeline reads complete CSV members for public-water-system inventory,
geographic areas, reference codes, violations/enforcement, and the separate system
search/FRS crosswalk. It verifies ZIP member CRC/size and checks the whole downloaded
archive's SHA-256. The search archive contributes identities only; no undocumented
quarter-status string is interpreted. Inventory administrative contacts, email,
phone and mailing-address fields are excluded from the portable/public projection.

The recipe selects all active CWS, NTNCWS and TNCWS systems reporting Harris County
(TX), Contra Costa County (CA), or St. Clair County (IL). Blank county-state values
use the documented PWSID jurisdiction prefix. This is an explicit, nonrandom
geographic collection, not a selection by violation outcome. Previously collected
systems remain refreshed even outside current discovery; disappearance from the
inventory fails instead of silently dropping them. Population fields are not summed.

Violation intervals overlap January 1, 2020–June 30, 2026, or have boundaries that
cannot reliably exclude them. The source has `--->` date placeholders: normalized
dates remain null and the original cells remain visible. Reversed intervals remain
unmodified, flagged as inconsistent, and grouped under Unknown in the year chart.
They are not silently repaired or discarded. Separate action-only rows use their
own action-date window; unknown dates remain, with older/later row counts disclosed.

The `2026Q2` label identifies the archive's submission snapshot, not the time of all
events. First/last-reported dates are not occurrence dates. Historic measurements,
reported limits and units are kept verbatim without converting them into a present
water-safety judgment. Missing records are not a clean bill of health.

## Reusable local pipeline

From `sites/AntiWorkProTwerk`:

```powershell
# Download both official archives and publish a validated collection.
npm run civic -- water --plan docs/plans/platform/water-counties.json

# Verify and rescan saved archives without government/model requests.
npm run civic -- water --plan docs/plans/platform/water-counties.json --offline

# Fast, portable replay of a validated selected-row capture into isolated output.
npm run civic -- water --input .local/water/input.json --workspace .local/water-replay --output .local/water-replay/public --offline
```

`acquireWaterSource`, `acquireWater`, `buildWater` and `runWater` are reusable local
functions with testable transport. No database, API key, AI or remote task service
is required. The same functions can be invoked by a future job runner. The recipe
sets county/type/activity/date scope and a system limit; overflow fails rather than
publishing a top-N sample. Bulk scanning is intentionally outside web requests.

Workspace locks, official fixed URLs, redirect rejection, timeouts, archive/member
caps, duplicate/header/quarter checks, identifier conflicts and hash checks protect
publication. Unknown categories retain their literal codes. The selected input
includes archive receipts, complete scanned row counts, projected-row hashes and
physical CSV row numbers excluding headers. Hashes establish replay integrity, not
an independent certification of EPA's underlying accuracy. Raw archives stay local.

Public contract:

```text
public/data/water/manifest.json
public/data/water/releases/sw-<24 hash characters>/data.json
public/data/water/releases/sw-<24 hash characters>/systems/<pwsid-lowercase>.json
```

Immutable attachments complete before atomic manifest publication. The browser
loads the collection index first and one verified detail on selection, caches eight
details, retries failures and cancels obsolete requests. Lists/history are paged;
raw violation fields are only mounted on request. Public output is portable JSON,
independent of the frontend, storage backend or job runner.

## Initial real release

- SDWA archive: 423,774,232 bytes; last modified July 9, 2026; captured
  `2026-09-16T22:40:52.919Z`; hash
  `a18a20f9091c2e0466c91c83d0bac5651473441642331d09504e447a6e2ac7a4`.
- Search archive: 35,024,275 bytes; last modified September 13, 2026; captured
  `2026-09-16T22:42:07.699Z`; hash
  `7151e8800376b86ac97e45860480e77ab3361c02ac5c5c2797169641058e813b`.
- Complete scan: 434,040 inventory rows, 578,198 geography rows, 2,376 reference
  codes, 434,040 search rows and **15,432,737** violation/enforcement rows.
- 1,449 selected systems: TX 1,312, CA 84, IL 53. 574 have no matching violations
  in this capture/window; that is not a safety finding.
- 10,406 unique violations from 31,377 linked rows: 161 limit, 345 treatment,
  7,135 monitoring, 293 reporting and 2,472 other-category records.
- 331 inconsistent intervals and 952 arrow-ended violation records remain explicit.
- 233 action-only records within/with unknown dates for the action window;
  4,056 older/later action-only rows outside it are separately counted.
- Release `sw-bbf88af18cd3b03db236c0fd`; data SHA-256
  `bbf88af18cd3b03db236c0fd7463c147ed6e0ddbf1b40df828afe818d3cad496`.

Seven dedicated water tests and all 120 code tests pass. Desktop/phone browser
checks cover real exact-ID round-trip links with one map, category distinctions,
lazy detail loading, retry/stale-response isolation, historical-value warnings,
empty geographic coverage and no horizontal overflow. Screenshots were inspected
at 1672×941 and 390×844. Site typecheck reports zero errors/warnings.

Production performance command after building both sites:

```powershell
npx tsx scripts/civic/lobbying-performance.ts --water
```

This measures three desktop and three simulated phone runs (4× CPU, 1.6 Mbps,
80 ms latency, software WebGL and reduced motion); it is not a field-INP or physical
device guarantee.

## Final verification

- The completed offline national rescan retained/refreshed all 1,449 existing IDs
  and reproduced the same release. Its saved acquisition accounts for all five
  complete tables, including 15,432,737 violation/enforcement rows and 35,666
  selected rows. Original archive hashes were independently rechecked after the
  source-receipt rename to `search-source.json`.
- Isolated portable replay into `.local/water-replay/public` reproduced the same
  release and data hash. A separate full artifact audit verified every one of the
  1,449 attachment hashes, schemas and index/detail identities, including 10,406
  violations, 233 standalone actions and 331 reversed intervals.
- All 120 code tests and the root two-site production build pass after the final
  source-name cleanup. Final targeted browser coverage passes all six water/EPA
  tests, including the persistent-map round trip and phone retry behavior. The
  subsequent full browser regression passes all 45 tests (2.8 minutes).
- Production lab report `.local/water/performance/latest.json`, captured
  `2026-09-16T23:16:35.964Z`: desktop maximum interaction durations 120/80/88 ms;
  simulated phone 96/80/88 ms. No page errors in any of the six runs. Phone
  hydration-ready times were 3,158/3,118/3,121 ms; LCP was 1,388/1,244/1,324 ms.
  Encoded HTML was 182,472 bytes. Initial loading cost remains visible separately
  from interaction responsiveness; these measurements are not field guarantees.
- Desktop and phone screenshots were visually checked after the final history
  legend and date-warning changes. No horizontal phone overflow. Coworker site
  worktrees remain untouched; the local development and production previews are
  kept running.
