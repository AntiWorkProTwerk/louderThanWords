# Independent annotation packet

The local real-data pilot has 41 pending passages from the January 7, 2025 House
debate around H.R. 29. It is one connected bill/day group, all development—not
an independent held-out benchmark. No model labels are supplied as ground truth.

Open `.local/said-did/real-pilot/evaluation/annotation-packet/index.html` directly
in your browser. The opening walkthrough explains the project, the collected
records, the expected result and the limits of this pilot. Click **Start with one
passage** and follow four plain-language steps: read and attribute, interpret,
compare actions, then save your review. There is no JSON editor.

Use **Download my progress** frequently; edits are held in the tab, not saved to
disk automatically. **Resume a saved file** restores your download, including
unfinished cards. No answers are guessed to complete a card. Incomplete cards are
stored in an optional `_worksheet` draft extension; only fully specified labels
enter the evaluation contract, and pending cases never count as human truth.
Human review is explicit and does not approve anything for public display.
Editing a reviewed case returns it to pending. Old JSON-only downloads still work.

The packet includes full archived source text, parser-proposed turns, identity and
measure inventories, all scoped actions, a blank JSON template and the JSON schema.
It intentionally excludes model extractions and predicted comparisons. Parser
metadata is not independent truth: verify identities, boundaries and action facts.

To reproduce a packet (run from `sites/AntiWorkProTwerk`; use a new output directory):

```powershell
npm run said-did -- annotation-packet --input .local/said-did/real-pilot/acquisition/corpus.json --dataset .local/said-did/real-pilot/evaluation/eval-9c2d5539b62f14e9.json --out .local/said-did/real-pilot/evaluation/annotation-packet
```

After completing and locking independent labels, evaluate the downloaded JSON
against the frozen corpus and cached Luna predictions. This invokes no model:

```powershell
npm run said-did -- evaluate --input .local/said-did/real-pilot/acquisition/corpus.json --dataset PATH-TO-DOWNLOADED-ANNOTATIONS.json --extractions .local/said-did/real-pilot/model/claims.json --workspace .local/said-did/real-pilot
```

An unmet acceptance gate returns a nonzero exit code; that is not evidence of a
broken annotation file. This pilot cannot satisfy the full acceptance gate, even
when all 41 labels are reviewed. Expand collection to independent bill/day groups
and at least 200 human-reviewed passages with development and held-out groups
before claiming benchmark accuracy. Keep disagreements and adjudications in notes.

The packet and raw data remain ignored, local files; the reusable exporter and
instructions are source-controlled. Existing labels and public demo data are not
overwritten by packet creation.

To update an existing packet's interface without changing its frozen corpus or
annotation file (the old HTML is backed up alongside it):

```powershell
npm run said-did -- annotation-refresh --out .local/said-did/real-pilot/evaluation/annotation-packet
```

Download any in-tab edits before refreshing the browser. The generator cannot read
unsaved browser memory. For an offline form regression test using installed Edge:

```powershell
npx tsx --test tests/said-did-worksheet.browser.ts
```
