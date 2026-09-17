# 03 — National map

## Purpose

Provide a flat, immediately understandable way to choose a state.

## Layout

- The navbar remains fixed at the top.
- The map occupies the remaining viewport without page scrolling.
- The United States is shown on a flat 2D plane.
- State abbreviations are centered inside their shapes when space permits.
- Small states may use external labels and leader lines.
- Multi-part or concave states may use curated interior label points rather than geometric centroids.
- Northeast callouts form one deliberately spaced vertical column with routed leader lines.
- State fills and interactions are separate from the boundary layer.
- Internal borders use one topology mesh, with a separate exterior national outline, so shared edges are never doubled.

## Color

- State color will eventually represent voting history with a red/blue scale.
- Until that data exists, states use neutral gray.
- During the gray placeholder phase, hover increases contrast by darkening the fill.
- When political color is introduced, hover will increase the saturation of the state's base color.

## Interaction

- Hovering or focusing a state identifies it and increases its visual intensity.
- Clicking or activating a state moves to State Focus.
- Returning to `Explore` from another analysis mode remounts the map as one coordinated sequence: boundaries and fills replay first, followed by state initials and callout lines in the same geographic order. Labels must not appear detached before their regions.

## Acceptance

- All 50 states and the District of Columbia are selectable.
- Every state has a readable abbreviation or external callout.
- State selection works with pointer and keyboard.
- The national view remains inside one viewport.
