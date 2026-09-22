# Nursing Home Owners — product 28

Route: `/records/nursing/`; root preview: `/AntiWorkProTwerk/records/nursing/`.

## Scope and experience

A reusable local TypeScript job acquires five official CMS CSVs and joins facilities,
enrollments and disclosed parties by identifiers. The Svelte page follows a party
across differently named facilities and compares reported staffing, inspection
findings and penalties. It implements the plan's **across an owner's facilities**
alternative. A current ownership snapshot cannot establish historical before/after
ownership effects; the UI explicitly refuses that interpretation.

Users can choose a featured organization, search all disclosed party names/IDs,
switch ownership/management/financial/other roles, filter by state and facility,
inspect source rows and reporting periods, and follow another party from a facility.
The largest displayed portfolios are counts within the collected states, not
national ownership rankings. Direct and indirect interests can overlap. Each CCN
is counted once per selected party/role group; percentages are not added.

The persistent U.S. map shows actual CMS facility coordinates and state-count
anchors. Optional lines group facilities linked to the selected source-party ID.
The first facility is only a drawing anchor, not headquarters or a controlling
parent. Point popups can open the facility evidence. The list is the keyboard and
non-map alternative. Motion respects reduced-motion preferences.

Two-way state links connect to Economy vs. Paycheck. Shared geography is context,
not an employer/entity join or an explanation of quality or wages. No inferred
connection to WHD employers, LDA organizations or political committees is published.
CMS's PAC identifier means PECOS Associate Control; it is not an FEC committee ID.

## Primary sources and semantics

- [SNF All Owners](https://data.cms.gov/provider-characteristics/hospitals-and-other-facilities/skilled-nursing-facility-all-owners),
  [July 2026 dictionary](https://data.cms.gov/sites/default/files/2026-07/SNF_All_Owners_Data_Dictionary.pdf).
- SNF Enrollments, discovered from the exact title in the [CMS catalog](https://data.cms.gov/data.json).
- [Provider information](https://data.cms.gov/provider-data/dataset/4pq5-n9py).
- [Data collection intervals](https://data.cms.gov/provider-data/dataset/qmdc-9999).
- [Penalties](https://data.cms.gov/provider-data/dataset/g6vv-u9sr).
- [Quality-data dictionary](https://data.cms.gov/provider-data/sites/default/files/data_dictionaries/nursing_home/NH_Data_Dictionary.pdf).

Enrollment ID joins owners to enrollments; CCN joins enrollments to quality records;
ten-digit owner PAC connects differently named disclosures. Documented fixed-width
numeric identifiers are zero-padded. Extended CCNs with suffixes are **not** truncated
or fuzzy-matched. Conflicting provider PACs, duplicate facility/enrollment IDs,
ambiguous catalog releases and mismatched quality release periods fail publication.

Owner roles remain literal source codes/text. Ownership includes partnership and
direct/indirect ownership codes, not managers, mortgages or security interests.
Blank percentages/measurements are null, not zero. Association dates are reported
relationship dates, not automatically acquisition dates. CMS's last-12-month
ownership-change flag is separately labeled. Owner addresses are not projected.

Staffing is reported hours per resident per day, not case-mix adjusted. Medians
show nonmissing/total denominators and include zero observations. Regional comparison
uses all collected facilities in the selected state, not a national benchmark.
Cycle 1 health deficiencies combine the most recent standard survey and applicable
complaint/infection-control windows. Prior cycle 2/3 figures have different windows
and are not plotted as a like-for-like trend. Penalty details cover the source's
last-three-year window, with fines and payment denials distinguished. No quality
causation, compliance certification or care recommendation is inferred.

## Captured baseline

Recipe: `docs/plans/platform/nursing-cms.json` — CA, IL, TX; complete selection from
the national source files, not a ranked top-N sample.

- Captured `2026-09-16T21:28:03.365Z`; August 2026 source releases.
- 3,008 facilities: CA 1,165; IL 666; TX 1,177. All have coordinates in this capture.
- 2,934 exact enrollment joins; 74 unjoined facilities remain visible.
- 55,726 association rows; 16,580 unique disclosed party IDs, not all equity owners.
- 3,524 party IDs have no name in the source (2,015 organizations and 1,509
  individuals). They remain connected by exact ID and display “Name not reported”; no
  name is invented. Search accepts the ID even when name search cannot find it.
- National inputs: 14,410 enrollments; 295,083 owner rows; 14,690 provider rows;
  47 interval rows; 15,696 penalty rows.
- 169 national enrollment records have unsupported CCN formats. Ten distinct
  selected-state enrollment CCNs lack a provider match, including extended IDs.
- Staffing measurement period: January 1–March 31, 2026. This is not the capture date.
- Release `nh-5bc9fb60c51bcc5977f2817b`; full dataset SHA-256
  `5bc9fb60c51bcc5977f2817b612259ff401a1432c93612c4fe0daadb81dd5526`.

The preceding release is retained. This release corrects unjoined-CCN diagnostics
to retain the original extended identifier instead of an empty string; facility,
party and source evidence is unchanged.

## Local and future-job interface

Run from `sites/AntiWorkProTwerk`:

```powershell
npm run civic -- nursing --plan docs/plans/platform/nursing-cms.json
npm run civic -- nursing --plan docs/plans/platform/nursing-cms.json --offline
npm run civic -- nursing --input .local/nursing/input.json --offline --workspace .local/nursing-import --output .local/nursing-import/public
```

`acquireNursing`, `buildNursing` and `runNursing` separate transport, projection and
publication. A future remote job can invoke the same entry point without a database,
credentials, scheduler deployment or AI. A different state scope uses separate
workspace/output paths; an existing collection rejects scope changes/stale captures.

Ignored `.local/nursing/` retains metadata text and original CSV bytes encoded as
base64, SHA-256 checksums, deterministic UTF-8/Windows-1252 decoding, acquisition
input and portable normalized input. CSV row numbers are one-based data records
excluding the header, not physical lines (quoted fields may contain newlines).

Public `data/nursing/manifest.json` atomically points to immutable releases containing:

- `data.json`: complete portable projected dataset, about 726 KB gzip.
- `index-v1.json`: compact tuple index, about 145 KB gzip; excludes full party catalog
  and random per-facility detail hashes from initial browser hydration.
- `parties-v1.json`: complete party search catalog, about 424 KB gzip, loaded only
  after explicit party search.
- `parties-v1/00..3f.json`: exact-party lazy shards.
- `facilities-v1/00..3f.json`: lazy facility/evidence shards, including associations,
  enrollments, survey dates, penalties, footnotes and source-row fingerprints.

All attachments are hashed in the manifest and bound to the parent dataset hash.
Readers reject corrupt bytes, cross-release files, wrong partitions, duplicate
identities, invalid references and detail/index disagreements. An eight-shard LRU
cache is per reader; aborted/stale responses cannot replace the active selection;
failed requests are retryable. The portable full dataset remains independently
downloadable. Previous generated evidence files are not destructively removed.

## Verification

Eight dedicated code tests cover exact joins, conflicting identities, role grouping,
null/zero medians, privacy projection, release periods, hashes, encoding, diagnostics,
replay, failure-preserving publication, compact index, lazy validation/cache/abort
and retry. The full code suite passed 105 tests; Svelte check reported no errors or
warnings. Four targeted browser tests passed, covering desktop/phone, portfolio map
points/links, actual evidence, catalog search, role changes, lazy loads, retry,
reduced motion, state coverage, viewport bounds, persistent-map navigation, delayed
obsolete detail responses and exact-ID browsing of unnamed source parties.

Offline replay and a separate portable-input import both reproduced the exact
published dataset hash. The final root production build passed for both existing
sites; coworker site directories were unchanged. The full-browser regression passed
38 tests, including the deliberately delayed obsolete-facility-response test. A
final four-test nursing rerun also passed after adding the unnamed-party display
test. No failed browser case is being omitted from these counts.
An additional real pointer probe opened a CMS map-point popup for CCN `675800`
(La Vida Serena Nursing and Rehabilitation) and used its button to load the same
facility's verified detail panel, confirming the map-to-evidence action itself.

Production timing command:

```powershell
npx tsx scripts/civic/lobbying-performance.ts --nursing
```

Three fresh desktop contexts and three emulated phones ran against the root preview,
not Vite development mode. The phone profile is 390×844, 4× CPU slowdown, 1.6 Mbps
download, 80 ms latency; software WebGL and reduced motion are explicit. Raw results
are retained in ignored `.local/nursing/performance/`.

| Measurement | Desktop runs | Throttled phone runs |
|---|---|---|
| Hydrated controls ready | 475 / 328 / 324 ms | 3,325 / 3,190 / 3,241 ms |
| LCP | 472 / 184 / 204 ms | 1,580 / 1,272 / 1,244 ms |
| Maximum observed interaction duration | 128 / 56 / 56 ms | 96 / 80 / 112 ms |
| Compressed initial HTML | 167,663 bytes | 167,663 bytes |

All six runs reported zero browser errors. The sampled LCP and interactions are
within 2.5-second/200-ms lab targets, but the roughly 3.2–3.3-second throttled hydration
is separately reported, not hidden by the LCP result. These are small lab samples,
not physical-device or field-p75 guarantees. Existing performance investigations
for other products remain open; this product's timings do not resolve them.
