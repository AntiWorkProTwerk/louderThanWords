# 07 — State officials panel

## Purpose

Add baseline state and federal representation to State Focus without leaving the map or introducing page scroll. The map remains the geographic context; the officials panel identifies the selected state's executive and federal delegation and lets House districts be located visually.

## Non-negotiables

- A state's two current U.S. senators appear at the top of the panel and remain pinned while the representative list scrolls.
- The current governor appears above the senators as the state's executive. D.C. shows its mayor as the equivalent executive.
- Current U.S. House members appear below the senators in an internally scrolling list.
- Hovering or focusing a representative reveals that member's congressional district over the county map.
- The district overlay is blue for a Democrat, red for a Republican, and neutral charcoal for another or unavailable affiliation.
- The page remains a single, fixed viewport with no document-level scrolling.

## Desktop layout

- The navbar remains full-width and fixed above the State Focus workspace.
- The workspace becomes two columns when a state is selected:
  - a flexible map canvas;
  - a right-hand officials rail sized between 360px and 420px.
- The selected state is refitted to the reduced map canvas rather than being covered by the rail.
- The rail is white with a single black left border, continuing the navbar's visual language.
- The rail enters from the right as the map begins its state-focus movement.

## Information hierarchy

### State header

- State name and postal abbreviation.
- A compact count of Senate and House seats.
- A quiet source-vintage label so political data is visibly time-bound.

### Senators — pinned

- Exactly two compact cards for states.
- Each card shows full name, party, role, and Senate class.
- Party is communicated by both a text label and a small color accent; color is never the only signal.
- The cards remain visible while the House list scrolls.

### State executive — pinned

- One compact card shows the current governor's full name, office, and party above the Senate cards.
- D.C. labels its executive as `Mayor` rather than implying it has a governor.
- The executive roster is locally stored with an authoritative source and retrieval date so it remains deterministic and visibly time-bound.

### Representatives — scrolling

- One row/card per current House member.
- Each item shows full name, party, and either `District N` or `At large`.
- Representatives are ordered numerically by district, with an at-large seat treated as district 0.
- Only this list scrolls on desktop; the panel header and senators do not.

## Map and list interaction

- County fills and county boundaries remain the base layer.
- County hover continues to display the county's real name.
- Representative hover or keyboard focus draws that representative's district above the county layer and below the selected-state outline.
- The overlay uses a translucent party fill beneath the county lines, plus a pure-black foreground boundary with a narrow white separator. The boundary renders above county lines so crossings remain unambiguous.
- Moving between representative items replaces the overlay directly; it does not reset or re-zoom the state.
- Clicking a representative pins that district. Hover may temporarily preview another district; leaving the list restores the pinned district.
- Clicking the pinned representative again clears the pin.
- Returning to `All states` clears every district hover and pin state.

## Political color

- Democrat: blue.
- Republican: red.
- Independent, other, or missing affiliation: charcoal.
- Party color is reserved for official affiliation and district interaction. The neutral county base should not imply political results.

## District and county geometry

- Congressional districts are a separate geometry layer and must not be inferred from county borders; districts can split counties.
- District geometry and House roster data must refer to the same Congress.
- The first implementation uses the 119th Congress:
  - current House roster from the Clerk of the U.S. House;
  - current senator roster from the U.S. Senate;
  - January 1, 2026-vintage 119th congressional districts from U.S. Census Bureau TIGERweb.
- Roster data and district geometry are stored locally for deterministic rendering. Their source and retrieval date are recorded with the data.
- County geometry comes from the existing local U.S. Atlas data. County names are read from its feature properties rather than generated from FIPS codes.

## D.C. and exceptional states

- The District of Columbia is selectable but does not falsely display senators.
- Its pinned Senate area states `No U.S. senators`.
- Its House delegate appears in the representative list and is labeled `Delegate · At large`.
- At-large states match district code `00` and display `At large` rather than `District 0`.
- If an official seat is vacant or a feed is temporarily incomplete, the interface shows an explicit unavailable/empty state rather than inventing a person.

## Mobile behavior

- State Focus becomes a map plus a bottom information sheet beneath the navbar.
- The map initially occupies roughly 40–45% of the available height.
- The sheet has a compact state header, state-executive card, two-card senator region, and an internally scrolling representatives region.
- The sheet may later gain collapsed, half, and full snap positions. The first implementation may use one stable split as long as all officials are reachable without document scroll.
- Hover-only behavior has a touch equivalent: tapping a representative pins the district overlay; tapping it again clears it.

## Motion

- The officials rail/sheet enters over approximately 500–650ms with the established quintic easing.
- The state is refitted after the layout allocates space to the rail, preventing a visible second jump.
- District previews fade in quickly (about 180–240ms) and do not animate geographic points independently.
- The pinned governor and Senate sections do not move when the representative list scrolls.

## Accessibility

- Senator cards are informational; representative rows are buttons because they control the map.
- Representative hover and keyboard focus produce the same district preview.
- Party names and district labels are written in text.
- The active/pinned representative exposes pressed state.
- The panel has a descriptive accessible label tied to the selected state.

## Acceptance

- Selecting any state refits it entirely inside the map column and opens its officials panel.
- Every state shows its current governor, two current senators, and current House delegation, subject to explicit vacancy handling.
- D.C. shows no senators and shows its current delegate.
- A representative's district overlay matches the selected state and never bleeds into another state's panel state.
- District overlays use the representative's party color while county borders remain visible.
- The officials list, not the page, scrolls for states with large delegations.
- The two senator cards remain visible while scrolling representatives.
- Keyboard users can preview, pin, unpin, and leave district selections.
- Returning to the national map removes the panel and all district interaction state.

## Open

- Official portraits are intentionally deferred; they add image sourcing, crop, and freshness requirements.
- The destination for clicking an official beyond pinning a district is not defined.
- Contact details, committee assignments, and voting records are outside this baseline.
- Exact bottom-sheet snap gestures remain a later mobile refinement.
