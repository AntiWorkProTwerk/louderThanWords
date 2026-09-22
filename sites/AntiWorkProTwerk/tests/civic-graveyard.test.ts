import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from '../scripts/said-did/engine';
import {
  acquireGraveyard,
  buildGraveyard,
  parseBillStatus,
  runGraveyard,
} from '../scripts/civic/graveyard';
import {
  billStateCounts,
  filterBills,
  furthestStage,
  policyProgress,
  statusUrl,
} from '../src/lib/civic/graveyard';
import { loadGraveyard, loadBillDetail } from '../src/lib/civic/graveyard-repository';
const key = { congress: 119, type: 'HR' as const, number: 29 };
const action = (code: string, system = '9', type = 'Floor') =>
  `<item><actionDate>2025-01-07</actionDate><actionCode>${code}</actionCode><type>${type}</type><sourceSystem><code>${system}</code><name>Test source</name></sourceSystem><text>Source action ${code}</text></item>`;
function xml(extra = '') {
  return `<billStatus><bill><congress>119</congress><type>HR</type><number>29</number><title>Fixture bill</title><introducedDate>2025-01-03</introducedDate><updateDate>2026-09-01T00:00:00Z</updateDate><policyArea><name>Health</name></policyArea><sponsors><item><bioguideId>A000001</bioguideId><fullName>Fixture Sponsor</fullName><state>TX</state><party>I</party></item></sponsors><latestAction><actionDate>2025-01-07</actionDate><text>Source action 8000</text></latestAction><actions>${action('8000')}${action('17000', '2')}${extra}</actions><relatedBills><item><congress>119</congress><type>S</type><number>5</number><title>Related bill</title><relationshipDetails><item><type>Contained in public law</type><identifiedBy>CRS</identifiedBy></item></relationshipDetails></item></relatedBills></bill></billStatus>`;
}
function fixture(): any {
  const raw = xml();
  return {
    formatVersion: 1,
    plan: {
      id: 'fixture',
      title: 'Fixture',
      selection: 'One explicit number',
      ranges: [{ congress: 119, type: 'HR', first: 29, last: 29 }],
    },
    observedAt: '2026-09-16T00:00:00.000Z',
    documents: [
      {
        key,
        url: statusUrl(key),
        status: 200,
        capturedAt: '2026-09-15T00:00:00.000Z',
        raw,
        hash: hash(raw),
      },
    ],
  };
}
test('bill status preserves source namespace, relationships and exact latest action', () => {
  const d = parseBillStatus(xml(), key);
  assert.equal(d.bill.milestones.house, '2025-01-07');
  assert.equal(d.bill.milestones.senate, null); // Same code under a different source system.
  assert.equal(d.bill.milestones.law, null); // A related enacted bill is not this bill becoming law.
  assert.equal(furthestStage(d.bill.milestones), 'Passed one chamber');
  assert.equal(d.bill.relatedLaw[0].id, '119-s-5');
  assert.equal(d.actions[0].text, 'Source action 8000');
  assert.throws(() => parseBillStatus(xml(), { ...key, number: 30 }), /identity/);
  assert.throws(() => parseBillStatus('<!DOCTYPE x>' + xml(), key), /unsafe/);
});
test('bill collection fails closed on omission, hash mismatch, stale data and duplicate identities', () => {
  const input = fixture(),
    { data } = buildGraveyard(input);
  assert.throws(() => buildGraveyard({ ...input, documents: [] }), /Incomplete/);
  assert.throws(
    () => buildGraveyard({ ...input, documents: [...input.documents, ...input.documents] }),
    /duplicate/,
  );
  const corrupt = structuredClone(input);
  corrupt.documents[0].raw += ' ';
  assert.throws(() => buildGraveyard(corrupt), /provenance/);
  assert.throws(
    () => buildGraveyard({ ...input, observedAt: '2026-09-14T00:00:00.000Z' }, data),
    /stale/,
  );
  assert.deepEqual(buildGraveyard(input, data).data, data);
  const missing = structuredClone(input);
  missing.documents[0].status = 404;
  const absent = buildGraveyard(missing).data;
  assert.equal(absent.bills.length, 0);
  assert.equal(absent.missing.length, 1);
});
test('policy denominators do not inherit outcome filters and state anchors count bills once', () => {
  const { data } = buildGraveyard(fixture());
  assert.equal(filterBills(data, new URLSearchParams('state=CA')).length, 0);
  assert.equal(filterBills(data, new URLSearchParams('quiet=180')).length, 1);
  assert.equal(filterBills(data, new URLSearchParams('stage=Became+law')).length, 0);
  assert.equal(
    policyProgress(data, new URLSearchParams('stage=Became+law&quiet=9999'))[0].total,
    1,
  );
  assert.deepEqual(billStateCounts(data, new URLSearchParams('state=CA')), { TX: 1 });
});
test('local publication, offline import and lazy detail verify immutable release evidence', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'ltw-bills-')),
    output = join(workspace, 'public');
  const input = fixture(),
    first = await runGraveyard({ input, workspace, output, offline: true });
  const second = await runGraveyard({ input, workspace, output, offline: true });
  assert.equal(first.release, second.release);
  const fetcher = (async (url: any) => {
    try {
      return new Response(
        await readFile(join(output, String(url).replace('/data/graveyard/', '')), 'utf8'),
      );
    } catch {
      return new Response('', { status: 404 });
    }
  }) as typeof fetch;
  const snapshot = await loadGraveyard(fetcher);
  await assert.rejects(
    () =>
      loadBillDetail(snapshot, '119-hr-29', (async (url: any) => {
        const raw = await (await fetcher(url)).json();
        raw.actions[0].text = 'Changed evidence';
        return Response.json(raw);
      }) as typeof fetch),
    /integrity/,
  );
  const detail = await loadBillDetail(snapshot, '119-hr-29', fetcher);
  assert.equal(detail.bill.id, '119-hr-29');
  await assert.rejects(() => loadBillDetail(snapshot, '../private', fetcher), /outside/);
  await assert.rejects(
    () =>
      loadGraveyard((async (url: any) => {
        const response = await fetcher(url);
        const raw = await response.json();
        if (String(url).endsWith('data.json')) raw.bills[0].title = 'Tampered';
        return Response.json(raw);
      }) as typeof fetch),
    /integrity/,
  );
});

test('source acquisition distinguishes reserved numbers, 404s and transport failures; offline replay never fetches', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'ltw-bill-acquire-')),
    input = fixture();
  const capture = await acquireGraveyard(
    input.plan,
    workspace,
    (async () => new Response(xml())) as typeof fetch,
  );
  assert.equal(capture.documents.length, 1);
  const output = join(workspace, 'public');
  const result = await runGraveyard({
    plan: input.plan,
    workspace,
    output,
    offline: true,
    fetcher: (async () => {
      throw new Error('Unexpected network');
    }) as typeof fetch,
  });
  assert.equal(result.bills, 1);
  const before = await readFile(join(output, 'manifest.json'), 'utf8');
  await assert.rejects(
    () =>
      runGraveyard({
        plan: input.plan,
        workspace,
        output,
        fetcher: (async () => new Response('limited', { status: 429 })) as typeof fetch,
      }),
    /429/,
  );
  assert.equal(await readFile(join(output, 'manifest.json'), 'utf8'), before);
  await assert.rejects(
    () =>
      acquireGraveyard(
        input.plan,
        workspace,
        (async () => new Response(xml(), { status: 206 })) as typeof fetch,
      ),
    /206/,
  );
  const reserved = structuredClone(input);
  reserved.documents[0].raw =
    '<billStatus><bill><congress>119</congress><type>HR</type><number>29</number><title>Reserved for the Speaker.</title></bill></billStatus>';
  reserved.documents[0].hash = hash(reserved.documents[0].raw);
  assert.equal(buildGraveyard(reserved).data.missing[0].reason, 'Reserved for the Speaker.');
  assert.equal(buildGraveyard(reserved).data.bills.length, 0);
});

test('amendment histories remain separate and changed captures do not rewrite history', () => {
  const amendment =
    '<amendments><amendment><number>8</number><congress>119</congress><type>SAMDT</type><purpose>Fixture purpose</purpose><amendedAmendment><congress>119</congress><type>SAMDT</type><number>7</number></amendedAmendment><actions><count>1</count><actions>' +
    action('36000') +
    '</actions></actions></amendment></amendments>';
  const raw = xml().replace('</bill>', amendment + '</bill>'),
    parsed = parseBillStatus(raw, key);
  assert.equal(parsed.bill.milestones.law, null);
  assert.equal(parsed.amendments[0].actions.length, 1);
  assert.equal(parsed.amendments[0].parentAmendment, '119-samdt-7');
  assert.throws(
    () => parseBillStatus(raw.replace('<count>1', '<count>2'), key),
    /Incomplete action/,
  );
  const before = buildGraveyard(fixture()).data,
    changed = fixture();
  changed.documents[0].raw = raw;
  changed.documents[0].hash = hash(raw);
  assert.throws(() => buildGraveyard(changed, before), /same capture/);
  changed.observedAt = '2026-09-17T00:00:00.000Z';
  const after = buildGraveyard(changed, before).data;
  assert.deepEqual(after.changes.updated, ['119-hr-29']);
  assert.equal(before.bills[0].amendmentCount, 0);
  assert.equal(after.bills[0].amendmentCount, 1);
});
