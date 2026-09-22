# Behind the colors: a readable direction breakdown

State Patterns now connects its chart colors to an exact, browsable partition of
the frozen region rows. The always-visible stacked strip shows shares of **all
collected regions** for the selected December-to-December window. Its disclosure
contains named groups, exact counts and alphabetized state buttons. Selecting a
button uses the existing state navigation: the scatter plot, real map and state
evidence update together, with the existing peer and frozen release preserved.

This is not a filter, a new correlation, a strength score or a ranking. The same
complete pairs still determine Pearson r. The five measured groups use the exact
existing map/dot colors; the sixth, hatched group contains incomplete pairs. A
record with one missing change is never put in the unchanged group, even if its
other change is zero. Empty groups explicitly say no regions were found. Missing
rows retain their available value and exclusion reason. Pay is nominal average
hourly earnings; unemployment changes use percentage points, not percent changes.

`patternDirections` is a pure presentation projection: no mutation, rounding before
classification, new collection or external inference. Its groups partition rows
once, sort by name and use the complete collected-row denominator. Tiny nonzero
values below 0.005 in magnitude are displayed with their sign and a less-than
bound, rather than an apparent zero. The calculated-pairs download now includes
`directionGroups`, with the exact member rows, labels, colors and shares.

## Presentation and access

The native disclosures work by keyboard before hydration; state navigation stays
disabled until ready. Counts and full measure names accompany colors. Lists use
two columns on wide screens and one column on narrower screens. State buttons
are at least 58 px tall; group controls are at least 44 px. Scroll margins keep
new controls clear of the phone evidence-sheet handle. The strip animates share
changes over 220 ms and disclosure icons turn over 180 ms; reduced motion disables
both. No continuous animation or artificial chart trajectory is added.

## Verification

207 code tests pass, including three new tests across every frozen year/pair,
exact map-color agreement, partition identity, unchanged inputs, explicit zeros,
negative zero, tiny changes, partial pairs, empty collections and rejected
nonfinite values. The type check reports zero errors/warnings. Nine targeted
browser tests pass across the new direction view, existing Patterns and two-state
comparison; the final two direction tests also pass after screenshot assertions
were refined. Checks cover native keyboard disclosure/selection, reduced motion,
320 px overflow, exact export membership, persistent WebGL canvas, map selection,
unchanged 51-point cohort/r and peer/release preservation. Desktop and short-phone
screenshots were inspected. Production build and timing results follow below.

The performance protocol advances explicitly to `state-patterns-v6-directions`:
all v5 actions remain, plus native direction/group disclosures, Texas selection,
cohort/r invariants and disclosure close. The same strict <200 ms interaction gate
applies. Existing failed and successful timestamped receipts remain retained.
