# Connected evidence — visual iteration 1

The active focus is presentation, map exploration and evidence-supported connections.
`/records/connections/` is a new visual entry point, not a claim to finish all platform work.

The local projection reads the published Insider Records, Major Stakes and Shared
Investors snapshots, verifies their hashes/schemas and joins exact **issuer CIKs**.
Names are display labels, never join keys. A company must have actual records in
at least two views; unavailable/not-listed investor cells do not count as holdings.
The initial result has three companies (JPMorgan Chase, Microsoft, Alphabet), seven
company/view links and a 5,414-byte JSON index. Each parent snapshot's release,
capture date, selection and hash are retained. No additional network collection,
AI inference, database or task service is involved.

Run locally or call `runConnections(root, output)` from a future job:

```powershell
npm run civic:connections
# Optional source/output directories:
npm run civic:connections -- public/data .local/connections-export
```

The UI has searchable company cards, an animated exact-ID connection diagram,
hover/focus-linked paths, separate date-window graphics, source-specific questions,
direct filtered links, a share control and immutable JSON/source downloads. It
uses the existing persistent map and evidence sheet. Phone layouts stack the graph;
reduced-motion preferences disable tracing and transitions. Map counts are companies,
not combined filing totals. Geography is only shown when captured issuer business
states agree across participating views; differing/missing states are not guessed.

The edges indicate **identity continuity across datasets**, not money movement,
collusion, ownership control, causation or measured statistical correlation.
Filing-date windows and holdings-date windows remain separately labeled. Counts
with different units are not added. This is a finite intersection of selected
collections, not a complete history of these companies or national coverage.

Verification: all **174 code tests** pass, and both site builds pass. Svelte check
reported zero errors/warnings. The 61-test browser run had 59 passes and two
failures: the shared state selector accepted input before hydration installed its
handler, and an old Said/Did selector assumed only one homepage evidence link.
The state selector and new connection controls now wait until mounted; the old
test targets its actual Said/Did link. All **13 affected connection/explorer/
Said-Did browser tests subsequently passed**. A separate search/navigation race
was also fixed. The initial cold development navigation had exceeded a test timeout;
a later assertion targeted the wrong map label and was corrected.

Desktop and phone screenshots were inspected. The graph now has a compact overview,
visible source branches, and an opaque phone sheet so map text does not show through
the evidence. Tests cover exact route IDs, source dates, missing-view labels,
persistent map identity, keyboard focus/links, state selection, mobile overflow,
search/reset, downloads and reduced motion. This is not a claim that the original
61-test run was entirely green; its two failures and follow-up scope are recorded.

Production measurements use `npx tsx scripts/civic/connections-performance.ts` with
three desktop and three emulated-phone runs, **animations enabled**, 4x phone CPU,
1.6 Mbps, 80 ms latency and software WebGL. The final run at
`2026-09-17T05:57:02.663Z` passed: maximum measured interaction durations were
176/120/104 ms desktop and 152/80/152 ms phone. Phone input-ready time was
2,129/1,908/1,841 ms and LCP 1,348/1,312/1,184 ms. No page errors or viewport
overflow appeared. An earlier run included 18.5 seconds of preview-server startup
in its first navigation; that report remains archived rather than silently removed.
These are small local lab samples, not physical-device or field-p75 guarantees.
The pre-final built HTML measured 37,657 bytes / 11,462 gzip bytes; the 5,414-byte
connection data is embedded in the page's initial data and must not be double-counted.
Raw reports are in ignored `.local/connections/performance/`.

Latest remote review: main `062a150` adds Acclaim toolbar/governor improvements;
README remains the other remote branch, and no PR is open. Its four-file diff is
outside AntiWorkProTwerk. No coworker files were merged or edited.

Next UI iterations should broaden meaningful source connections, improve the
crowded product navigation, add geographic exploration and measure interactions
on production builds. Do not present name similarities or shared states as
verified entity relationships or infer a statistical correlation from this graph.
