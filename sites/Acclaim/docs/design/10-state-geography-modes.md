# 10 — State geography modes

## Purpose

Let State Focus answer two different geographic questions without presenting counties and congressional districts as equivalent political units. Counties show presidential election results; districts show the affiliation of the current U.S. House member.

## Mode control

- State Focus includes a two-option `Counties | Districts` control.
- Counties is the default whenever the user returns to the national map or opens a fresh state view.
- Only one geography is interactive at a time.
- Switching modes does not re-zoom the state or navigate away from the page.

## Counties mode

- County fills represent the selected presidential election year.
- The `2016 | 2020 | 2024` selector and its color explanation remain visible.
- County borders, county hover, county names, and county election readouts remain active.
- Hovering or focusing a representative temporarily previews that member's district over the county map; clicking continues to pin it.

## Districts mode

- Every current 119th-congressional-district shape receives a light fill based strictly on its current House member's affiliation:
  - Democrat: blue;
  - Republican: red;
  - Independent, other, vacant, or unavailable: neutral charcoal.
- The interface calls this `Representative party`, never `District party`. The color describes the officeholder and does not claim that all residents or voters share that affiliation.
- District boundaries are the dominant internal geography: pure-black foreground lines with narrow white separation.
- County borders remain visible beneath them as thin, low-contrast geographic references.
- Presidential county colors are removed in this mode; counties use a neutral base beneath the district affiliation layer.
- The presidential-year selector and election-color help are replaced by `House districts · 119th Congress`.
- District numbers are placed near their projected geographic centers when space permits. At-large seats use `AL`.

## District interaction

- Hovering or keyboard-focusing a district deepens its representative-party color, strengthens its outline, and shows a restrained shadow.
- Districts do not scale on hover because scaling would create false overlaps and seams along shared borders.
- The map readout shows the district, representative, and written party name.
- Clicking or keyboard-activating a district pins it and synchronizes the corresponding representative card.
- Hovering, focusing, or pinning a representative card synchronizes the matching district.
- County hover targets are disabled while Districts mode is active, though county borders remain visible.

## Layer hierarchy

From back to front:

1. neutral county base;
2. light representative-party district fills;
3. thin county reference borders;
4. white district separators and black district boundaries;
5. district labels;
6. selected-state outer outline.

## Data and vintage

- District geometry is the January 1, 2026-vintage 119th congressional-district layer from U.S. Census Bureau TIGERweb.
- House membership and affiliation use the local 119th Congress roster and its recorded retrieval date.
- District geometry and representative data must continue to refer to the same Congress.
- Vacancies and missing roster matches remain neutral and are stated explicitly rather than inferred.

## Responsive behavior

- The two-option geography control remains available on desktop and mobile.
- The full congressional-vintage label may be hidden on unusually narrow screens, but the state panel retains the 119th Congress context.
- Districts remain keyboard accessible and tappable; county interaction stays disabled until Counties mode is restored.

## Acceptance criteria

- Switching to Districts recolors the state by current representative affiliation rather than presidential voting history.
- County borders remain visible but never compete with district boundaries.
- The election-year selector is not presented as controlling district affiliation.
- Each district and representative card highlights the other.
- Each district exposes its representative and party in text, so meaning never depends on color alone.
- At-large states produce one labeled district covering the state.
- Returning to Counties restores county results, hover behavior, and the election-year controls.
