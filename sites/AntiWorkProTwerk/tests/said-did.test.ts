import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { demoCorpus, seed } from '../scripts/said-did/fixtures';
import {
  validateCorpus,
  normalizeText,
  extractDeterministic,
  validateClaims,
  generateCandidates,
  validateReview,
} from '../scripts/said-did/engine';
import {
  prepare,
  readStore,
  addReview,
  publish,
  rollback,
  currentPublication,
} from '../scripts/said-did/pipeline';
import { handleLocalEvidence } from '../scripts/said-did/local-api';
import { extractionRequest } from '../scripts/said-did/extraction';

test('Said/Did preserves exact spans and raw newline mappings; AI output cannot invent evidence', () => {
  const n = normalizeText('a\r\nb\rc');
  assert.equal(n.text, 'a\nb\nc');
  assert.deepEqual(n.rawOffsets, [0, 1, 3, 4, 5, 6]);
  const corpus = demoCorpus(),
    claims = extractDeterministic(corpus);
  assert.equal(validateClaims(corpus, claims).length, 9);
  const invented = structuredClone(claims);
  invented[0].quote = 'Invented quote';
  assert.throws(() => validateClaims(corpus, invented), /exact saved source span/);
  const clipped = structuredClone(claims);
  clipped[0].quoteEnd -= 1;
  clipped[0].quote = clipped[0].quote.slice(0, -1);
  assert.throws(() => validateClaims(corpus, clipped), /complete attributable passage/);
  const request = extractionRequest(corpus);
  assert.equal(request.publicationAllowed, false);
  assert.ok(request.instructions.includes('untrusted'));
});
test('Said/Did refuses ambiguous and third-party claims, duplicate member votes and bad text', () => {
  const corpus = demoCorpus();
  corpus.passages[0].attribution = 'ambiguous';
  assert.equal(extractDeterministic(corpus).length, 8);
  corpus.passages[1].kind = 'third_party';
  assert.equal(extractDeterministic(corpus).length, 7);
  const duplicate = demoCorpus();
  duplicate.actions.push({ ...duplicate.actions[0], id: 'different-id' });
  assert.throws(() => validateCorpus(duplicate), /Duplicate member vote/);
  const bad = demoCorpus();
  bad.measures[0].versions[0].provision = 'Not present in source';
  assert.throws(() => validateCorpus(bad), /Unsupported provision/);
  const floor = demoCorpus();
  floor.passages[0].kind = 'floor_verified';
  assert.throws(() => validateCorpus(floor), /media evidence/);
});
test('Said/Did handles procedure, absence, conditions, chronology, missing text and no matches conservatively', () => {
  const corpus = demoCorpus(),
    candidates = generateCandidates(corpus, extractDeterministic(corpus));
  const get = (n: number) => candidates.find((c) => c.passage.id === `passage-${n}`)!;
  assert.equal(get(1).suggestedAssessment, 'consistent');
  assert.equal(get(2).suggestedAssessment, 'apparent_tension');
  for (const n of [3, 4, 6, 7]) assert.equal(get(n).suggestedAssessment, 'context_dependent');
  assert.equal(get(3).action!.question, 'On Ordering the Previous Question');
  assert.equal(get(3).action!.kind, 'procedure');
  assert.equal(get(6).chronology, 'same_day_order_unknown');
  assert.equal(get(7).action!.vote, 'Not Voting');
  assert.ok(get(8).blockers.some((b) => b.includes('operative text')));
  assert.equal(get(9).status, 'unrelated');
  const reversed = demoCorpus();
  reversed.passages[0].eventDate = '2026-08-20';
  assert.ok(
    generateCandidates(reversed, extractDeterministic(reversed))[0].blockers.some((b) =>
      b.includes('subsequent'),
    ),
  );
});
test('Said/Did publications are repeatable, private reviews stay private, and corrections invalidate approval', async () => {
  const root = await mkdtemp(join(tmpdir(), 'said-did-test-')),
    workspace = join(root, 'work'),
    out = join(root, 'public');
  const first = await seed(workspace, out),
    again = await seed(workspace, out);
  assert.equal(first.release, again.release);
  const store = await readStore(workspace);
  assert.equal(store.runs.length, 1);
  assert.equal(store.reviews.length, 7);
  const stale = structuredClone(store.reviews[0]);
  stale.fingerprint = 'incorrect';
  assert.throws(
    () =>
      validateReview(
        store.candidates.find((c) => c.id === stale.candidateId)!,
        stale,
      ),
    /stale/,
  );
  const corpus = demoCorpus();
  corpus.sources.find((s) => s.id === 'statement-1')!.text +=
    ' A later editorial correction is now part of the saved source.';
  corpus.passages[0].end = corpus.sources.find((s) => s.id === 'statement-1')!.text.length;
  await prepare(corpus, { workspace });
  const changed = await publish(workspace, out);
  assert.notEqual(changed.release, first.release);
  const current = await currentPublication(out),
    old = store.candidates.find((c) => c.passage.id === 'passage-1')!;
  assert.equal(current!.comparisons.find((c) => c.id === old.id)!.status, 'correction_pending');
  await assert.rejects(() => rollback(first.release, workspace, out), /resurrect/);
  const before = await readFile(join(out, 'manifest.json'), 'utf8');
  const invalid = structuredClone(corpus);
  invalid.actions[0].sourceId = 'missing';
  await assert.rejects(() => prepare(invalid, { workspace }));
  assert.equal(await readFile(join(out, 'manifest.json'), 'utf8'), before);
  assert.ok(
    (await readdir(join(out, 'releases', changed.release))).every(
      (n) => !['store.json', 'reviews', 'archive', 'claims'].includes(n),
    ),
  );
  const rejected = structuredClone(store.reviews[1]);
  rejected.id = 'new-review';
  rejected.decision = 'rejected';
  await addReview(rejected, workspace);
  await publish(workspace, out);
});
test('local review endpoint rejects cross-origin writes and production hosts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'said-did-api-'));
  const response = await handleLocalEvidence(
    new Request('http://127.0.0.1:5173/api/local-evidence'),
    'local-token',
    root,
    join(root, 'public'),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).store, null);
  const evil = await handleLocalEvidence(
    new Request('http://127.0.0.1:5173/api/local-evidence', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'Content-Type': 'application/json',
        'X-LTW-Local-Review': 'local-token',
      },
      body: '{}',
    }),
    'local-token',
    root,
  );
  assert.equal(evil.status, 403);
  const missing = await handleLocalEvidence(
    new Request('http://127.0.0.1:5173/api/local-evidence', {
      method: 'POST',
      headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' },
      body: '{}',
    }),
    'local-token',
    root,
  );
  assert.equal(missing.status, 403);
  const production = await handleLocalEvidence(
    new Request('https://louderthanwords.fyi/api/local-evidence'),
    'local-token',
    root,
  );
  assert.equal(production.status, 403);
});
