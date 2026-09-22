import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { houseRollCallRoster, collectSources } from '../scripts/said-did/sources';
import { buildVoteReceipts } from '../scripts/civic/votes';

const document = {
  id: 'house-test',
  kind: 'house_vote' as const,
  chamber: 'House' as const,
  congress: 119,
  url: 'https://clerk.house.gov/evs/2025/roll006.xml',
};
const raw = `<rollcall-vote><vote-metadata><congress>119</congress><session>1st</session><rollcall-num>6</rollcall-num><legis-num>H R 29</legis-num><vote-question>On Passage</vote-question><vote-result>Passed</vote-result><action-date>7-Jan-2025</action-date><vote-totals><totals-by-vote><yea-total>1</yea-total><nay-total>0</nay-total><present-total>0</present-total><not-voting-total>1</not-voting-total></totals-by-vote></vote-totals></vote-metadata><vote-data><recorded-vote><legislator name-id="T000001" state="TX" party="R">Test (TX)</legislator><vote>Yea</vote></recorded-vote><recorded-vote><legislator name-id="T000002" state="HI" party="D">Test (HI)</legislator><vote>Not Voting</vote></recorded-vote></vote-data></rollcall-vote>`;
const bill = `<bill bill-stage="Engrossed-in-House"><metadata><dublinCore><dc:title>119 HR 29 EH: Test</dc:title><dc:date>2025-01-07</dc:date></dublinCore></metadata><form><congress>119th Congress</congress><legis-num>H. R. 29</legis-num></form><legis-body><section>Test provision.</section></legis-body><attestation><attestation-group><attestation-date chamber="House">Passed the House of Representatives January 7, 2025.</attestation-date></attestation-group></attestation></bill>`;
const recipe = {
  scope: {
    id: 'test-full-roster',
    title: 'Test',
    mode: 'real',
    chamber: 'House',
    from: '2025-01-07',
    through: '2025-01-07',
    eligibility: 'Synthetic adapter test, not real data.',
    exclusions: [],
    lookbackDays: 1,
  },
  houseRoster: 'roll_call',
  identities: [],
  documents: [
    document,
    {
      id: '119-hr-29-eh',
      kind: 'bill',
      chamber: 'House',
      congress: 119,
      date: '2025-01-07',
      url: 'https://www.govinfo.gov/bulkdata/BILLS/119/1/hr/BILLS-119hr29eh.xml',
    },
  ],
  operativeBindings: [
    {
      documentId: document.id,
      measureId: '119-hr-29',
      versionId: '119-hr-29-eh',
      evidenceSourceId: '119-hr-29-eh',
      evidence: 'Passed the House of Representatives January 7, 2025.',
      status: 'established',
      basis: 'engrossed_house_passage',
    },
  ],
};
const workspace = () => mkdtemp(join(tmpdir(), 'ltw-full-vote-'));
const fetcher = (vote = raw, text = bill) =>
  (async (url: string) =>
    new Response(url.includes('clerk.house.gov') ? vote : text)) as typeof fetch;

test('full House roster preserves Bioguide, source labels and one-day terms; checks every total', () => {
  const people = houseRollCallRoster(raw, document, []);
  assert.equal(people.length, 2);
  assert.equal(people[0].name, 'Test (TX)');
  assert.equal(people[0].terms[0].from, people[0].terms[0].to);
  assert.throws(
    () => houseRollCallRoster(raw.replace('<yea-total>1', '<yea-total>2'), document, []),
    /total mismatch/,
  );
  assert.throws(
    () => houseRollCallRoster(raw.replace('T000002', 'T000001'), document, []),
    /duplicate/,
  );
  assert.throws(
    () => houseRollCallRoster(raw.replace('<vote>Yea', '<vote>Unknown'), document, []),
    /Unknown/,
  );
  const prior = { ...people[0], name: 'Dated Full Name' };
  assert.equal(houseRollCallRoster(raw, document, [prior])[0].name, 'Dated Full Name');
  prior.terms[0].state = 'CA';
  assert.throws(() => houseRollCallRoster(raw, document, [prior]), /conflicts/);
});

test('full acquisition binds certified House-passed text and exactly replays offline', async () => {
  const dir = await workspace();
  const first = await collectSources(recipe, { workspace: dir, fetcher: fetcher() });
  const second = await collectSources(recipe, {
    workspace: dir,
    offline: true,
    fetcher: (async () => {
      throw new Error('No network expected');
    }) as typeof fetch,
  });
  assert.deepEqual(second.corpus, first.corpus);
  const data = buildVoteReceipts(first.corpus);
  assert.equal(data.receipts.length, 2);
  assert.ok(
    data.receipts.every(
      (r) => r.action.versionId === '119-hr-29-eh' && r.action.operativeText === 'established',
    ),
  );
  assert.equal(data.statements.length, 0); // Adding vote identities never invents speaker attribution.
  assert.equal(data.receipts.find((r) => r.state === 'HI')!.action.vote, 'Not Voting');
});

test('certified text cannot be bound to procedure, a different date, or an introduced version', async () => {
  for (const [vote, text] of [
    [raw.replace('On Passage', 'On Ordering the Previous Question'), bill],
    [raw.replace('7-Jan-2025', '8-Jan-2025'), bill],
    [raw, bill.replace('Engrossed-in-House', 'Introduced-in-House')],
    [raw.replace('<vote-result>Passed', '<vote-result>Failed'), bill],
  ])
    await assert.rejects(
      collectSources(recipe, { workspace: await workspace(), fetcher: fetcher(vote, text) }),
      /binding requires/,
    );
});
