# 04 — State focus

## Purpose

Move from the national context to a county- or congressional-district-level view without changing pages. Detailed layer behavior is defined in [State geography modes](10-state-geography-modes.md).

## Layout

- The navbar stays visible and fixed.
- The selected state expands to dominate the entire canvas beneath the navbar.
- Surrounding states recede or disappear.
- County boundaries replace the state-level fill as the initial geography; the user may switch to congressional districts without leaving State Focus.
- County boundaries use a single topology mesh so adjacent counties do not produce doubled lines.
- Counties use neutral gray until data-driven color is available.

## Interaction

- The national map smoothly zooms toward the selected state.
- Hovering a county darkens its placeholder fill.
- The hovered county grows slightly from its own center and appears to lift above its neighbors.
- `All states` and Escape return to the national view.

## Acceptance

- County boundaries belong only to the selected state.
- Every shared county edge is rendered exactly once.
- The selected state is fitted within the available canvas without overlapping the navbar.
- Hovering a county does not permanently distort adjacent geography.
- Returning to the national view restores state labels and interactions.

## Open

- County names and county-level data content are not yet specified.
- Clicking a county has no defined action yet.
