# 08 — Presidential election layer

## Purpose

Replace neutral placeholder fills with an explicitly dated presidential-election result while preserving the map's existing geographic and federal-official interactions.

The map describes how votes were cast in a selected election. It does not label a state, county, or its residents as having a political affiliation.

## Year control

- A single global dropdown is visible in both National Map and State Focus.
- The control is labeled `Presidential vote` and contains `2016`, `2020`, and `2024`.
- `2024` is the initial selection.
- Only one election is displayed at a time.
- Changing the year updates state fills, county fills, the map readout, and the State Focus summary together without reloading or re-zooming the map.
- The native select remains keyboard- and touch-operable.

## Color encoding

- A Democratic plurality uses blue.
- A Republican plurality uses red.
- Color intensity is based on the absolute Democratic-versus-Republican margin as a share of all presidential votes recorded in that geography.
- Close results are pale; larger margins are progressively more saturated and darker.
- Both parties use the same mathematical scale.
- Missing or geographically incompatible results remain neutral gray.
- Color is never the only explanation: the selected year, party margin, and vote shares appear in text.

## Dynamic result field

### National Map

- Hovering or focusing a state updates the existing map readout.
- The readout contains the state name, selected election year, Democratic share, Republican share, and winner/margin.
- Example: `2024 President · D 48.3% · R 50.1% · R+1.8`.

### State Focus

- With no county hovered, the readout and panel header show the selected state's result.
- Hovering a county replaces the map readout with that county's result.
- Leaving the county restores the state result.
- The officials panel continues to describe the current delegation; election year changes do not alter official cards.

## Layer interaction

- State election color is the base fill in National Map.
- County election color is the base fill in State Focus.
- Existing state and county borders remain legible above the fill.
- County hover strengthens the county's election color and retains its existing lift treatment.
- A representative's party-tinted congressional-district preview remains above county election fills; its pure-black boundary and narrow white separator render above county borders.
- The district preview represents the current representative's affiliation; the county base represents the selected presidential election. These are distinct concepts and remain labeled separately.
- A question-mark control beside the election year explains the encoding on hover or keyboard focus and opens persistently when clicked or tapped. Its copy states that hue indicates the leading party, resting saturation indicates the Democratic–Republican vote margin, hover temporarily deepens the color, and gray means tied or unavailable.

## Data definition

- Results are presidential general-election vote totals for 2016, 2020, and 2024.
- Democratic and Republican shares use all recorded presidential votes as the denominator, including votes for other candidates in the total.
- Margin is `Democratic share - Republican share`, expressed in percentage points.
- State totals are calculated by summing the result geographies within each state.
- County records join to the existing map by five-digit county FIPS code.
- The local application file stores only normalized Democratic votes, Republican votes, and total presidential votes.

## Sources and limitations

- Nationwide county-level files are compiled from state and media result sources because the United States has no single federal county-results feed.
- The Federal Election Commission explains that state election offices certify results and that its own official compilation is state-level.
- The 2016 implementation uses a documented mirror of the MIT Election Data and Science Lab county-return file and applies its `TOTAL`-mode records.
- The implementation uses the public `US_County_Level_Election_Results_08-24` compilation for the already-normalized 2020 and 2024 county/district rows.
- MIT Election Data and Science Lab remains the research reference, but its current Harvard Dataverse download requires a guestbook response and its later county-FIPS revisions require validation before replacing the normalized 2020/2024 inputs.
- Every normalized county FIPS is checked against the map's local county topology before it is included.
- This visualization is descriptive historical data, not polling, forecasting, party registration, or a claim about every resident.

## Geographic exceptions

- Alaska reports presidential returns by state legislative district, not by county-equivalent geography.
  - Alaska receives a correct statewide result.
  - Alaska county-equivalent shapes remain neutral and show `County result unavailable`.
- D.C.'s ward results are aggregated into the District of Columbia's single county-equivalent map shape.
- Connecticut's 2024 results use the state's newer planning-region county equivalents, while the current map asset contains the eight historical counties. Those eight shapes remain neutral for 2024 rather than receiving mismatched results.
- Kalawao County, Hawaii has no separate row in these inputs and remains neutral.
- A missing county-year record remains gray and is described as unavailable; it never inherits its state's result.

## Motion

- Year changes crossfade fill colors over approximately 300–450ms.
- The map does not zoom or replay its entry animation when the year changes.
- Hover color changes remain faster than year changes.

## Accessibility

- The year selector has a persistent visible label.
- Result text includes party letters, percentages, and margin, so meaning does not depend on color perception.
- State keyboard focus exposes the same result as pointer hover.
- The result field is announced politely when its geography or year changes.
- Missing-data text is explicit.

## Acceptance

- The dropdown offers exactly 2016, 2020, and 2024 and initially selects 2024.
- Every available state changes color when the selected year's result changes.
- Every county with a matching FIPS record uses the selected year's result.
- The state/county result field updates without a page navigation or map re-zoom.
- Democratic and Republican margins of equal magnitude receive equal visual strength.
- Vote shares and margin are calculated from the same underlying totals used for fill color.
- Alaska does not display legislative-district results as county results.
- D.C. displays its aggregate result rather than one ward's result.
- Congressional-district previews remain visible above the election layer.
- Desktop and mobile remain confined to one viewport.
