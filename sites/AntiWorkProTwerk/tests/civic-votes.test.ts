import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { demoCorpus } from '../scripts/said-did/fixtures';
import { buildVoteReceipts, publishVoteReceipts } from '../scripts/civic/votes';
import { searchReceipts } from '../src/lib/civic/votes';
import { loadVotes } from '../src/lib/civic/repository';

test('receipts preserve source questions and distinguish procedure, non-votes and unresolved text', () => {
  const corpus = demoCorpus(),
    data = buildVoteReceipts(corpus);
  assert.ok(data.receipts.length > 0);
  for (const r of data.receipts) {
    assert.deepEqual(
      r.action,
      corpus.actions.find((a) => a.id === r.id),
    );
    assert.ok(r.connections.some((c) => c.kind === 'measure' && c.id === r.action.measureId));
    if (r.action.kind === 'procedure') assert.match(r.cautions.join(' '), /procedural decision/);
    if (r.action.vote === 'Not Voting')
      assert.match(r.cautions.join(' '), /does not establish opposition/);
    if (r.action.operativeText !== 'established')
      assert.match(r.cautions.join(' '), /context only/);
  }
  assert.ok(data.receipts.some((r) => r.action.kind === 'procedure'));
  assert.ok(data.receipts.some((r) => r.action.vote === 'Not Voting'));
  assert.equal(
    Object.values(data.states).reduce((a, b) => a + b, 0),
    data.receipts.filter((r) => r.state).length,
  );
  assert.ok(searchReceipts(data, 'previous question').every((r) => r.action.kind === 'procedure'));
  assert.ok(searchReceipts(data, '', 'HI').length === 0);
  const member = data.receipts[0].person!.id;
  assert.ok(searchReceipts(data, '', '', '', member).every((r) => r.person!.id === member));
});

test('receipts do not turn sponsorship or voice votes into member votes', () => {
  const c = demoCorpus(),
    source = c.sources.find((s) => s.id === c.actions[0].sourceId)!;
  const action = c.actions[0];
  c.actions = [
    {
      ...action,
      id: 'voice-test',
      personId: null,
      roll: null,
      kind: 'voice',
      vote: 'Chamber action',
      rawVote: 'Voice vote',
    },
  ];
  source.text += '\nVoice vote';
  const r = buildVoteReceipts(c).receipts[0];
  assert.equal(r.person, null);
  assert.equal(r.state, null);
  assert.match(r.cautions.join(' '), /No individual member choice/);
  c.actions = [
    { ...action, kind: 'sponsorship', vote: 'Sponsored', rawVote: 'Sponsored', roll: null },
  ];
  source.text += '\nSponsored';
  assert.equal(buildVoteReceipts(c).receipts.length, 0);
});

test('dated state placement and source rights are publication gates', () => {
  const c = demoCorpus();
  c.people[0].terms.push({ ...c.people[0].terms[0] });
  const data = buildVoteReceipts(c);
  assert.ok(data.excluded.some((e) => e.reason.includes('unique dated')));
  assert.ok(!data.receipts.some((r) => r.person?.id === c.people[0].id));
  const restricted = demoCorpus();
  restricted.sources.forEach((s) => (s.publicationRights = 'third_party'));
  const held = buildVoteReceipts(restricted);
  assert.equal(held.receipts.length, 0);
  assert.equal(held.sources.length, 0);
  assert.equal(held.statements.length, 0);
});

test('statement connections retain exact text and source passage IDs, without judgments', () => {
  const corpus = demoCorpus(),
    data = buildVoteReceipts(corpus);
  assert.ok(data.statements.length > 0);
  for (const statement of data.statements) {
    const passage = corpus.passages.find((p) => p.id === statement.passageId)!;
    const source = corpus.sources.find((s) => s.id === statement.sourceId)!;
    assert.equal(statement.text, source.text.slice(passage.start, passage.end));
    assert.ok(!('assessment' in statement));
  }
  assert.ok(!JSON.stringify(data).includes('suggestedAssessment'));
});

test('publication is repeatable and bad input cannot replace the current pointer', async () => {
  const output = await mkdtemp(join(tmpdir(), 'ltw-votes-'));
  const corpus = demoCorpus();
  const first = await publishVoteReceipts(corpus, output);
  const second = await publishVoteReceipts(corpus, output);
  assert.equal(first.manifest.release, second.manifest.release);
  assert.equal((await readdir(join(output, 'releases'))).length, 1);
  const before = await readFile(join(output, 'manifest.json'), 'utf8');
  corpus.actions[0].question = 'This fabricated question is absent from the source';
  await assert.rejects(publishVoteReceipts(corpus, output), /Action facts absent/);
  assert.equal(await readFile(join(output, 'manifest.json'), 'utf8'), before);
});

test('repository pins its payload to a validated release and honors teammate base paths', async () => {
  const output = await mkdtemp(join(tmpdir(), 'ltw-votes-repo-'));
  const { manifest } = await publishVoteReceipts(demoCorpus(), output);
  const urls: string[] = [];
  const fetcher = async (url: string | URL | Request) => {
    urls.push(String(url));
    const file = String(url).replace('/AntiWorkProTwerk/data/votes/', '');
    return new Response(await readFile(join(output, file), 'utf8'));
  };
  const result = await loadVotes(fetcher as typeof fetch, '/AntiWorkProTwerk');
  assert.ok(result.data.receipts.length);
  assert.deepEqual(urls, [
    '/AntiWorkProTwerk/data/votes/manifest.json',
    `/AntiWorkProTwerk/data/votes/releases/${manifest.release}/data.json`,
  ]);
  await assert.rejects(
    loadVotes(
      (async () =>
        new Response(JSON.stringify({ ...manifest, release: '../private' }))) as typeof fetch,
    ),
  );
  await assert.rejects(
    loadVotes((async () => new Response('', { status: 503 })) as typeof fetch),
    /unavailable/,
  );
  let call = 0;
  const changed = buildVoteReceipts({
    ...demoCorpus(),
    scope: { ...demoCorpus().scope, title: 'Changed data' },
  });
  const corruptFetcher = async () =>
    new Response(JSON.stringify(++call === 1 ? manifest : changed));
  await assert.rejects(loadVotes(corruptFetcher as typeof fetch), /integrity/);
});
