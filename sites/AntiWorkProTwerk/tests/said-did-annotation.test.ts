import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { demoCorpus } from '../scripts/said-did/fixtures.ts';
import { createEvaluationSet, validateEvaluation } from '../scripts/said-did/evaluation.ts';
import {
  renderAnnotationPacket,
  writeAnnotationPacket,
  refreshAnnotationPacket,
} from '../scripts/said-did/annotation-packet.ts';

test('annotation packet is source-linked, blank and does not import model predictions', () => {
  const corpus = demoCorpus(),
    dataset = createEvaluationSet(corpus);
  const html = renderAnnotationPacket(
    { ...corpus, claims: [{ meaning: 'SECRET_MODEL_PREDICTION' }] },
    dataset,
  );
  assert.ok(!html.includes('SECRET_MODEL_PREDICTION'));
  const payload = JSON.parse(
    html.match(/id="packet-data" type="application\/json">(.*?)<\/script>/s)![1],
  );
  assert.deepEqual(payload.dataset, dataset);
  assert.equal(payload.corpus.sources.length, corpus.sources.length);
  assert.ok(
    payload.dataset.cases.every(
      (c: any) =>
        c.status === 'pending' && !c.expectedQuote && !c.expectedClaims.length && !c.pairs.length,
    ),
  );
  assert.ok(html.includes("connect-src 'none'"));
});

test('untrusted source metadata cannot escape embedded JSON', () => {
  const corpus = demoCorpus();
  corpus.sources[0].title = '</script><script>alert(1)</script>\u2028 /* WORKSHEET_SCRIPT */';
  const html = renderAnnotationPacket(corpus, createEvaluationSet(corpus));
  assert.ok(!html.includes('</script><script>alert(1)'));
  assert.ok(html.includes('\\u003c/script>'));
  assert.ok(html.includes('/* WORKSHEET_SCRIPT */'));
});

test('packet preserves labels, validates corpus binding, and refuses overwrite', async () => {
  const corpus = demoCorpus(),
    dataset = createEvaluationSet(corpus);
  dataset.cases[0].notes = 'Existing human notes must survive.';
  const root = await mkdtemp(join(tmpdir(), 'said-did-annotation-')),
    directory = join(root, 'packet');
  await writeAnnotationPacket(corpus, dataset, directory);
  const stored = JSON.parse(await readFile(join(directory, 'annotations.json'), 'utf8'));
  assert.deepEqual(validateEvaluation(stored, corpus), dataset);
  await assert.rejects(writeAnnotationPacket(corpus, dataset, directory), /EEXIST/);
  assert.throws(
    () => renderAnnotationPacket(corpus, { ...dataset, corpusHash: 'stale' }),
    /corpus changed/,
  );
  const before = await readFile(join(directory, 'annotations.json'), 'utf8');
  const refreshed = await refreshAnnotationPacket(directory);
  assert.equal(await readFile(join(directory, 'annotations.json'), 'utf8'), before);
  assert.ok((await readFile(refreshed.backup, 'utf8')).includes('guided evidence review'));
});
