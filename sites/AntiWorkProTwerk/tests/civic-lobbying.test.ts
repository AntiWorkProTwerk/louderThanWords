import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hash } from '../scripts/said-did/engine';
import {
  buildLobbying,
  lobbyingUrl,
  lobbyingCents,
  projectLobbying,
  runLobbying,
} from '../scripts/civic/lobbying';
import {
  lobbyingPlanSchema,
  lobbyingSeries,
  lobbyingAgenda,
  filterLobbying,
} from '../src/lib/civic/lobbying';
import { loadLobbying } from '../src/lib/civic/lobbying-repository';

const at = '2026-09-16T00:00:00.000Z';
const plan = lobbyingPlanSchema.parse({
  id: 'test-lobbying',
  title: 'Test',
  clientIds: [42],
  fromYear: 2025,
  throughYear: 2025,
});
function filing(n: number, quarter = 1, amendment = false): any {
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  return {
    filing_uuid: id,
    url: `https://lda.gov/api/v1/filings/${id}/`,
    filing_document_url: `https://lda.gov/filings/public/filing/${id}/print/`,
    filing_type: amendment ? `${quarter}A` : `Q${quarter}`,
    filing_type_display: amendment ? 'Amendment' : 'Report',
    filing_year: 2025,
    filing_period: ['first_quarter', 'second_quarter', 'third_quarter', 'fourth_quarter'][
      quarter - 1
    ],
    filing_period_display: `Quarter ${quarter}`,
    dt_posted: `2025-${String(quarter * 3 + 1).padStart(2, '0')}-${amendment ? '22' : '21'}T12:00:00-05:00`,
    income: null,
    expenses: '120.01',
    client: { id: 42, name: 'Test Client', state: 'TX', country: 'US', contact: 'PRIVATE CONTACT' },
    registrant: { id: 9, name: 'Test Registrant', address_1: 'PRIVATE ADDRESS' },
    lobbying_activities: [
      {
        general_issue_code: 'SCI',
        general_issue_code_display: 'Science/Technology',
        description:
          'Issues concerning H.R. 123 and S. 45; this does not specify a Congress or a position.',
        government_entities: [{ id: 2, name: 'HOUSE OF REPRESENTATIVES' }],
        lobbyists: [{ contact: 'PRIVATE LOBBYIST DETAIL' }],
      },
    ],
  };
}
function fixture(rows = [filing(1), filing(2, 2), filing(3, 2, true)]): any {
  const raw = JSON.stringify({ count: rows.length, next: null, previous: null, results: rows });
  return {
    formatVersion: 1,
    plan,
    observedAt: at,
    batches: [
      {
        clientId: 42,
        year: 2025,
        pages: [{ url: lobbyingUrl(42, 2025), raw, hash: hash(raw), observedAt: at }],
      },
    ],
  };
}
function mutate(input: any, fn: (r: any) => void) {
  const page = input.batches[0].pages[0],
    raw = JSON.parse(page.raw);
  fn(raw);
  page.raw = JSON.stringify(raw);
  page.hash = hash(page.raw);
  return input;
}
test('LDA projection preserves literal evidence, separate money, amendments and privacy', () => {
  const input = fixture(),
    data = buildLobbying(input);
  assert.equal(data.records.length, 3);
  assert.equal(data.records[0].expensesCents, 12001);
  assert.equal(data.records[0].incomeCents, null);
  assert.equal(JSON.stringify(data).includes('PRIVATE'), false);
  const activity = data.records[0].activities[0];
  assert.deepEqual(
    activity.billMentions.map((m) => m.text),
    ['H.R. 123', 'S. 45'],
  );
  for (const m of activity.billMentions)
    assert.equal(activity.description!.slice(m.start, m.end), m.text);
  assert.equal('congress' in activity.billMentions[0], false);
  assert.equal(
    data.records[0].source.recordHash,
    hash(JSON.parse(input.batches[0].pages[0].raw).results[0]),
  );
  assert.equal(lobbyingCents('0'), 0);
  assert.equal(lobbyingCents(null), null);
  for (const value of ['-1', '1.123', 'NaN', '90071992547410.00'])
    assert.throws(() => lobbyingCents(value));
  const noActivity = filing(5);
  noActivity.filing_type = 'Q1Y';
  noActivity.lobbying_activities = [];
  assert.equal(projectLobbying(noActivity, hash('page')).quarter, 1);
  noActivity.filing_type = '1@Y';
  assert.equal(projectLobbying(noActivity, hash('page')).isAmendment, true);
  noActivity.filing_type = 'Q5';
  assert.throws(() => projectLobbying(noActivity, hash('page')), /Unsupported/);
});
test('LDA latest-version agenda does not double count amendments or invent baselines', () => {
  const input = mutate(fixture(), (r) =>
    r.results[2].lobbying_activities.push({
      general_issue_code: 'ENG',
      general_issue_code_display: 'Energy',
      description: 'Grid permitting',
      government_entities: [],
    }),
  );
  const data = buildLobbying(input),
    groups = lobbyingSeries(data.records),
    agenda = lobbyingAgenda(data.records);
  assert.equal(groups.length, 2);
  assert.equal(groups[1].versions.length, 2);
  assert.equal(groups[1].latest!.id, filing(3, 2, true).filing_uuid);
  assert.equal(agenda[0].comparable, false);
  assert.deepEqual(agenda[1].newCodes, ['ENG']);
  const tie = structuredClone(data.records);
  tie[2].posted = tie[1].posted;
  assert.equal(lobbyingSeries(tie)[1].latest, null);
  assert.equal(lobbyingAgenda(tie)[1].comparable, false);
  const gap = structuredClone(data.records);
  gap[0].year = 2024;
  assert.equal(lobbyingAgenda(gap)[1].comparable, false);
  const separate = structuredClone(data.records);
  separate[2].registrant.id = 10;
  assert.equal(lobbyingSeries(separate).length, 3);
  assert.equal(filterLobbying(data.records, new URLSearchParams('q=permitting')).length, 1);
  assert.equal(filterLobbying(data.records, new URLSearchParams('state=CA')).length, 0);
});
test('LDA refuses corrupt, incomplete, duplicated, unsafe and out-of-scope captures', () => {
  const corrupt = fixture();
  corrupt.batches[0].pages[0].hash = '0'.repeat(64);
  assert.throws(() => buildLobbying(corrupt), /hash/);
  for (const fn of [
    (r: any) => r.count++,
    (r: any) => r.results[0].client.id++,
    (r: any) => (r.results[1] = r.results[0]),
    (r: any) => (r.next = 'https://example.com/private'),
    (r: any) => (r.results[0].filing_document_url = 'https://example.com/false-evidence'),
    (r: any) => (r.results[0].filing_period = 'third_quarter'),
    (r: any) => (r.results[0].dt_posted = '2027-01-01T00:00:00Z'),
  ])
    assert.throws(() => buildLobbying(mutate(fixture(), fn)));
  const missing = fixture();
  missing.batches = [];
  assert.throws(() => buildLobbying(missing), /coverage/);
  const capped = fixture();
  capped.plan = { ...plan, maxPerClientYear: 1 };
  assert.throws(() => buildLobbying(capped), /cap/);
  const prior = buildLobbying(fixture());
  assert.throws(
    () =>
      buildLobbying(
        mutate(fixture(), (r) => (r.results[0].expenses = '99')),
        prior,
      ),
    /same capture/,
  );
  const changed = mutate(fixture(), (r) => (r.results[0].expenses = '99'));
  changed.observedAt = '2026-09-17T00:00:00.000Z';
  assert.equal(buildLobbying(changed, prior).changes.updated.length, 1);
});
test('LDA multi-page query validates page links, counts and exact identities', () => {
  const rows = Array.from({ length: 26 }, (_, i) => filing(i + 1)),
    input = fixture();
  input.batches[0].pages = [rows.slice(0, 25), rows.slice(25)].map((part, i) => {
    const raw = JSON.stringify({
      count: 26,
      next: i === 0 ? lobbyingUrl(42, 2025, 2) : null,
      previous: i ? `${lobbyingUrl(42, 2025)}&page=1` : null,
      results: part,
    });
    return { url: lobbyingUrl(42, 2025, i + 1), raw, hash: hash(raw), observedAt: at };
  });
  assert.equal(buildLobbying(input).records.length, 26);
  input.batches[0].pages.pop();
  assert.throws(() => buildLobbying(input), /pagination/);
});
test('LDA local publication, offline import and failure preserve the previous snapshot', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ltw-lobbying-')),
    output = join(directory, 'public'),
    workspace = join(directory, 'job');
  const first = await runLobbying({
    input: fixture(),
    workspace,
    output,
    offline: true,
    fetcher: async () => {
      throw new Error('Must not request network');
    },
  });
  const second = await runLobbying({ input: fixture(), workspace, output, offline: true });
  assert.equal(first.release, second.release);
  const before = await readFile(join(output, 'manifest.json'), 'utf8');
  await assert.rejects(
    runLobbying({ input: mutate(fixture(), (r) => r.count++), workspace, output, offline: true }),
  );
  assert.equal(await readFile(join(output, 'manifest.json'), 'utf8'), before);
  const fresh = await runLobbying({
    input: JSON.parse(await readFile(join(workspace, 'input.json'), 'utf8')),
    workspace: join(directory, 'import'),
    output: join(directory, 'import-public'),
    offline: true,
  });
  assert.equal(first.release, fresh.release);
});

test('LDA acquisition uses bounded official queries and its repository rejects altered evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ltw-lobbying-live-test-'));
  const input = fixture();
  let requests = 0;
  const output = join(directory, 'public'),
    workspace = join(directory, 'job');
  await runLobbying({
    plan,
    workspace,
    output,
    fetcher: async (url, init) => {
      requests++;
      assert.equal(String(url), lobbyingUrl(42, 2025));
      assert.equal(init?.redirect, 'error');
      assert.ok(init?.signal);
      return new Response(input.batches[0].pages[0].raw, {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal(requests, 1);
  const offline = await runLobbying({
    plan,
    workspace,
    output,
    offline: true,
    fetcher: async () => {
      throw new Error('Offline must not fetch');
    },
  });
  const raw = JSON.parse(
    await readFile(join(output, 'releases', offline.release, 'data.json'), 'utf8'),
  );
  const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
  const serve: typeof fetch = async (url) =>
    Response.json(String(url).endsWith('manifest.json') ? manifest : raw);
  assert.equal((await loadLobbying(serve)).data.records.length, 3);
  raw.records[0].activities[0].description = 'Changed evidence';
  await assert.rejects(loadLobbying(serve), /integrity/);
  const before = await readFile(join(output, 'manifest.json'), 'utf8');
  await assert.rejects(
    runLobbying({
      plan,
      workspace,
      output,
      fetcher: async () =>
        new Response('Rate limited', { status: 429, headers: { 'retry-after': '60' } }),
    }),
    /429.*60/,
  );
  assert.equal(await readFile(join(output, 'manifest.json'), 'utf8'), before);
});
