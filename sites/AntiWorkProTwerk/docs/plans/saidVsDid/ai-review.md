# AI reviewing AI — development workflow

Human annotation is optional during development. The new second pass uses the
existing installed Codex runner with **gpt-5.6-luna / high**, a fresh session and a
skeptical review prompt. It audits the first AI's interpretation against archived
evidence, including passages where extraction abstained. No database or external
task service is required. Inference still happens through your Codex account;
records, reports, orchestration and caches remain local.

## Use it

Open `http://127.0.0.1:5173/said-vs-did/review/`. The **Let Luna challenge the first
pass** panel shows the real-source pilot separately from the working demo. It has
an explicit inference opt-in, report download, filters, original-source links,
the first-pass interpretation, the second-pass rationale and evidence limitations.
Opening the page does not call a model. A report whose corpus, claims or reviewer
version changed is marked outdated.

From `sites/AntiWorkProTwerk`:

```powershell
npm run said-did -- review-ai --workspace .local/said-did/real-pilot --batch-size 6
```

Or provide `--input corpus.json --extractions claims.json --workspace LOCAL-DIRECTORY`.
`--offline` forbids this command. Identical validated batches are reused; the
ordinary run never uses fresh inference for those batches. Failed output gets at
most two validation repairs; failures and every received response are retained.
Large batches shrink before inference rather than truncating evidence. A single
oversized passage/document fails with an actionable error.
The default is six passages per batch and at most two requests in flight. Duplicate
quote/provision text is referenced by source and offsets rather than sent twice.
Each request has a five-minute timeout. Failure leaves completed batches reusable;
the workbench shows validated partial results as incomplete and polls every 15 seconds.
The reviewer uses the extractor's position-only scope: procedural call-ups and
consent requests do not become “missed claims” merely because they contain facts.

## Outputs

- `ai-review/report.json`: latest complete report, with model/version, corpus and
  prediction hashes, timestamp, counts, source citations, comparisons and usage.
- `ai-review/runs/`: immutable complete reports.
- `ai-review/cache/`: validated request-bound batch results.
- `ai-review/requests/`: exact prompts and output schemas, tied to request hashes.
- `ai-review/attempts/` and `failures/`: diagnostic receipts, including rejected output.

The report is portable JSON and `reviewWithCodex` is a reusable async stage for a
future task runner. It deliberately does not edit original claims, source facts,
human annotations, editorial approvals, or public snapshots. Disagreements are a
queue for investigation, not automatic changes to the first-pass extraction.

## What the labels mean

**Extraction supported:** the second pass agrees that the first pass's reading is
supported by the supplied evidence. It does not certify the politician's factual
assertions. **Disputed:** an identifiable extraction problem. **Insufficient
evidence:** the reviewer cannot responsibly resolve the extraction.

Comparisons are reviewed separately: consistent, apparent tension, context
dependent, or not comparable. Code refuses a conclusive comparison when existing
blockers/cautions remain or the extraction is disputed. No action means no
comparison. Every supplied passage/candidate must be returned exactly once;
citations must resolve to exact substrings of evidence actually sent in that batch.
Only a unique whitespace-only reflow can be aligned by code; words, punctuation,
case and negation cannot be changed. The saved citation uses the original text.

All reports are **agent_draft**, with `independentGroundTruth: false` and
`publicationAllowed: false`. Same-model agreement is correlated, not independently
measured accuracy. The human benchmark and public approval gates remain unchanged.
You can continue developing without filling the worksheet, but cannot call this
human validation or use it to claim the 200-case / 95% benchmark passed.

The implementation follows official [Codex non-interactive execution and structured
outputs](https://learn.chatgpt.com/docs/non-interactive-mode): isolated read-only
execution and a machine-readable output schema. Existing authentication stays in
Codex; no credential file is read or copied by this pipeline.
