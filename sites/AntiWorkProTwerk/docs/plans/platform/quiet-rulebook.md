# The Quiet Rulebook — requirement 6

Development URL: `http://127.0.0.1:5173/records/rules/`. Production uses the contributor path from the shared site registry. No teammate source directory was edited for this product.

## What is implemented

Agency rules, proposals and notices are searchable by source title, summary, action, topic and identifiers. Each record distinguishes publication date, indexed effective date, indexed comment deadline, and the agency's complete dates paragraph. Missing fields stay missing. A partial postponement is not converted into a delay of the whole rule; a proposal is not presented as operative law. Withdrawals and corrections remain separate recorded actions, not deletions.

Source passages retain mixed-content order and normalize whitespace. The reader separates agency summary, dates, supplementary explanation and regulatory text. Marked amendatory instructions are highlighted, with their accompanying text available. Tables are flattened with cell separators; the official PDF remains necessary for layout, images, equations and legal research. This is not a reconstruction of today's consolidated CFR and does not guess the prior text of an amended provision.

Shared docket IDs, RINs and explicit correction references connect documents. CFR references are citations, not proof of a text version. Exact EPA-HQ docket links open Regulations.gov for future comment-to-rule integration (#8/#9). These keys can also anchor future rule-claim retrieval (#36). Similar wording alone does not create a relationship or an influence claim.

The existing persistent map, evidence sheet, typography, navigation and reduced-motion behavior are shared. Rules currently have no verified impact-location mapping, so the map provides geographic context and a route back to representatives. Selecting a state does not filter these records, create fake state counts, or imply applicability. Rulebook's geographic selection uses pale violet so the large heading remains readable. No agency-headquarters point is mislabeled as a place affected by a rule.

## Source and actual collection

The [Federal Register API](https://www.federalregister.gov/developers/documentation/api/v1) requires no API key. Its XML is an informational rendition; the UI also links every record to the official GovInfo PDF. See the [source's legal-status explanation](https://www.federalregister.gov/reader-aids/government-policy-and-ofr-procedures/about-this-site).

Recipe `rules-tce.json` selects EPA documents matching `trichloroethylene`, published December 1, 2024 through June 30, 2025. It captured all 8 matches in that query, not every TCE action or every rule. Search terms can occur in secondary discussion, so a match does not establish the principal subject. The date window is explicitly historical; extend `through` in the same collection to discover later records.

Real baseline release: `rr-5d744b60aaf09f0e2b0ce7e3`, captured September 16, 2026. Eight documents: seven source-classified rules and one proposed rule; 2,969 extracted passages; 23 marked amendatory instructions; seven source topics. No observed-change events exist at baseline. Examples include the [original TCE rule](https://www.federalregister.gov/documents/2024/12/17/2024-29274/trichloroethylene-tce-regulation-under-the-toxic-substances-control-act-tsca) and [June partial postponement](https://www.federalregister.gov/documents/2025/06/23/2025-11437/extension-of-postponement-of-effectiveness-for-certain-provisions-of-trichloroethylene-tce).

The June postponement's indexed effective date is null, while its dates paragraph explicitly describes August 19, 2025 and the affected conditions. This is why the quoted paragraph is prominent. It is a historical statement, not a claim about present legal effect.

## Local pipeline / future job contract

From `sites/AntiWorkProTwerk`:

```powershell
# Discover, refresh retained IDs, archive sources, validate, publish.
npm run civic -- rules --plan docs/plans/platform/rules-tce.json

# Reproduce the last acquisition without HTTP requests.
npm run civic -- rules --plan docs/plans/platform/rules-tce.json --offline

# Process a supplied acquisition envelope.
npm run civic -- rules --input .local/rules/acquisition.json

# Run a separate collection or experiment without replacing this one.
npm run civic -- rules --plan PATH-TO-RECIPE.json --workspace .local/rules-other --output .local/rules-other/public
```

`runRules` in `scripts/civic/rules.ts` is the portable job boundary. Input schemas accept a collection plan or captured metadata/XML with source URLs, timestamps and hashes. It needs only a filesystem and, for online acquisition, public HTTP access. No database, model, hosted scheduler, account or credentials are required.

Keep the previous output directory when updating: it is the tracking baseline, and its historical text artifacts are dependencies. A future remote task can download this artifact directory, run the same function, and upload the new immutable payloads before the manifest. A fresh output directory intentionally starts new tracking.

Bounds are explicit: 1–100 records per discovery page, 1–10 pages, and up to 1,000 tracked IDs (default 200). All previously tracked IDs are refreshed even outside the discovery page window. Missing retained records fail the job; absence never establishes withdrawal. Increasing the end date/page limits is allowed without losing history. Changing collection ID, query term, agency or start date requires a separate output directory.

The adapter restricts hosts, paths, identity and query parameters, rejects redirects, limits individual responses to 12 MB, retries transient network/429/server failures, and rejects malformed XML, external entities, duplicate identities, checksum mismatches, incomplete tracking input and stale/conflicting observations. A newer observation of one asset cannot hide a changed stale counterpart. Source responses and the normalized acquisition envelope are retained privately under `.local/rules`.

`public/data/rules/manifest.json` points to immutable `releases/rr-<hash>/data.json`. Paragraph arrays are separate immutable `texts/<hash>.json` files. The index and text are schema/hash checked in the browser; source text is fetched only when a document is opened, with cancellation on selection change. Historical text dependencies are checked before publication. Optimistic predecessor validation prevents a stale job from replacing a newer release.

The current index is 17,661 bytes / 5,000 bytes gzip. All eight text artifacts total 1,302,552 bytes; the largest is 570,490 bytes / 127,493 bytes gzip. Only the selected document's text is requested, and 40 passages render at a time. Search results render in batches of 24.

## Subject following and updates

Followed topics and read fingerprints are stored only in this browser's local storage. Export/import supports moving the watchlist and read state. Existing matching records establish the baseline when following starts; clicking **Check for updates** loads the latest published artifact, not the external API or a model. Later new or materially changed matching records appear as unread. **Mark updates read** persists acknowledgement. API page-view counters alone do not create alerts.

Some important notices have no topic tags, including the two TCE partial postponements in this sample. Following therefore includes directly tagged documents plus one explicit docket/RIN/correction hop. Indirect matches are labeled in the list. Original topic arrays remain untouched; this is evidence-based linkage, not model-generated classification. Users can inspect the exact connection in the detail timeline. The **Source topic** filter still filters only source-assigned tags.

There is no email subscription, browser-push service or automatic remote job yet. Acquisition must run locally (or later under a scheduler) to publish updates. The UI states this directly. A fixed historical date window does not discover later publications until extended, although retained records are refreshed.

## Verification

Six `civic-rules` tests cover mixed-content and table parsing, omitted-text markers, contact exclusion, XML safety, unknown dates, explicit identifier joins, baseline/new/revised records, topic alerts including untagged withdrawal notices, counter-only updates, offline-equivalent replay, incomplete/stale/unsafe input rejection, retained-ID refresh, publication-pointer preservation, base paths, text identity and hash failures.

Browser tests inspect actual source dates/PDF links, lazy loading and bounded rendering, docket/RIN timelines, unchanged record counts when changing geographic context, the same map canvas across routes, phone overflow, reduced motion, local watch persistence, simulated later-snapshot alerts, read acknowledgement, export, and invalid-import preservation. The simulated update is intercepted only inside the test and is not written to public data. Real offline replay reproduced the baseline release hash.

This completes the local behavior for configurable bounded collections, not a nationwide current-impact map or a hosted notification service. Other numbered products and the legislative evidence gaps in the platform ledger remain open; this does not complete the overall 40-product goal.

September 16 verification: 53 unit/integration tests passed; Svelte check returned zero errors and warnings. The full 18-test browser suite passed, followed by another successful run of both rulebook browser tests after the untagged-notice following change. The root production command built both independent sites. Screenshots were inspected for desktop/phone layout and the map-heading contrast fix. The existing dev server remained running on 127.0.0.1:5173.
