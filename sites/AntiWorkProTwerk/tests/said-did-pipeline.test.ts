import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { demoCorpus } from '../scripts/said-did/fixtures';
import { extractDeterministic, hash } from '../scripts/said-did/engine';
import { extractWithCodex, type ModelRequest } from '../scripts/said-did/codex-extractor';
import {
  parseRecord,
  parseVote,
  parseBill,
  parseXml,
  fetchOfficial,
  officialUrl,
  actionKind,
  acquisitionSchema,
} from '../scripts/said-did/sources';
import {
  createEvaluationSet,
  evaluateClaims,
  validateEvaluation,
  wilson,
} from '../scripts/said-did/evaluation';
import { handleLocalEvidence } from '../scripts/said-did/local-api';
import { prepare } from '../scripts/said-did/pipeline';

const temp = () => mkdtemp(join(tmpdir(), 'ltw-pipeline-test-'));
const at = '2025-01-07T20:00:00Z';
const identity = {
  id: 'test-person',
  bioguideId: 'T000001',
  fictional: false,
  name: 'Test Member',
  aliases: ['TEST'],
  evidenceUrl: 'https://www.govinfo.gov/metadata/pkg/CREC-2025-01-07/mods.xml',
  lisId: 'S001',
  terms: [
    {
      chamber: 'House' as const,
      state: 'TX',
      party: 'D' as const,
      district: '1',
      from: '2025-01-01',
      to: '2025-12-31',
    },
  ],
};
const recordDoc = {
  id: 'test-record',
  kind: 'record' as const,
  url: 'https://www.govinfo.gov/content/pkg/CREC-2025-01-07/html/CREC-2025-01-07-pt1-PgH1.htm',
  date: '2025-01-07',
  congress: 119,
  chamber: 'House' as const,
};
const houseXml = `<?xml version="1.0"?><!DOCTYPE rollcall-vote SYSTEM "never-fetch.dtd"><rollcall-vote><vote-metadata><congress>119</congress><session>1st</session><rollcall-num>3</rollcall-num><legis-num>H RES 5</legis-num><vote-question>On Ordering the Previous Question</vote-question><vote-result>Passed</vote-result><action-date>7-Jan-2025</action-date></vote-metadata><vote-data><recorded-vote><legislator name-id="T000001" state="TX" party="D">Test</legislator><vote>Nay</vote></recorded-vote></vote-data></rollcall-vote>`;

test('raw Record parsing preserves turns, clerk boundaries, quotation indentation and ambiguous identity', () => {
  const raw = `<html><body><pre>[Congressional Record]\n[House]\n[Pages H1-H2]\n  Mr. TEST. I support H.R. 29 only if clinics remain.\n     Mr. OTHER. Quoted words are not a new speaker.\n  The Clerk read the bill.\n       INSERTED BILL TEXT\n  Mr. TEST. I will vote for H.R. 29.\n  The SPEAKER pro tempore. Time expired.\n</pre></body></html>`;
  const parsed = parseRecord(recordDoc, raw, [identity], at, 'raw-hash');
  assert.equal(parsed.passages.length, 2);
  const quote = parsed.source.text.slice(parsed.passages[0].start, parsed.passages[0].end);
  assert.ok(quote.includes('Quoted words'));
  assert.ok(!quote.includes('Clerk'));
  assert.ok(!quote.includes('INSERTED BILL'));
  assert.equal(parsed.passages[0].attribution, 'verified');
  const ambiguous = parseRecord(
    recordDoc,
    raw,
    [identity, { ...identity, id: 'another', bioguideId: 'A000001' }],
    at,
    'raw-hash',
  );
  assert.equal(ambiguous.passages[0].personId, null);
  assert.equal(ambiguous.passages[0].attribution, 'ambiguous');
  assert.throws(
    () => parseRecord(recordDoc, '<html>Not a record</html>', [identity], at, 'x'),
    /Expected a GovInfo/,
  );
});

test('official XML adapters distinguish procedure and individual choices without inferring operative text', () => {
  const parsed = parseVote(
    { ...recordDoc, id: 'house-vote', kind: 'house_vote' },
    houseXml,
    [identity],
    at,
    'raw-hash',
  );
  assert.equal(parsed.actions.length, 1);
  assert.equal(parsed.actions[0].kind, 'procedure');
  assert.equal(parsed.actions[0].vote, 'Nay');
  assert.equal(parsed.actions[0].measureId, '119-hres-5');
  assert.equal(parsed.actions[0].operativeText, 'unresolved');
  assert.equal(parsed.sources[0].provenance?.rawHash, 'raw-hash');
  assert.throws(
    () =>
      parseVote(
        { ...recordDoc, kind: 'house_vote' },
        houseXml,
        [{ ...identity, terms: [{ ...identity.terms[0], state: 'CA' }] }],
        at,
        'x',
      ),
    /disagrees/,
  );
  assert.equal(actionKind('On Motion to Suspend the Rules and Pass'), 'combined_passage');
  assert.equal(actionKind('On the Motion to Table'), 'table');
  assert.equal(actionKind('On the Cloture Motion'), 'procedure');
  assert.equal(actionKind('Election of the Speaker'), null);
  assert.equal(
    parseVote(
      { ...recordDoc, kind: 'house_vote' },
      houseXml.replace('On Ordering the Previous Question', 'On Agreeing to the Amendment'),
      [identity],
      at,
      'x',
    ).actions.length,
    0,
  );
});

test('Senate LIS identifiers require a crosswalk and known date/party/state terms', () => {
  const xml = `<roll_call_vote><congress>119</congress><session>1</session><vote_number>1</vote_number><vote_date>January 7, 2025, 02:54 PM</vote_date><vote_question_text>On Cloture on the Motion to Proceed S. 5</vote_question_text><vote_result_text>Agreed</vote_result_text><document><document_name>S. 5</document_name></document><members><member><lis_member_id>S001</lis_member_id><state>TX</state><party>D</party><vote_cast>Not Voting</vote_cast></member></members></roll_call_vote>`;
  const doc = { ...recordDoc, kind: 'senate_vote' as const, chamber: 'Senate' as const };
  const senator = { ...identity, terms: [{ ...identity.terms[0], chamber: 'Senate' as const }] };
  assert.equal(parseVote(doc, xml, [senator], at, 'x').actions[0].vote, 'Not Voting');
  assert.equal(parseVote(doc, xml, [{ ...senator, lisId: undefined }], at, 'x').actions.length, 0);
});

test('bill text XML is archived with provenance and entity definitions are rejected', () => {
  const raw = `<bill><metadata><dublinCore><dc:title xmlns:dc="urn:dc">Example &amp; test</dc:title><dc:date xmlns:dc="urn:dc">2025-01-03</dc:date></dublinCore></metadata><form><congress>119th CONGRESS</congress><legis-num>H. R. 29</legis-num></form><legis-body><section id="sec1">Keep <text>clinics</text> open.</section></legis-body></bill>`;
  const parsed = parseBill(
    { ...recordDoc, id: 'bill-ih', kind: 'bill', provisionElementId: 'sec1' },
    raw,
    at,
    'x',
  );
  assert.equal(parsed.measure.id, '119-hr-29');
  assert.equal(parsed.measure.versions[0].provision, 'Keep clinics open.');
  assert.ok(parsed.source.text.includes('Example & test'));
  assert.throws(
    () => parseXml('<!DOCTYPE x [<!ENTITY a SYSTEM "file:///secret">]><x>&a;</x>'),
    /entity declarations/,
  );
  assert.throws(() => parseXml('<x><y></x>'), /Malformed/);
});

test('source collector restricts hosts/redirects, preserves cached bytes, and rejects soft 404s', async () => {
  for (const url of [
    'http://www.govinfo.gov/a',
    'https://127.0.0.1/a',
    'https://www.govinfo.gov.evil.test/a',
    'https://www.govinfo.gov/a?secret=x',
  ])
    assert.throws(() => officialUrl(url));
  const workspace = await temp(),
    url = 'https://clerk.house.gov/evs/2025/roll003.xml';
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return new Response(houseXml, { headers: { etag: 'revision-one' } });
  };
  const first = await fetchOfficial(url, workspace, { fetcher: fetcher as typeof fetch });
  const second = await fetchOfficial(url, workspace, {
    offline: true,
    fetcher: fetcher as typeof fetch,
  });
  assert.equal(second.raw, first.raw);
  assert.equal(second.rawHash, first.rawHash);
  assert.equal(calls, 1);
  await assert.rejects(
    fetchOfficial(url, await temp(), {
      fetcher: (async () =>
        new Response('', {
          status: 302,
          headers: { location: 'https://127.0.0.1/private' },
        })) as typeof fetch,
    }),
    /Source URL/,
  );
  await assert.rejects(
    fetchOfficial(url, await temp(), {
      fetcher: (async () => new Response('<title>Page Not Found</title>')) as typeof fetch,
    }),
    /error page/,
  );
});

test('Codex extraction validates, caches, accounts for bounded repairs, and never accepts invented quotes', async () => {
  const corpus = demoCorpus(),
    workspace = await temp();
  let calls = 0;
  const runner = async (request: ModelRequest) => {
    calls++;
    const json = request.prompt
      .split('UNTRUSTED EVIDENCE JSON:\n')[1]
      .split('\nVALIDATION FEEDBACK')[0];
    const data = JSON.parse(json);
    const claims = extractDeterministic(corpus).filter((c) =>
      data.passages.some((p: any) => p.id === c.passageId),
    );
    if (calls === 1) claims[0].qualifiers = ['Invented'];
    return { response: { claims }, usage: { input_tokens: 10, output_tokens: 5 }, elapsedMs: 1 };
  };
  const first = await extractWithCodex(corpus, { workspace, runner });
  assert.equal(first.claims.length, 9);
  assert.equal(calls, 4);
  assert.equal(first.report.batches[0].usage.input_tokens, 20);
  const replay = await extractWithCodex(corpus, { workspace, runner });
  assert.equal(calls, 4);
  assert.ok(replay.report.batches.every((b) => b.cached));
  await assert.rejects(
    extractWithCodex(corpus, {
      workspace: await temp(),
      runner: async () => ({
        response: { claims: [{ ...extractDeterministic(corpus)[0], qualifiers: ['fabricated'] }] },
        usage: {},
        elapsedMs: 1,
      }),
    }),
    /Unsupported qualification/,
  );
  assert.equal((await readdir(join(workspace, 'model', 'attempts'))).length, 4);
});

test('evaluation prevents bill/day leakage and never treats pending or AI labels as human accuracy', () => {
  const corpus = demoCorpus(),
    set = createEvaluationSet(corpus),
    claims = extractDeterministic(corpus);
  assert.equal(evaluateClaims(corpus, claims, set).acceptance, 'pending_human_evaluation');
  set.cases[0].status = 'agent_draft';
  set.cases[0].expectedQuote = claims[0].quote;
  assert.equal(evaluateClaims(corpus, claims, set).counts.humanReviewed, 0);
  const related = set.cases.find((c, i) => i > 0 && c.group === set.cases[0].group)!;
  related.split = set.cases[0].split === 'held_out' ? 'development' : 'held_out';
  assert.throws(() => validateEvaluation(set, corpus), /leakage/);
  const stale = createEvaluationSet(corpus);
  stale.corpusHash = hash('changed');
  assert.throws(() => validateEvaluation(stale, corpus), /corpus changed/);
  assert.equal(wilson(0, 0), null);
  assert.ok(wilson(19, 20)!.low < 0.95);
});

test('review API requires explicit remote inference consent and cannot read local files from uploaded acquisition plans', async () => {
  const workspace = await temp();
  await prepare(demoCorpus(), { workspace });
  const request = (body: unknown) =>
    new Request('http://127.0.0.1/api/local-evidence', {
      method: 'POST',
      headers: {
        origin: 'http://127.0.0.1',
        'content-type': 'application/json',
        'x-ltw-local-review': 'token',
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await handleLocalEvidence(
        request({ operation: 'extract' }),
        'token',
        workspace,
        join(workspace, 'public'),
      )
    ).status,
    400,
  );
  const plan = acquisitionSchema.parse({
    scope: { ...demoCorpus().scope, mode: 'real' },
    identities: [identity],
    documents: [{ ...recordDoc, localFile: 'secret.txt' }],
  });
  const response = await handleLocalEvidence(
    request({ operation: 'collect', plan }),
    'token',
    workspace,
    join(workspace, 'public'),
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /CLI/);
});
