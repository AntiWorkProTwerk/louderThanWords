import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { demoCorpus, seed } from '../scripts/said-did/fixtures.ts';
import { extractDeterministic, generateCandidates } from '../scripts/said-did/engine.ts';
import {
  reviewBatch,
  validateAiReview,
  reviewWithCodex,
  currentAiReview,
} from '../scripts/said-did/ai-review.ts';
import { handleLocalEvidence } from '../scripts/said-did/local-api.ts';

function response(data: any) {
  return {
    cases: data.passages.map((p: any) => ({
      passageId: p.id,
      extractionVerdict: 'supported',
      issues: [],
      rationale: 'Synthetic test response only; not independent ground truth.',
      citations: [
        {
          sourceId: p.sourceId,
          quote: data.evidence.find((e: any) => e.sourceId === p.sourceId).text.slice(0, 40),
        },
      ],
      comparisons: data.candidates
        .filter((c: any) => c.passageId === p.id)
        .map((c: any) => ({
          candidateId: c.id,
          conclusion: c.actionId ? 'context_dependent' : 'not_comparable',
          rationale: 'The synthetic test preserves the supplied evidence limitations.',
        })),
    })),
  };
}
test('AI review covers abstentions, rejects invented citations and cannot override blockers', () => {
  const corpus = demoCorpus(),
    claims = extractDeterministic(corpus),
    candidates = generateCandidates(corpus, claims);
  const batch = reviewBatch(
    corpus,
    claims,
    candidates,
    corpus.passages.map((p) => p.id),
  );
  const good = response(batch.data);
  assert.equal(validateAiReview(good, batch).length, corpus.passages.length);
  const bad = structuredClone(good);
  bad.cases[0].citations[0].quote = 'Not in any source anywhere.';
  assert.throws(() => validateAiReview(bad, batch), /exact substring/);
  assert.throws(
    () => validateAiReview({ cases: good.cases.slice(1) }, batch),
    /each supplied passage/,
  );
  const blocked = candidates.find((c) => c.blockers.length)!;
  const override = structuredClone(good);
  override.cases
    .find((r: any) => r.passageId === blocked.passage.id)
    .comparisons.find((c: any) => c.candidateId === blocked.id).conclusion = 'consistent';
  assert.throws(() => validateAiReview(override, batch), /cannot|No action/);
  const noClaims = reviewBatch(corpus, [], [], [corpus.passages[0].id]);
  assert.equal(validateAiReview(response(noClaims.data), noClaims)[0].comparisons.length, 0);
});
test('AI audit is cached, hash-bound and cannot change human annotations or publication', async () => {
  const root = await mkdtemp(join(tmpdir(), 'said-did-ai-review-')),
    workspace = join(root, 'private'),
    output = join(root, 'public');
  await seed(workspace, output);
  const before = await readFile(join(workspace, 'store.json'), 'utf8'),
    publicBefore = await readFile(join(output, 'manifest.json'), 'utf8');
  const corpus = demoCorpus(),
    claims = extractDeterministic(corpus);
  let calls = 0;
  const runner = async ({ prompt }: any) => {
    calls++;
    const data = JSON.parse(
      prompt.split('UNTRUSTED EVIDENCE JSON:\n')[1].split('\nVALIDATION FEEDBACK')[0],
    );
    return {
      response: response(data),
      usage: { input_tokens: 20, output_tokens: 10 },
      elapsedMs: 1,
    };
  };
  const first = await reviewWithCodex(corpus, claims, { workspace, runner });
  assert.equal(first.counts.passages, corpus.passages.length);
  assert.equal(first.status, 'agent_draft');
  assert.equal(first.publicationAllowed, false);
  assert.equal(first.independentGroundTruth, false);
  const n = calls,
    second = await reviewWithCodex(corpus, claims, { workspace, runner });
  assert.equal(calls, n);
  assert.ok(second.batches.every((b) => b.cached));
  assert.equal((await currentAiReview(corpus, claims, workspace))!.stale, false);
  assert.equal((await currentAiReview(corpus, [], workspace))!.stale, true);
  assert.equal(await readFile(join(workspace, 'store.json'), 'utf8'), before);
  assert.equal(await readFile(join(output, 'manifest.json'), 'utf8'), publicBefore);
  assert.equal((await readdir(workspace)).includes('evaluation'), false);
  assert.ok(first.cases.every((c) => c.citations.every((s) => s.quote.length > 0)));
  await rename(join(workspace, 'ai-review', 'report.json'), join(workspace, 'ai-review', 'archived-report.json'));
  const partial = await currentAiReview(corpus, claims, workspace);
  assert.equal(partial!.complete, false);
  assert.equal(partial!.counts.passages, corpus.passages.length);
  assert.equal(partial!.stale, false);
});
test('AI review rejects repeated bad output, saves failure receipts, and requires API consent', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'said-did-ai-reject-')),
    corpus = demoCorpus();
  let calls = 0;
  await assert.rejects(
    reviewWithCodex(corpus, extractDeterministic(corpus), {
      workspace,
      concurrency: 1,
      runner: async () => {
        calls++;
        return { response: { cases: [] }, usage: {}, elapsedMs: 0 };
      },
    }),
    /each supplied passage/,
  );
  assert.equal(calls, 3);
  assert.equal((await readdir(join(workspace, 'ai-review', 'failures'))).length, 1);
  await assert.rejects(readFile(join(workspace, 'ai-review', 'report.json')), /ENOENT/);
  const request = (body: unknown) =>
    new Request('http://localhost:5173/api/local-evidence', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
        'x-ltw-local-review': 'test-token',
      },
      body: JSON.stringify(body),
    });
  const denied = await handleLocalEvidence(
    request({ operation: 'review-ai' }),
    'test-token',
    workspace,
  );
  assert.equal(denied.status, 400);
  assert.match((await denied.json()).error, /consent/);
  const traversal = await handleLocalEvidence(
    request({ operation: 'review-ai', allowRemoteInference: true, target: '../../outside' }),
    'test-token',
    workspace,
  );
  assert.equal(traversal.status, 400);
  assert.match((await traversal.json()).error, /fixed real-pilot/);
});
