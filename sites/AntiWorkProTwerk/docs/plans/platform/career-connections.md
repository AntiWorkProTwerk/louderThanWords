# Career Connections / Revolving-Door Map — product 10

Open `http://127.0.0.1:5173/records/revolving/`. The built route is
`/AntiWorkProTwerk/records/revolving/`. This is a source-backed disclosure explorer,
not a misconduct, corruption or influence score.

## What the first collection actually contains

The [official LDA API](https://lda.gov/api/) provides lobbyist entries inside each
filing's issue activities. This product reuses the bounded, validated acquisition
from Washington Agenda, but projects the additional person ID/name, exact covered
position field and filer-reported “new” flag. No AI inference, new credentials,
database, remote job service or personal geocoder is needed.

The initial recipe collects three **distinct source client IDs** for filing years
2024–2025: 59201 (ANTHROPIC), 54558 (ANTHROPIC, PBC), and 54583 (AQUIA GROUP ON
BEHALF OF ANTHROPIC, PBC). Their associated registrants remain separate: ANTHROPIC,
AQUIA GROUP, LLC and TOWER 19. A name resemblance or “on behalf of” phrase does not
merge identities or establish corporate ownership. The recipe is a selected
collection, not all Anthropic-related lobbying or all clients of these people.

September 16, 2026 capture: release **`rd-180f912d82e33a215681cdac`**, full hash
`180f912d82e33a215681cdac125bd06555bc85604519659a971b12fc5b5eb1c2`.

- 27 filings across six complete client/year queries. Client 59201 has six/five
  filings in 2024/2025; each other client has four/four.
- 94 source activity/person observations; ten distinct LDA person IDs. All ten
  have at least one previous-position description somewhere in this capture.
  Observations are not separate jobs, people, engagements or meetings.
- Client geography: 19 filings with California client metadata, eight with
  Virginia metadata. Map counts deduplicate people within each client state:
  nine source-person IDs in California, one in Virginia for the full selection.
- Eleven exact filing-UUID **and raw-record-hash** matches to the active Washington
  Agenda collection. These support cross-product evidence navigation without
  implying identical scope or relying on company-name matching.

## Evidence semantics and dates

The current [official guidance](https://lobbyingdisclosure.house.gov/ldaguidance.pdf)
explains that previously held covered positions need not be repeated on every
subsequent report for the same client after the initial required disclosure.
This matters in real data: Rachel Appleton's initial captured disclosures supply
position text, while later captured reports leave that field blank. The profile
preserves the earlier statement, shows the later blank and lets readers open both.

Every observation retains its exact filing ID, zero-based activity index, person
ID, assembled source name, exact nullable covered-position string, status and “new”
flag. Blank/null, a recognized filer placeholder such as “N/A”/“None”, and a supplied
description are separate states. “Reported none” is a source statement, not an
independent employment check. Missing schema fields fail rather than silently
becoming blanks. Different/conflicting descriptions in captured filings are
retained as separate source statements; no automatic adjudication decides which
is true. A change to a single source entry between captures is recorded in the
observation-change receipt and preserved in the earlier immutable release. Earlier
snapshot contents are not silently merged into the current source assertions.

Grouping is by exact **LDA person ID**, never a fuzzy name. Different IDs with the
same name remain separate; name variants on the same ID remain visible. A source
ID is not independent verification of a lifetime real-world identity. Relationships
use exact **client ID + registrant ID**. Multiple appearances in the same filing's
different activity areas do not become duplicate relationships or people.

The connection diagram places the disclosed previous-position text beside the
client relationships in which that source ID appears. Its connector is a disclosed
association, not a cash flow, meeting, geographic journey or finding of influence.
Do not turn it into a government-office-to-client location line without further
location evidence. Public address/contact details are deliberately omitted.

The timeline uses **filing posting dates**, with the reporting year/type alongside.
First/last captured posting dates are not employment dates. Registrations may name
expected lobbyists; no-activity filing types retain their caution. “New” is the
filer's flag, not a career start date. Dates inside covered-position text remain
verbatim rather than being converted into guessed precise calendar events. The
source's description of earlier positions is not an independently checked sequence.

Search filters matching filings/people, but previous-position context is retained
from the full captured history for that ID. Detail explicitly states when showing
history outside current list filters. Missing earlier registrations or omitted
clients remain outside coverage; absence in this collection proves neither no
government service nor no lobbying relationship.

## Map and product connections

The persistent U.S. map counts distinct source-person IDs by **reported client
state as retrieved**, not the person's residence, previous office, meeting or
influence location. A person can count in multiple client states, so state counts
are not an additive national total. Foreign/unknown/unmapped states are not guessed
into a U.S. point. Current metadata is not presented as verified historical geography.

Washington Agenda links to a filing lookup with its UUID and record hash. If the
career snapshot has a different revision, the UI says so. In the reverse direction,
the “Same verified filing” link appears only when both identifiers match; “verified”
here means matching evidence, not independent verification of the filer’s assertions.
The original LDA filing is always available. Failure to load the optional Agenda
snapshot does not prevent loading the career evidence.

The existing desktop/mobile shell remains mounted through these routes. The new
page has a green-gray palette, searchable cards, source-position/client diagram,
filing timeline and exact quotations. Detail entrances and hover motion respect
reduced motion. Opening a profile focuses it and brings it into view. Interactive
controls wait for hydration. Initial lists cap rendered cards at 24; phone stacks
the relationship diagram vertically and scrolls the filing timeline locally.

The full regression run exposed a shared desktop-header overflow at the default
1280-pixel viewport after adding another navigation item. The masthead now allows
its navigation region to shrink and scroll horizontally while keeping account
controls inside the viewport. The existing account workflow test now explicitly
checks that control's bounds. Mobile navigation retains its previous scroll layout.

## Local pipeline and future jobs

From `sites/AntiWorkProTwerk`:

```powershell
npm run civic -- revolving --plan docs/plans/platform/revolving-lda.json
npm run civic -- revolving --plan docs/plans/platform/revolving-lda.json --offline
npm run civic -- revolving --input .local/revolving/input.json --workspace .local/revolving-import --output .local/revolving-import/public --offline
```

`acquireLobbying` is the shared acquisition stage; `buildRevolving` validates raw
LDA evidence and constructs the portable projection; `runRevolving` orchestrates
refresh/offline/import/publication. Both the schema and query/group/map functions
are reusable TypeScript exports. A future job runner can call them directly. No
automatic schedule currently runs.

Ignored artifacts: `.local/revolving/raw/<hash>.json`, `acquisition.json`, and
`input.json`. The portable input embeds the response strings; no separate service
or raw archive is necessary for import. Public output is
`public/data/revolving/manifest.json` plus immutable `releases/<release>/data.json`.
The manifest, filing-record hashes and page hashes bind outputs to captured inputs.
Page hashes use UTF-8 source strings; object hashes use `JSON.stringify` with
preserved property order. These are integrity receipts, not source authentication.

Acquisition inherits the verified LDA transport limits: official reconstructed
queries only, no redirects, 30-second request timeout, 4 MB response bound,
4.1-second anonymous request spacing, explicit client/year cap, complete pagination,
stable reported total, duplicate detection, scope/date/source-ID checks. A rate
limit stops the job and preserves Retry-After in the error. API pagination has no
atomic database snapshot token; count/identity validation cannot prove all upstream
records remained unchanged during capture.

Career projection additionally validates every lobbyist array, required nullable
field, duplicate person within an activity, observation ID and filing/activity
reference. The same person in different activities remains separate raw evidence.
Publication is locked, compare-and-swap protected and atomic. Failed runs cannot
replace the prior public pointer. Scope changes require a new output directory.
Change receipts describe added/updated/no-longer-returned observations, not jobs
or departures. Offline replay against the same publication reproduces its release
and receipt; a fresh import starts its own observation baseline.

## Verification

Five new code tests cover exact role fields, privacy, blank/none distinctions,
same-name/different-ID separation, retained earlier context, filtered geography,
relationship grouping, repeated activities, conflicting descriptions, malformed
inputs, dangling references, corruption, offline publication and change receipts.
Two browser tests use the real 27-filing dataset: blank later fields, preserved
earlier positions, both-direction exact filing navigation on one map, VA filtering,
dataset download, phone diagram layout, reduced motion and empty-state recovery.
Desktop and phone screenshots were visually inspected. Real offline replay
reproduced `rd-180f912d82e33a215681cdac`.
An actual import into `.local/revolving-import/` with network access disabled also
reproduced the identical initial-baseline release and 27/94/10 record counts.

Public JSON is 74,344 bytes / 7,859 gzip. The shared LDA production benchmark accepts
`npx tsx scripts/civic/lobbying-performance.ts --careers`; it exercises search,
profile selection and a later blank disclosure while asserting that earlier role
text remains available. Results are saved under `.local/revolving/performance/`.

Final functional verification on September 16, 2026: **91 code/integration tests,
33 browser tests, zero Svelte errors/warnings**, and the root production build for
both independent buildable sites. The first full browser run found the header
overflow; after the fix the targeted account test and the entire 33-test suite pass.
Coworker source files were not edited. Development (5173) and production preview
(4173) remain running.

The production benchmark uses three fresh contexts for each profile, reduced
motion and software WebGL. The compressed initial HTML is 22,248 bytes.

| Profile | Ready, three samples | LCP, three samples | Maximum interaction, three samples |
|---|---|---|---|
| Desktop 1672×941, unthrottled localhost | 401 / 245 / 265 ms | 400 / 160 / 156 ms | 224 / 88 / 88 ms |
| Phone 390×844, 4× CPU, 1.6 Mbps / 80 ms latency | 1,777 / 1,786 / 1,865 ms | 1,296 / 1,152 / 1,196 ms | 160 / 144 / 120 ms |

All six samples have zero page errors. The **224 ms cold desktop interaction is
above the 200 ms lab target**; faster later samples do not establish that the
shared startup edge is fixed. These are small local samples, not field INP or
physical-device certification. Full platform performance, nationwide coverage and
independently verified career dates are not established by these functional tests.
