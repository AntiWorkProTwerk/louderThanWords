import { z } from 'zod';
import { join } from 'node:path';
import {
  claimSchema,
  assessments,
  actionKinds,
  actionSchema,
  type Corpus,
  type Claim,
} from '../../src/lib/said-did/schema.ts';
import {
  generateCandidates,
  hash,
  normalizeText,
  measureMentions,
  validateClaims,
  validateCorpus,
} from './engine.ts';
import { defaultWorkspace, writeAtomic } from './pipeline.ts';

export const annotationSchema = z.object({
  passageId: z.string(),
  sourceHash: z.string(),
  // This is an annotation, not another model prediction. No automatic approvals.
  status: z.enum(['pending', 'agent_draft', 'human_reviewed']),
  reviewer: z.string(),
  reviewedAt: z.string().datetime({ offset: true }).nullable(),
  expectedPersonId: z.string().nullable(),
  expectedQuote: z.string(),
  expectedClaims: z.array(
    claimSchema.pick({
      targetId: true,
      type: true,
      stance: true,
      conditions: true,
      qualifiers: true,
      sentiment: true,
    }),
  ),
  pairs: z.array(
    z.object({
      actionId: z.string(),
      relevant: z.boolean(),
      actionKind: z.enum(actionKinds),
      expectedPersonId: z.string().nullable(),
      expectedVote: actionSchema.shape.vote,
      expectedDate: actionSchema.shape.date,
      expectedTime: actionSchema.shape.time,
      chronology: z.enum([
        'statement_before_action',
        'same_day_order_unknown',
        'action_before_statement',
        'unknown',
      ]),
      acceptableAssessments: z.array(z.enum(assessments)),
    }),
  ),
  notes: z.string(),
});
export const evaluationSchema = z.object({
  formatVersion: z.literal(1),
  id: z.string(),
  corpusHash: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  splitSeed: z.string(),
  cases: z.array(
    annotationSchema.extend({ split: z.enum(['development', 'held_out']), group: z.string() }),
  ),
});
export type EvaluationSet = z.infer<typeof evaluationSchema>;

// Connected components: shared bills OR shared debate dates must never cross
// the split. A small interconnected corpus may produce only one split; do not
// manufacture independent examples by splitting its near-duplicate turns.
export function evaluationGroups(corpus: Corpus) {
  const parent = new Map<string, string>();
  function root(id: string): string {
    const p = parent.get(id);
    if (!p) {
      parent.set(id, id);
      return id;
    }
    if (p === id) return id;
    const r = root(p);
    parent.set(id, r);
    return r;
  }
  function union(a: string, b: string) {
    const ra = root(a),
      rb = root(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const keys = new Map<string, string[]>();
  for (const passage of corpus.passages) {
    const mentions = measureMentions(
      normalizeText(corpus.sources.find((s) => s.id === passage.sourceId)!.text).text.slice(
        passage.start,
        passage.end,
      ),
    );
    const measures = corpus.measures.filter(
      (m) =>
        passage.contextMeasureId === m.id ||
        mentions.some((ref) => ref.type === m.type && ref.number === m.number),
    );
    const k = [`day:${passage.eventDate}`, ...measures.map((m) => `bill:${m.parentId ?? m.id}`)];
    keys.set(passage.id, k);
    k.forEach((key) => union(passage.id, key));
  }
  const components = new Map<string, string[]>();
  for (const p of corpus.passages) {
    const key = root(p.id);
    components.set(key, [...(components.get(key) ?? []), p.id]);
  }
  const groups = new Map<string, string>();
  for (const ids of components.values()) {
    const group = `group-${hash(ids.sort()).slice(0, 20)}`;
    ids.forEach((id) => groups.set(id, group));
  }
  return groups;
}
export function createEvaluationSet(input: unknown, seed = 'said-did-held-out-v1'): EvaluationSet {
  const corpus = validateCorpus(input),
    groups = evaluationGroups(corpus);
  return {
    formatVersion: 1,
    id: `eval-${hash([hash(corpus), seed]).slice(0, 16)}`,
    corpusHash: hash(corpus),
    createdAt: new Date().toISOString(),
    splitSeed: seed,
    cases: corpus.passages.map((p) => {
      const group = groups.get(p.id)!;
      return {
        passageId: p.id,
        sourceHash: hash(corpus.sources.find((s) => s.id === p.sourceId)!.text),
        group,
        split: parseInt(hash([seed, group]).slice(0, 8), 16) % 5 < 2 ? 'held_out' : 'development',
        status: 'pending',
        reviewer: '',
        reviewedAt: null,
        expectedPersonId: null,
        expectedQuote: '',
        expectedClaims: [],
        pairs: [],
        notes: '',
      };
    }),
  };
}
export function validateEvaluation(input: unknown, corpus: Corpus) {
  const set = evaluationSchema.parse(input),
    groups = evaluationGroups(corpus);
  if (set.corpusHash !== hash(corpus))
    throw new Error('Evaluation corpus changed; freeze a new dataset and recheck annotations.');
  if (new Set(set.cases.map((c) => c.passageId)).size !== set.cases.length)
    throw new Error('Duplicate evaluation case.');
  if (set.cases.length !== corpus.passages.length)
    throw new Error('Evaluation must include every passage, including abstentions and nonmatches.');
  const splits = new Map<string, string>();
  for (const c of set.cases) {
    const p = corpus.passages.find((p) => p.id === c.passageId);
    if (!p || c.sourceHash !== hash(corpus.sources.find((s) => s.id === p.sourceId)!.text))
      throw new Error('Stale or unknown annotated source.');
    if (c.group !== groups.get(c.passageId)) throw new Error('Evaluation grouping changed.');
    if (splits.has(c.group) && splits.get(c.group) !== c.split)
      throw new Error('Bill/debate-day leakage between development and held-out sets.');
    splits.set(c.group, c.split);
    if (c.status === 'human_reviewed' && (!c.reviewer.trim() || !c.reviewedAt || !c.expectedQuote))
      throw new Error('Human-reviewed annotations need reviewer, date and source quotation.');
    if (c.expectedPersonId && !corpus.people.some((person) => person.id === c.expectedPersonId))
      throw new Error('Unknown expected identity.');
    if (new Set(c.pairs.map((p) => p.actionId)).size !== c.pairs.length)
      throw new Error('Duplicate annotated pair.');
    for (const pair of c.pairs)
      if (!corpus.actions.some((a) => a.id === pair.actionId))
        throw new Error('Unknown annotated action.');
    for (const claim of c.expectedClaims)
      if (claim.targetId && !corpus.measures.some((m) => m.id === claim.targetId))
        throw new Error('Unknown annotated target.');
  }
  return set;
}
export function wilson(successes: number, n: number) {
  if (!n) return null;
  const p = successes / n,
    z = 1.959963984540054,
    denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half), confidence: 0.95 };
}
const ratio = (correct: number, total: number) => ({
  correct,
  total,
  value: total ? correct / total : null,
  interval: wilson(correct, total),
});

export function evaluateClaims(corpusInput: unknown, predictions: unknown, datasetInput: unknown) {
  const corpus = validateCorpus(corpusInput),
    claims = validateClaims(corpus, predictions),
    set = validateEvaluation(datasetInput, corpus);
  const candidates = generateCandidates(corpus, claims);
  const results = set.cases
    .filter((c) => c.status !== 'pending')
    .map((annotation) => {
      const p = corpus.passages.find((p) => p.id === annotation.passageId)!;
      const found = claims.filter((c) => c.passageId === p.id);
      const errors: string[] = [];
      if (p.personId !== annotation.expectedPersonId) errors.push('speaker');
      if (
        normalizeText(corpus.sources.find((s) => s.id === p.sourceId)!.text).text.slice(
          p.start,
          p.end,
        ) !== annotation.expectedQuote
      )
        errors.push('quote_boundary');
      if (found.length !== annotation.expectedClaims.length) errors.push('claim_count');
      const matchedExpected = new Set<number>();
      for (const actual of found) {
        const idx = annotation.expectedClaims.findIndex(
          (e, i) => !matchedExpected.has(i) && e.targetId === actual.targetId,
        );
        if (idx < 0) {
          errors.push('target');
          continue;
        }
        matchedExpected.add(idx);
        const expected = annotation.expectedClaims[idx];
        for (const key of ['type', 'stance', 'sentiment'] as const)
          if (actual[key] !== expected[key]) errors.push(key);
        for (const key of ['conditions', 'qualifiers'] as const)
          if (expected[key].some((q) => !actual[key].some((a) => a.includes(q)))) errors.push(key);
      }
      if (matchedExpected.size < annotation.expectedClaims.length) errors.push('missed_claim');
      const predictedPairs = candidates.filter((c) => c.passage.id === p.id && c.action);
      const pairResults = annotation.pairs.map((expected) => {
        const matching = predictedPairs.filter((c) => c.action!.id === expected.actionId);
        const actual = matching[0];
        return {
          actionId: expected.actionId,
          relevant: expected.relevant,
          retrieved: !!actual,
          exactReference: matching.some((c) => c.basis === 'explicit_measure'),
          actionCorrect: (() => {
            const action = corpus.actions.find((a) => a.id === expected.actionId)!;
            return action.kind === expected.actionKind && action.personId === expected.expectedPersonId &&
              action.vote === expected.expectedVote && action.date === expected.expectedDate && action.time === expected.expectedTime;
          })(),
          chronologyCorrect: actual ? actual.chronology === expected.chronology : null,
          assessmentCorrect:
            actual && expected.relevant
              ? expected.acceptableAssessments.includes(actual.suggestedAssessment)
              : null,
        };
      });
      const unannotatedPairs = [
        ...new Set(
          predictedPairs
            .filter((c) => !annotation.pairs.some((p) => p.actionId === c.action!.id))
            .map((c) => c.action!.id),
        ),
      ];
      return {
        passageId: p.id,
        split: annotation.split,
        status: annotation.status,
        group: annotation.group,
        errors: [...new Set(errors)],
        pairResults,
        unannotatedPairs,
        abstained: !found.length,
        expectedAbstention: !annotation.expectedClaims.length,
      };
    });
  const held = results.filter((r) => r.split === 'held_out' && r.status === 'human_reviewed');
  const pairs = held.flatMap((r) => r.pairResults),
    exact = pairs.filter((p) => p.retrieved && p.exactReference);
  const relevant = pairs.filter((p) => p.relevant),
    unknown = held.flatMap((r) => r.unannotatedPairs).length;
  const precision = ratio(exact.filter((p) => p.relevant).length, exact.length);
  const gates = {
    realCorpus: corpus.scope.mode === 'real',
    approximately200HumanCases:
      set.cases.filter((c) => c.status === 'human_reviewed').length >= 200,
    heldOutHumanCases: held.length > 0,
    developmentHumanCases: results.some(
      (r) => r.status === 'human_reviewed' && r.split === 'development',
    ),
    noUnannotatedHeldOutPredictions: unknown === 0,
    exactReferencePrecision95: precision.value !== null && precision.value >= 0.95,
    exactSpeakerAndQuote:
      held.length > 0 &&
      held.every((r) => !r.errors.some((e) => ['speaker', 'quote_boundary'].includes(e))),
    operativeActionCorrect: pairs.length > 0 && pairs.every((p) => p.actionCorrect),
    qualificationsAndStanceCorrect: held.length > 0 && held.every((r) => !r.errors.some((e) => ['stance', 'conditions', 'qualifiers'].includes(e))),
  };
  return {
    dataset: set.id,
    corpusHash: set.corpusHash,
    predictionHash: hash(claims),
    at: new Date().toISOString(),
    interpretation:
      'Only human-reviewed held-out cases contribute to acceptance metrics. Agent drafts are diagnostic, not independent truth. Model suggestions do not approve publication.',
    counts: {
      total: set.cases.length,
      humanReviewed: set.cases.filter((c) => c.status === 'human_reviewed').length,
      pending: set.cases.filter((c) => c.status === 'pending').length,
      heldOut: held.length,
      unannotatedPredictions: unknown,
    },
    exactReferencePrecision: precision,
    retrievalRecall: ratio(relevant.filter((p) => p.retrieved).length, relevant.length),
    completeClaimAccuracy: ratio(held.filter((r) => !r.errors.length).length, held.length),
    errorTypes: Object.fromEntries(
      [...new Set(results.flatMap((r) => r.errors))].map((type) => [
        type,
        results.filter((r) => r.errors.includes(type)).length,
      ]),
    ),
    gates,
    acceptance: Object.values(gates).every(Boolean)
      ? 'passed'
      : held.length
        ? 'failed'
        : 'pending_human_evaluation',
    results,
  };
}

export async function saveEvaluation(
  corpus: unknown,
  claims: unknown,
  dataset: unknown,
  workspace = defaultWorkspace,
) {
  const report = evaluateClaims(corpus, claims, dataset);
  await writeAtomic(join(workspace, 'evaluation', 'report.json'), report);
  await writeAtomic(join(workspace, 'evaluation', 'reports', `${hash(report)}.json`), report);
  return report;
}
