Said / Did — implementation plan for louderThanWords

Research checked: September 15, 2026. This is an implementation specification, not a deployed application. Source coverage and service prices below were checked against current documentation; authenticated ingestion, parser accuracy, match yield, and operating cost still need the pilot described here. Architecture, thresholds, timelines, and budget allowances are recommendations, not measured results.

1. What to build

Build a searchable, source-backed timeline connecting a member of Congress's recorded statements with their legislative actions. Each comparison must answer four questions: What was the statement? What exactly did the person do? Why are these about the same thing? What context affects the comparison?

The core product is a permanent comparison page with the original passage, an individual vote or amendment action, a concise explanation, and links to the underlying documents. Reader value comes from assembling evidence that is otherwise scattered across government sites.

Keep three layers separate in both storage and presentation:

Layer

Example

How it is established

Source fact

A member cast Nay on a particular roll call

Official member-vote record

Connection

The passage refers to that same amendment

Explicit identifier or reviewed evidence

Interpretation

The action differs from a stated voting intention

A documented comparison with conditions and chronology checked

An exact bill match does not establish a contradiction. A contradiction does not establish dishonesty or motive. The first release should show evidence and narrowly worded comparisons without an overall politician honesty score.

There is a critical naming distinction: the Congressional Record contains both floor remarks and inserted material. The Senate explains that undelivered material can be marked by typeface or a bullet, and that the daily edition can be revised. Default the product label to “Recorded statement.” Use “Spoken on the floor” only when the available evidence supports that claim, and attach audio/video evidence if claiming the precise words were spoken. Senate explanation of the Record.

2. Scope the releases so the hard part is testable

Release

Scope

Concrete outcome

Manual prototype

Ten consecutive eligible House legislative passage votes in a fixed 119th-Congress window; preceding 30 House sitting days of statements

Five to ten carefully sourced comparison pages, if the corpus supports them

MVP

Same chamber; explicit named-bill references and individual recorded votes; all participating members eligible

Automated ingestion, a review queue, and 30–50 reviewed comparisons as a target

Policy beta

Narrow amendments and three precisely defined policy questions; extend statement lookback to 180 days where appropriate

Earlier policy positions paired with later relevant actions, with substantive context

Broader product

Senate, more policy questions, longer history, saved searches and alerts

A recurring public research service

Choose the seed window and eligibility rules before inspecting whether members agree or disagree with their own statements. Include both successful and failed passage attempts. If a vote's operative text cannot be established, log the exclusion. Do not choose only politicians or bills likely to generate dramatic examples.

A same-day “I support this bill” followed by a matching vote is a good integration test. The more valuable feature is a specific earlier position linked to a later narrow action. Treat that second capability as a separate milestone with a separate accuracy evaluation.

For the initial policy beta, investigate candidates such as congressional stock-trading restrictions, a specified prescription-drug price policy, and a specified disaster-aid appropriation. Select final topics based on actual statement volume, available text, and relevant recorded actions. These are proposed research areas, not claims that useful contradictions exist.

Do not require a map, accounts, payment processing, social-media ingestion, video transcription, or automated publication to validate the first release. A state filter can later feed your existing map interface.

3. Data sources and their boundaries

Need

Source and access

Use and limitation

Recorded statements

GovInfo Congressional Record, CREC, using the GovInfo API

Retrieve daily issues and their constituent documents, called granules; retain available text/HTML, PDF, and metadata. A granule is not necessarily one person's speech.

Bills and context

Congress.gov bill endpoints

Retrieve actions, text versions, summaries, subjects, sponsors, and related measures. Bill actions can link to official roll-call XML. A summary is supplementary; identify the text actually at issue.

House member votes

Congress.gov House roll-call endpoints, checked against House Clerk records

Current API documentation describes beta coverage of legislation-related votes in the 118th and 119th Congresses. Do not assume all historical or nonlegislative votes are included.

Senate member votes

Official Senate vote lists

Follow each session's vote index and XML links. Implement as a separate adapter rather than assuming the House endpoint covers the Senate.

Amendments

Congress.gov amendment endpoints

Preserve bill/amendment parent relationships, actions, and text versions. Senate submitted text is available from the 117th Congress onward; House text granules are not universally available. Follow Record references when needed.

People and terms

Congress.gov member endpoints

Bioguide ID is the canonical person key. Preserve dated chamber, party, state, and district information.

Supplemental ID mapping

unitedstates/congress-legislators

Community-maintained Bioguide/Senate LIS crosswalk and historical terms. Pin the input version, track provenance, and verify uncertain joins with official records.

Use the official APIs and feeds for acquisition; avoid starting with a general-purpose web scraper. Obtain your own API keys and keep them in job secrets. Congress.gov documents a 5,000-request hourly limit and pagination up to 250 results per request. Congress.gov API documentation.

GovInfo supports discovery by publication date and separately by modification time. Use publication dates for the historical seed, then modification cursors for updates. Follow pagination and returned download links. GovInfo API documentation.

GovInfo permits republication of Congressional Record material with an exception for copyrighted articles. Exclude inserted third-party articles from automatic quote publication and distinguish their authorship from the member's own remarks. GovInfo Record guidance.

4. Use one application with a separate data pipeline

A concrete greenfield default is TypeScript throughout. If the existing louderThanWords frontend is already established, retain it and use the data contracts below.

Component

Choice

Responsibility

Interactive frontend

React, Vite, TanStack Router and Query

Search, filters, comparison pages, timelines, cached navigation

Hosting and small API

Cloudflare Workers with Static Assets

Serve the website, published data, and authenticated requests

Database

Supabase Postgres

Sources, people, actions, claims, links, review history, eventual user data

Search

Postgres full-text search first; pgvector later

Exact text retrieval first; semantic candidate discovery when measured useful

Raw documents and public snapshots

Cloudflare R2

Immutable source copies; versioned JSON/HTML exports

Ingestion and processing

Node.js/TypeScript command-line jobs

Fetch, parse, normalize, extract, match, validate, export

Early scheduling

GitHub Actions

Periodic MVP refreshes and manual replay

Later scheduling

The same jobs in a container, for example Cloud Run Jobs

Durable production execution when scheduled-job reliability becomes a requirement

Accounts and billing, later

Supabase Auth and Stripe

Saved research and subscriptions after the evidence product works

Cloudflare supports hosting static assets alongside Worker logic, so this can begin as a static public site while leaving a clear path to authenticated APIs. Cloudflare Static Assets. TanStack Router supports route preloading. Preloading documentation. Supabase supports pgvector for optional similarity search. pgvector documentation.

Keep source acquisition, model calls, and historical backfills outside user requests. Public visitors should read already-published evidence. A government outage or model timeout must not make a comparison page unavailable.

flowchart TD
  A[Official sources] --> B[Scheduled ingestion]
  B --> C[Immutable source archive]
  C --> D[Parsing and matching]
  D --> E[Postgres review queue]
  E --> F{Reviewer decision}
  F -->|Approve| G[Published snapshots]
  F -->|Revise| E
  G --> H[Website and read API]

For the prototype, Postgres can run locally while only approved JSON and HTML are deployed. For the beta, host the same schema in Supabase. The frontend keeps consuming the same versioned contracts. GitHub stores code; Cloudflare serves the website. Do not commit the growing raw corpus or secrets to the application repository.

5. Store enough information to reproduce every comparison

Use normal relational tables. Keep raw provider responses in the archive, and retain the provider's original values alongside your normalized values.

Table

Essential fields

people

Internal ID, Bioguide ID, display name

person_identifiers

Person, identifier system, value, source, verified status

member_terms

Person, chamber, party, state, district, valid-from/to, source

source_documents

Provider, external ID, URL, source date, section, package/granule IDs

source_versions

Document, content hash, fetched-at, provider modification time, object key, MIME type

passages

Source version, normalized-text version, offsets, page labels, speaker candidate/ID, attribution status, parent speech

claims

Passage, exact quote span, target, stance, qualifiers, conditions, claimed event time and its precision

measures

Congress, measure type, number, title

measure_versions

Measure, version identifier, issued date, content hash, source version

amendments

Congress/type/number, parent bill, parent amendment if applicable

legislative_actions

Action type, exact wording, date/time precision, actor where applicable, target, sources

roll_calls

Congress, chamber, session, roll number, official question/result, threshold, target, operative-text status

member_votes

Roll call, person, raw vote, normalized vote, source version

candidate_links

Claim, action, retrieval method, supporting references, temporal status, rejection reason

comparisons

Claim/action links, public assessment, explanation, limitations, review/publication state, version

comparison_evidence

Comparison, source span, role such as statement, vote, provision, or qualification

reviews

Comparison version, reviewer, decision, rationale, reviewed-at

job_runs

Input cursor, stage/version, status, attempts, counts, elapsed time, model usage

publication_releases

Release ID, manifest hash, approved comparison versions, generated-at, prior release

Identifiers must not collide across time. For example, identify a bill with (congress, type, number) and a roll call with (congress, chamber, session, roll_number). Enforce a unique member-vote key per roll call and person. Represent nonmember tie-breaking votes separately where relevant. Never treat a title, surname, or roll number alone as an identity.

Keep separate dates for the event, the Record issue, publication, provider modification, ingestion, review, and your own publication. Use timezone-aware timestamps where supplied and a date_precision field when only a date is available.

A minimum published contract can look like this; identifiers are internal references, not model-invented citations:

type PublishedComparison = {
  id: string;
  version: number;
  personId: string;
  statement: {
    passageId: string;
    quoteStart: number;
    quoteEnd: number;
    recordDate: string;
    kind: 'recorded_statement' | 'inserted_statement' | 'floor_verified';
    sourceVersionId: string;
  };
  actionId: string;
  matchBasis: 'explicit_measure' | 'debate_context' | 'reviewed_policy';
  chronology: 'statement_before_action' | 'same_day_order_unknown';
  assessment: 'consistent' | 'apparent_tension' | 'context_dependent';
  explanation: string;
  limitationNotes: string[];
  evidenceIds: string[];
  reviewedAt: string;
  publishedAt: string;
};

In production, make the publication contract stricter than the internal candidate schema. An unresolved identity, unsupported quote, missing operative text, or unreviewed interpretation must not accidentally serialize into a public comparison. Store “unrelated,” “insufficient evidence,” and “chronology unknown” as legitimate candidate outcomes.

6. Build acquisition as replayable jobs

Create source adapters with discover, fetch, normalize, and checkpoint operations. All return validated schemas; store unknown fields in raw responses rather than silently dropping the response.

For a historical Record window, use the documented /published/{start}/{end} route with collection=CREC. Then enumerate /packages/{packageId}/granules and retrieve each needed granule's summary and available representations. For updates, use /collections/CREC/{lastModifiedStart}. Start GovInfo pagination with offsetMark=* and follow the returned next-page links. GovInfo API reference.

For Congress.gov, start with the documented House-vote collection for Congress/session and follow its detail/member-vote interface. Fetch the associated bill and its actions, text versions, summaries, subjects, and amendments. At adapter setup, validate endpoint shapes against live responses and the current OpenAPI definition rather than treating this document as a provider schema. House vote documentation.

Use this transaction pattern for each source object:

Fetch with a per-host request budget, explicit timeout, and bounded retries.

Hash and store source bytes before parsing.

Record the fetch metadata and source version.

Parse and validate in a versioned stage.

Upsert normalized rows using deterministic identities.

Queue only downstream entities affected by changed content.

Advance the completed checkpoint after durable writes succeed.

Use a configurable 48–72-hour overlap for incremental scans, plus periodic reconciliation of the declared coverage window. An overlap is a delay buffer, not proof that older corrections cannot happen. Poll current vote lists separately from bill metadata so a lagging bill-action feed does not hide a newly published roll call.

Use job keys such as stage:source-hash:parser-version:model-version. Re-running a completed input should not duplicate votes, quotes, model costs, or publications. Retain failed items in a retry queue with a reason and manual replay command. Respect Retry-After, including temporarily unavailable generated downloads.

7. Parse the Record into attributable passages

Start with HTML/text, preserving the original PDF for layout checks. Use a chamber-specific state machine that tracks headings, speaker changes, document boundaries, inserted material, quotations, procedural narration, and bill references. Prefer deterministic parsing for boundaries, then send ambiguous blocks to review.

Do not assume each granule is one speech or each capitalized name starts a speech. Handle interrupted and resumed speeches, transitions between bills, nested quotations, constituent letters, official reports, and the presiding officer's procedural text. “Mr. Speaker” is usually an address, not the speaker's identity.

Resolve people in this order: explicit source identifiers; metadata plus a valid member roster for that chamber/date; normalized name, state, and contextual evidence; manual review if ambiguity remains. An ambiguous surname must remain unresolved. Metadata listing members in a document is useful evidence, not a word-by-word speaker map.

For each passage store:

The whole attributable speech or segment, plus neighboring turns where they affect meaning.

The exact selected quote and offsets into a versioned normalized text.

A mapping from normalized offsets back to raw text/page labels so line-wrap cleanup remains auditable.

Speaker identity evidence and any ambiguity.

Whether it is recorded debate, identifiable inserted material, a third-party quotation, or unknown.

Explicit measure mentions and their scope within the surrounding debate.

Never silently clean up a quote into new wording. Display ellipses when skipping text. Keep qualifications in the initial visible excerpt when they change the claim; an expandable context panel does not excuse a misleading clipped sentence.

8. Extract claims with specific targets

A speech can contain several distinct positions. Extract one claim per independently assessable statement. Keep these claim types separate:

Type

Illustrative wording

Suitable comparison

Voting intention

“I will vote against this bill.”

Same bill, stage, version, and later member vote

Support/opposition

“I support this amendment.”

Exact amendment action, with procedural distinctions

Conditional position

“I support it if section 4 is removed.”

Check whether the condition held at the action

Narrow policy preference

“Members should be prohibited from trading individual stocks.”

Reviewed provision addressing that specific restriction

Broad aspiration

“We need affordable healthcare.”

Topic browsing; generally too vague for a consistency finding

Description or prediction

“This bill will lower costs.”

A different fact-checking task; do not equate it with a promise to vote

These are invented examples, not attributed statements.

Store the target population, policy mechanism, geographic scope, quantities, exclusions, time horizon, negation, and conditions when present. A measure that applies only to a different population is not the same proposition merely because the topic matches.

For an AI-assisted extractor, use a JSON schema and a prompt along these lines:

Extract positions attributable to the identified speaker from the supplied passage. Return verbatim source spans, explicit target references, stance, qualifiers, and conditions. Distinguish the speaker's position from quoted or described views. Return no claim when attribution or stance is unclear. Do not infer motive, generate missing quotations, or decide whether the person is honest.

Verify every returned span against the archived input in code. The model may propose a normalized paraphrase, but public quotations must come from source text. Treat source content as untrusted data; extraction jobs need no ability to browse arbitrary links, change instructions, or publish results.

9. Match in increasing order of difficulty

Exact reference matching. Detect bill/amendment identifiers in the claim and its narrowly scoped debate context. Normalize the Congress and measure type. Join the same person to relevant recorded actions. Retrieve the whole action sequence so you can distinguish amendment votes, passage, reconsideration, and later concurrence.

Debate-context matching. Resolve phrases such as “this bill” only while the surrounding proceedings establish an active measure. Store the precise contextual passage that supports the inference. Reset that context when debate changes topic. Route unresolved references for review.

Policy matching. After the exact-reference system works, define a small policy taxonomy with precise propositions. Index claims and individual provisions, not just bill titles or broad official topic tags. Retrieve using text search and synonyms first; add embeddings if they improve measured recall. Restrict candidates by person, action date, relevant policy scope, and reviewed provision identity. Start with the top ten candidates per claim as a cost-control setting, then tune against missed matches.

For every candidate require explicit answers:

Is this the same person, with a valid identity mapping?

Is the statement earlier than the action? If same day, what proves order?

Is the target the same bill/version, amendment, or narrowly defined policy?

What exactly was the question put to a vote?

What did the individual's recorded choice do with respect to that question?

Was the statement conditional, qualified, superseded, or quoting somebody else?

What additional evidence weakens or changes the apparent relationship?

Never use cosine similarity as a public confidence score. Similarity generates candidates; it cannot prove policy equivalence or inconsistency. A model's self-reported confidence also needs empirical validation before it can support any threshold.

Keep temporal ordering conservative. A document's position in a published issue is not always evidence of when a statement occurred. If a same-day sequence cannot be established, display “Same day; order not established” and exclude it from strict subsequent-action results. Do not calculate an elapsed-hours badge from a date-only source.

10. Interpret the actual action

Create a versioned action vocabulary and retain the official question verbatim. Normalize the immediate legislative effect first. Assess its connection to a policy claim separately.

Event

Safe factual description

What requires more evidence

Passage vote

Voted for/against passage of the specified text

Support for every provision, or whether it became law

Amendment vote

Voted for/against adopting this amendment

Its policy effect without the amendment and parent text

Motion to table

Voted for/against setting aside the specified question

A one-word “supports the policy” label

Cloture or other procedural vote

Voted on the specified procedural motion

Treating it as a final passage vote

Combined suspension-and-passage motion

Voted on the full combined question

Classifying it as procedure alone

Sponsorship or submission

Sponsored/submitted the specified measure

Saying it was offered, voted on, adopted, or enacted

Present or Not Voting

Preserve that recorded status

Treating it as policy opposition

Voice vote or unanimous consent

Record the chamber-level action

Inventing each member's individual recorded vote

A concrete fixture is House roll call 38 of February 11, 2025: the Clerk labels it “On Ordering the Previous Question,” associated with a rule for considering H.R. 77. Your app must not render it as final passage of H.R. 77. Official Clerk record.

For amendments, distinguish submitted, offered, modified, agreed to, rejected, withdrawn, and otherwise disposed of. Preserve amendments to amendments and packages of amendments considered together. The API exposes amendment-parent relationships and text version information; availability does not eliminate the need to identify the operative text. Amendment documentation.

Attach a vote to an operative_text_bundle: the base bill plus the exact amendments or substitute relevant to that vote. A bill can change without a convenient standalone published version matching the moment of voting. If that bundle cannot be established, mark the policy effect unresolved; do not silently use today's bill text or merely the newest PDF dated before the vote.

Prefer narrow amendments for policy-level findings. Voting against a large package containing a favored provision does not by itself establish opposition to that provision. Show the member's stated objections when available and distinguish those explanations from independently verified effects.

11. Make review part of the product pipeline

Review all published comparisons at launch. Keep these axes distinct:

Axis

Values

Connection basis

Explicit reference; contextual reference; reviewed policy connection

Assessment

Consistent; apparent tension; context dependent

Review state

Draft; needs evidence; approved; rejected; correction pending; withdrawn

Coverage state

In scope and processed; out of scope; source missing; processing incomplete

Use “Differs from stated voting intention” only for a directly comparable intention and action with chronology, conditions, and text checked. “Apparent tension” must identify the narrow tension and the main limiting context. Do not publish unexplained verdict badges.

The review screen should show the whole passage, neighboring context, the official vote question and member record, operative provisions, intervening relevant statements, and the proposed explanation. The reviewer can adjust quote boundaries, reject the match, add contrary evidence, approve a revision, or request a missing source.

Use a two-pass check for potentially damaging interpretations: first establish identity/quote/action facts, then actively look for conditions, changed text, later explanations, and procedural context. A second reviewer is valuable when available; if working alone, reserve a separate later review pass and record that it is not independent review.

Expose a correction form and version history. Material source changes should mark dependent comparisons for re-review and prevent stale assessment text from being presented as current. Keep prior published versions accessible with an appropriate correction notice, rather than silently rewriting the record.

Publish matching methodology and coverage. “No matching action found in this dataset through [date]” must never become “This person did nothing.” Show counts of reviewed comparisons as counts of the covered sample, not a career-wide honesty statistic.

12. Build four public views and one internal view

View

Minimum experience

Explore

Search member, bill, policy, or phrase; filter chamber/date/state/action type/assessment; show coverage and freshness

Member

Chronological statements and linked actions; party and representation at the event date; disclose corpus coverage

Comparison

Statement and action beside each other, visible qualifications, chronological context, evidence links, short explanation, correction history

Bill or policy

Relevant claims and actions in a timeline; show measure versions and precise topic definition

Review

Candidate queue, original sources, checks, edit/reject/approve, audit trail

On desktop, put “Recorded statement” and “Legislative action” in two columns. On phones, stack them in that order. Give “Why these are linked” one or two sentences. Put material caveats beside the comparison and additional detail behind clearly named controls. Every quotation, vote, provision, and factual explanation must have a source link.

Use a timeline when amendments, changed wording, or later explanations affect the reading. Keep the source label visible when copying or sharing. A share card needs dates, the exact action type, and an invitation to open context; do not create a misleading image by stripping away the qualification.

The existing map concept can become an optional way to select a state or district. It should not be required to access the evidence or delay initial content rendering.

13. Keep the website fast as the dataset grows

Generate small, approved public projections: a comparison detail object, paginated member timelines, a lightweight search/filter index, and a release manifest. Keep raw documents, candidate matches, model output, and private user data out of public snapshots.

Use content-hashed JSON chunks in R2 and pre-rendered HTML for public comparison/member pages. Produce HTML and JSON from the same approved versions so quotations and share metadata agree. Existing frontend components can hydrate the pre-rendered content; validate that navigation and direct-page loads produce the same view.

For a small prototype, build a compact client-side index of published metadata only. Switch full-corpus search to the read API before the index becomes a large download. Never deliver the whole Congressional Record to the browser.

Prefetch likely next comparison pages on intent, lazy-load documents and maps, virtualize long timelines, and use stable layouts with reduced-motion support. Keep search/filter state in URLs so results are bookmarkable. Cache published content by release/version, and make the release manifest short-lived or revalidated so corrections are discoverable promptly.

Proposed performance targets: mobile LCP below 2.5 seconds, INP below 200 milliseconds, cached navigation below 200 milliseconds, and no more than roughly 200 KB compressed initial application JavaScript before optional maps/documents. These are budgets to test on representative devices, not promises from the framework choice.

Public pages must have useful HTML, canonical links, descriptions, and social metadata at first response. Do not postpone this until after launch: shareable evidence pages are central to acquisition.

14. Repository and API boundaries

Location

Contents

apps/web

Public routes and UI

apps/api

Worker read endpoints and later authenticated writes

apps/review

Private reviewer interface, or protected routes in the web app

packages/contracts

Runtime schemas and shared TypeScript contracts

packages/db

Migrations, queries, identities, publication views

packages/ingest

Separate GovInfo, Congress.gov, House Clerk, and Senate adapters

packages/record-parser

Passage segmentation, offset mapping, speaker resolution

packages/matching

Reference resolution, retrieval, comparison rules

packages/publishing

Validated exports, HTML generation, release manifests

fixtures

Small archived source examples and reviewed expectations

docs

Coverage, methodology, runbooks, editorial rules

Implement commands with explicit scopes: ingest-record, ingest-votes, sync-measures, extract-claims, generate-candidates, evaluate, publish, and replay. Support date/Congress/source-ID filters and dry runs. These are proposed CLI commands to implement, not existing software.

Suggested public API routes:

Route

Result

GET /api/v1/members

Paginated public member metadata

GET /api/v1/members/:id/timeline

Published, scoped evidence timeline

GET /api/v1/comparisons/:id

Current comparison and revision metadata

GET /api/v1/comparisons

Filtered, cursor-paginated comparisons

GET /api/v1/measures/:id

Versions, actions, linked comparisons

GET /api/v1/search

Ranked published results with explicit filters

GET /api/v1/coverage

Scope, exclusions, processing and publication freshness

Private review endpoints require reviewer authorization; hiding a button is insufficient. Use a database role restricted to published views for public reads. Keep ingest/admin secrets server-side. If adding accounts, isolate private saved searches and billing entitlements, and never mix personalized responses into a shared public cache.

15. Evaluate the claims pipeline, not just the code

Start with a manually annotated set of approximately 200 passages and candidate pairs, including nonmatches and hard cases. Record the expected speaker, quote, target, timing, action, conditions, and acceptable assessment. Keep entire bills/debate days separated between development and held-out evaluation; random pair splits can leak near-identical examples.

Include fixtures for repeated surnames, multiple speakers, quoted opponents, inserted statements, negation, conditional support, changed bill text, procedural votes, combined passage motions, missing amendment text, amendments to amendments, voice votes, absence, same-day uncertain ordering, explicit later retractions, and source corrections. Keep the real Clerk roll-call example above as a procedural regression case.

Check

Proposed release gate

Exact quotation

Every published quote matches its saved source span

Identity and vote

Every published comparison passes a source-level member and vote check

Operative action

No known procedural/substantive or text-version errors in published fixtures

Candidate relevance

Aim for at least 95% precision on held-out exact-reference candidates; report sample size and uncertainty

Interpretation

All public assessments reviewed; sample agreement and disagreement reported when multiple reviewers exist

Retrieval coverage

Manually check random relevant actions/passages that received no match, not only accepted candidates

Repeatability

Replays produce no duplicated records, charges, or publications

Updates

A corrected source triggers dependent review and published correction behavior

UI

Direct links, source links, keyboard access, mobile layout, and share metadata work

The numerical precision target is a proposed operational threshold, not a claim about an untested model. A small evaluation sample cannot establish population-wide accuracy. Track error types and review time per accepted comparison; both matter more than a single blended “accuracy” score.

For a public product, test backup restoration and publication rollback before relying on either. Reviewers should be able to reproduce a comparison using its archived source versions even if the upstream page has changed.

16. Refresh, monitor, and recover

Begin with hourly or twice-daily acquisition according to the sources' publication cadence, and publish approved batches daily. Document time since the last successful fetch separately from time since the last reviewed publication. Never advertise live floor coverage from a next-day textual source.

GitHub says scheduled Actions can be delayed or dropped under load; public-repository schedules may also be disabled after inactivity. Use it for the MVP with a durable checkpoint and reconciliation, not as a strict freshness guarantee. GitHub scheduling documentation. For production, the same containerized processing commands can run as a managed job. Cloud Run Jobs.

Track source lag, unprocessed days, unmatched people, missing text, schema changes, fetch failures, retry backlog, candidates per action, acceptance rate, review age, model tokens, and cost per approved comparison. Alert on unexpected changes such as no records for an active sitting day, not merely a failed HTTP request. Recess days and delayed source publication are not automatically incidents.

Publish releases atomically: build and validate versioned outputs, upload them, then update the current manifest only when everything is complete. Roll back by moving the manifest to a prior approved release. For a material error, also invalidate the affected current page/caches and show its correction status; immutable archived releases alone do not remove a stale public assertion.

Keep database backups, separate archive retention, and parser/model versions. Log job IDs and source IDs while redacting API credentials and user data. Reviewer time is a capacity limit: if the queue grows, reduce topic scope or publish cadence before reducing evidence standards.

17. Delivery sequence and acceptance criteria

Estimates assume a focused experienced solo developer. They exclude a large historical backfill and may lengthen substantially for part-time work. AI coding help will not remove source verification or editorial work.

Milestone

Estimated elapsed time

Deliverable and acceptance condition

Source and product spike

Days 1–3

Fix scope; manually assemble five valid cases where possible; identify ambiguities and a no-match case; verify quote/action provenance

Manual public prototype

Days 4–7

Responsive comparison and member pages from reviewed fixtures; stable URLs, sources, context, and useful share metadata

Acquisition and schema

Week 2

Fetch chosen Record window and vote corpus; archive inputs; normalize people/measures/votes; replay without duplicates

Parser and direct matching

Week 3

Extract passages and explicit references; produce review candidates; evaluate on held-out fixtures

Review and publication

Week 4

Private queue, approval/version history, published projections, correction path, source freshness

MVP hardening

Weeks 5–6

Expand to target 30–50 approved comparisons if supported; inspect missing matches; verify performance and restore/rollback

Policy beta

Weeks 7–10 or longer

Reviewed provision matching for three topics, operative text bundles, 180-day lookback, measured usefulness and error rates

Senate and subscriptions

After beta evidence

Separate Senate adapter and ID mapping; accounts/alerts/billing only when people repeatedly use the product

The first go/no-go decision is whether real records produce understandable, interesting comparisons at an affordable review cost. Do not scale a pipeline that reliably finds only obvious same-day restatements. If policy matching is too ambiguous, keep the product useful as a documented statement/action timeline while narrowing claims of consistency.

First seven implementation tickets:

Create the fixed seed corpus and a scope manifest, including excluded actions and reasons.

Write five reviewed comparison fixtures with source hashes, exact spans, action questions, chronology evidence, and qualifications.

Build the comparison page, source viewer, and mobile presentation from those fixtures.

Implement migrations, source archival, and stable person/measure/roll-call identities.

Implement House-vote and Record adapters with pagination, retries, checkpoints, and replay.

Parse speakers/references and generate exact-reference candidates with explicit abstention.

Add review-to-publication flow and a small held-out evaluation before importing more history.

18. Costs and the subscription path

Official source documents do not require buying a congressional dataset. A manually curated prototype can run at approximately $0 incremental hosting cost while within free allowances and without paid model calls; domain costs and your time are separate.

Item

Current price anchor or planning allowance

Cloudflare Workers

Paid plan minimum about $5/month; usage can add cost. Workers pricing

Supabase

Pro starts at $25/month; additional compute/storage/projects can add cost. Free databases are substantially smaller. Supabase pricing

R2

Standard free allowance includes 10 GB-month and specified operation allowances; paid usage follows. R2 pricing

Job execution

Use included execution allowances where suitable; reserve $5–20/month initially as an estimate, not a provider quote

AI extraction/matching

Begin with a configurable $20–100 monthly experiment cap; measure real token usage and accepted-case yield

Review

Budget hours explicitly; this may exceed infrastructure cost in practical importance

A reasonable small-beta planning envelope is roughly $55–150/month before domain, email, payment fees, labor, heavy backfills, and usage overages. This combines the $30 paid backend baseline with the estimated job and model allowances above; it is not a guaranteed bill.

For model costing, record input/output tokens per stage. For example, 5,000 extraction requests averaging 1,200 input and 200 output tokens would total 6 million input and 1 million output tokens, before matching, retries, or embeddings. Price that measured workload against the selected provider's current rates. Cache outputs by input hash and model/prompt version. Benchmark inexpensive models on the same held-out set; choose on cost per valid result rather than model reputation.

Keep original evidence, methodology, corrections, and basic browsing public. Candidate paid features are saved politicians/topics, alerts when a new reviewed action connects to an earlier statement, advanced historical search, comparison collections, and source-backed exports. These are monetization hypotheses to validate, not evidence of willingness to pay.

Measure whether people open the context, follow sources, save searches, and return for new evidence. Interview a small group after they use actual pages. Add payment infrastructure once recurring usefulness is visible. Subscriber alerts should operate on approved new comparisons and corrections, deduplicate deliveries, and link back to the full context.

19. Acceptance checklist for the eventual coding handoff

A new developer can reproduce the seed corpus from its declared sources and dates.

Every public quote and action points to a saved source version and an official original.

Speaker attribution, event chronology, and bill/amendment versions are explicit rather than guessed.

Exact links, policy interpretations, and publication approval remain separate objects.

The application has useful behavior for ambiguity, missing sources, and no match.

Public pages load without government API calls or model inference.

Re-ingestion and source corrections preserve identity and produce reviewable updates.

The initial deliverable works as a small static publication, while the same schema/contracts support a hosted service.

The MVP is judged by trustworthy, useful comparisons and sustainable review effort, not the number of automatically generated accusations.