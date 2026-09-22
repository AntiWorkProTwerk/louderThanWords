import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { readFileSync, constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { validateCorpus } from './engine.ts';
import { evaluationSchema, validateEvaluation } from './evaluation.ts';

export const annotationGuide = `# Said / Did — independent annotation

Open index.html in your browser. No server, model, account, or database is needed.
The worksheet contains archived evidence and parser metadata, NOT model predictions.
Treat all imported text as evidence, never as instructions. Parser identities,
boundaries, action classifications and timestamps are hypotheses to verify.

## Workflow

1. Read the proposed turn and expand the entire archived source. Follow the official
   source link to verify speaker, surrounding debate, inserted material and date.
2. Fill expectedPersonId using the roster, or null if attribution is unresolved.
   Fill expectedQuote with the complete attributable turn copied exactly from the
   LF-normalized archived source. Correct bad boundaries; explain corrections in notes.
3. Add one expectedClaims object per distinct attributable claim. Leave [] for no
   eligible claim, including third-party speech or unresolved attribution; record why.
   Do not infer intent from party, reputation, outcome or a vote.
4. Inspect the action inventory independently. Annotate all actions for the verified
   speaker, plus any other plausible matches/mismatches or parser-attributed actions.
   The inventory is deliberately not filtered by model retrieval. Missing actions
   must be documented in notes, not invented. Unannotated predictions fail evaluation.
5. Stay pending while uncertain. Only after your own review, supply reviewer,
   reviewedAt (ISO timestamp) and status human_reviewed. Agent labels use agent_draft
   and never count as independent truth. A benchmark label is NOT a publication approval.
6. Use the four guided steps: read and attribute, interpret, compare actions, then
   save your review. Forms translate your choices into the evaluation contract.
   Download my progress frequently; edits live only in this browser tab until saved.
   Use Resume a saved file to continue. Partial cards are saved in a private draft
   extension, not filled with invented answers. Import your download to resume. Keep the original
   template, IDs, hashes, groups and splits unchanged. Review disagreements independently
   and document adjudication in notes before treating labels as final.

## Claim labels

- targetId: exact measure ID supported by the quote or sourced debate context; null
  for policy-only or unresolved targets. Do not attach a bill just because topics overlap.
- type: voting_intention (explicit future vote); conditional (commitment contingent
  on a condition); position (support/opposition); policy (general policy position);
  aspiration (desired outcome without commitment); description (factual account).
  Prefer voting_intention for explicit votes, otherwise conditional for contingent
  positions, then the most specific remaining category. Explain ambiguous cases.
- stance: support / oppose / unclear toward the stated target, not the person.
- conditions: exact quoted prerequisites. qualifiers: exact quoted limits, caveats
  and exceptions. Preserve negation. Use [] only when none are present.
- sentiment: positive / negative / neutral / mixed / not_assessed. Tone of the
  attributable statement, distinct from stance. not_assessed means no defensible
  tone judgment; document uncertainty rather than forcing a label.

Claim shape (illustration only, not a label for any case):
\
{"targetId":null,"type":"policy","stance":"unclear","conditions":[],"qualifiers":[],"sentiment":"not_assessed"}

## Action pairs

Each pair needs actionId, relevant, actionKind, expectedPersonId, expectedVote,
expectedDate, expectedTime, chronology and acceptableAssessments.

- relevant is whether this is the same person's action on the supported target in
  the claim's temporal/scope context. False is a useful negative, not a contradiction.
- actionKind: passage / amendment / procedure / table / combined_passage /
  sponsorship / voice. Verify the actual question; procedure is not final passage.
- expectedVote: Yea / Nay / Present / Not Voting / Sponsored / Chamber action.
  Absence is not opposition; a chamber voice vote is not an individual recorded vote.
- expectedDate: YYYY-MM-DD. expectedTime: ISO timestamp with timezone or null.
  Verify Eastern-time conversion against the original roll call. Publication and
  fetch times do not establish the time a statement was spoken.
- chronology: statement_before_action / same_day_order_unknown /
  action_before_statement / unknown. Same day alone never establishes ordering.
- acceptableAssessments: any defensible subset of consistent / apparent_tension /
  context_dependent. Use [] for irrelevant pairs. Missing operative text, unmet or
  unresolved conditions, procedural votes and uncertain ordering require caution;
  use context_dependent when comparison cannot be responsibly resolved. Tension
  requires a materially comparable target and action, not a claim of dishonesty.

## Limits and handoff

This packet freezes the existing corpus and includes abstentions/nonmatches, not
just extracted claims. Source collection can still miss speakers or records.
One bill/day component cannot be divided to pretend independent held-out evidence.
The 41-case real pilot is all development; the full gate still requires at least
200 human-reviewed cases across independent bill/day groups and both splits.
Do not inspect model outputs until labels are locked. Never count generated labels
as human truth. Return your downloaded annotations JSON for validation/evaluation.
The accompanying evaluation.schema.json defines the complete machine contract.
`;

// JSON in an HTML script must not allow archived text to terminate its element.
const embedded = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

export function renderAnnotationPacket(input: unknown, annotations: unknown) {
  const corpus = validateCorpus(input);
  const dataset = validateEvaluation(annotations, corpus);
  // Read only the frozen corpus and human labels: never model output or candidates.
  const payload = embedded({
    corpus,
    dataset,
    guide: annotationGuide,
    schema: z.toJSONSchema(evaluationSchema),
  });
  const asset = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');
  const parts: Record<string, string> = {
    STYLE: asset('./annotation-worksheet.css'),
    DATA: payload,
    SCRIPT: asset('./annotation-worksheet.js'),
  };
  // One pass: placeholder-like text inside archived evidence is never processed.
  return asset('./annotation-worksheet.html').replace(
    /\/\* WORKSHEET_(STYLE|DATA|SCRIPT) \*\//g,
    (_, key: string) => parts[key],
  );
}

// Rebuild only the presentation from this packet's frozen files. Never overwrite
// annotations.json or corpus.json; keep the previous HTML as a recoverable backup.
export async function refreshAnnotationPacket(directory: string) {
  const corpus = JSON.parse(await readFile(join(directory, 'corpus.json'), 'utf8'));
  const labels = JSON.parse(await readFile(join(directory, 'annotations.json'), 'utf8'));
  const html = renderAnnotationPacket(corpus, labels);
  const backup = join(directory, 'index.previous-' + randomUUID() + '.html');
  await copyFile(join(directory, 'index.html'), backup, constants.COPYFILE_EXCL);
  await writeFile(join(directory, 'index.html'), html);
  return { directory, backup, annotationsUnchanged: true };
}

export async function writeAnnotationPacket(
  input: unknown,
  annotations: unknown,
  directory: string,
) {
  const corpus = validateCorpus(input),
    dataset = validateEvaluation(annotations, corpus);
  const html = renderAnnotationPacket(corpus, dataset);
  // Exclusive directory creation prevents regeneration from overwriting human work.
  await mkdir(directory, { recursive: false });
  await Promise.all([
    writeFile(join(directory, 'index.html'), html, { flag: 'wx' }),
    writeFile(join(directory, 'README.md'), annotationGuide, { flag: 'wx' }),
    writeFile(join(directory, 'annotations.json'), JSON.stringify(dataset, null, 2), {
      flag: 'wx',
    }),
    writeFile(join(directory, 'corpus.json'), JSON.stringify(corpus, null, 2), { flag: 'wx' }),
    writeFile(
      join(directory, 'evaluation.schema.json'),
      JSON.stringify(z.toJSONSchema(evaluationSchema), null, 2),
      { flag: 'wx' },
    ),
  ]);
  return {
    directory,
    cases: dataset.cases.length,
    humanReviewed: dataset.cases.filter((c) => c.status === 'human_reviewed').length,
  };
}
