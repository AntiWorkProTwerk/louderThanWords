# 09 — Bill analysis

## Purpose

Add a second analysis workspace for understanding federal legislation and the recorded votes attached to it. The feature must describe what Congress actually voted on, connect recorded votes to legislators, and avoid reducing procedural votes to misleading claims about final passage.

## Navigation

- Two persistent actions sit beside the `Actions` wordmark in the top navigation.
- `Explore` opens the existing states, elections, counties, and officials workspace.
- `Learn` opens the bill-analysis workspace.
- The active action is indicated by darker text and a restrained underline; both destinations remain visible at all times.

## Baseline bill workspace

- A searchable bill list supports bill number, title, sponsor, and policy-area queries.
- Selecting a bill opens its analysis without navigating away from the one-page application.
- The selected bill shows:
  - bill number and official title;
  - a plain-language CRS summary when available;
  - sponsor and cosponsors;
  - committees and policy area;
  - current legislative status and latest action;
  - a chronological action timeline;
  - links to official bill text and source records.
- The interface distinguishes bills, resolutions, amendments, motions, and nominations rather than labeling all congressional activity as a bill vote.

## Recorded votes

- Each roll call is a distinct event with its chamber, date, roll number, exact question, required threshold, result, and totals.
- The interface never treats a cloture vote, motion to proceed, rule vote, amendment vote, or motion to reconsider as final passage.
- Plain-language framing may supplement the official question, but the official question remains visible.
- Member positions use the chamber's own values such as `Yea`, `Nay`, `Present`, and `Not Voting`.
- A member who was not serving in that chamber on the vote date is labeled `Not a member for this vote`; no position is inferred.

## Politician connection

- Selecting a recorded House vote annotates representatives; selecting a recorded Senate vote annotates senators.
- The state panel can show each relevant official's recorded position for the selected roll call.
- House members are joined through Bioguide ID from the Clerk's vote record.
- Senate records retain both Senate LIS member ID and Bioguide ID; a verified crosswalk joins the vote record to the local roster.
- Rosters are snapshotted by Congress and retrieval date so historical votes are not joined against an incompatible current roster.
- Party affiliation provides context but never substitutes for an actual vote.

## Official data sources

- Congress.gov API v3 supplies bill metadata, sponsors, cosponsors, actions, summaries, subjects, committees, amendments, related bills, and text-version links. It requires a free API key and has a published rate limit.
- The Office of the Clerk of the U.S. House supplies official House roll-call XML with member-level positions.
- The U.S. Senate supplies official roll-call XML with member-level positions, the exact question, vote threshold, and result.
- Data is normalized by a local sync script and stored as static JSON for deterministic rendering. The browser does not hold the Congress.gov API key.

## Initial reference case: H.R. 3633

- `H.R. 3633 — Digital Asset Market Clarity Act of 2025` is the initial end-to-end test case.
- House roll call 199 on July 17, 2025 was final passage and passed 294–134.
- Senate roll call 234 on September 15, 2026 was cloture on the motion to proceed and was rejected 49–50, below the required three-fifths threshold.
- The Senate event blocked the measure from advancing at that point; it was not a final Senate passage vote.
- The test case must display both events and their different procedural meanings.

## Initial implementation

- The normalized bill, action, vote-event, and member-vote data model is implemented.
- The official-source sync script reads `CONGRESS_API_KEY` only at sync time and writes no credential to public data.
- H.R. 3633, its 32 recorded actions, House passage vote, and Senate cloture vote are imported and validated.
- The fixed-viewport workspace includes bill metadata, CRS summary, latest action, official links, vote-event tabs, procedural explanations, totals, searchable member positions, and a collapsible action timeline.
- The current scope contains one reference bill. Broader bill search, incremental current-Congress updates, and vote annotations on the state/official cards remain subsequent phases.

## Acceptance criteria

- The navigation makes the two analysis modes understandable without exposing an unfinished blank view.
- Every vote position is traceable to an official House or Senate roll-call record.
- The selected roll call's exact procedural question and threshold are visible.
- H.R. 3633's House passage and Senate cloture failure are not conflated.
- Vote-to-member joins survive duplicate surnames and mid-Congress roster changes.
- API credentials never ship in the client bundle or committed data.
- The page retains its fixed-viewport behavior; internal lists may scroll.
