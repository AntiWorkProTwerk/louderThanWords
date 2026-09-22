import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from '../scripts/said-did/engine';
import { buildComplaints, complaintUrl, runComplaints } from '../scripts/civic/complaints';
import {
  complaintPlanSchema,
  complaintGroups,
  complaintPeriods,
  complaintExamples,
  filterComplaints,
  monthEnd,
} from '../src/lib/civic/complaints';
import { loadComplaints } from '../src/lib/civic/complaints-repository';

const states = [{ code: 'TX' }],
  at = '2026-09-16T00:00:00.000Z';
const plan = complaintPlanSchema.parse({
  id: 'test-complaints',
  from: '2025-01',
  through: '2025-04',
  product: 'Checking or savings account',
  companies: ['Test Bank'],
  pageSize: 2,
});
function hit(id: string, month: string): any {
  const received = `${month}-15T12:00:00Z`;
  return {
    _id: id,
    sort: [Date.parse(received), id],
    _source: {
      complaint_id: id,
      date_received: received,
      company: 'Test Bank',
      product: plan.product,
      issue: 'Managing an account',
      sub_product: 'Checking account',
      sub_issue: 'Funds unavailable',
      state: 'TX',
      timely: 'Yes',
      company_response: 'Closed with explanation',
      zip_code: '12345',
      tags: 'Private demographic tag',
    },
  };
}
function packet(
  month: string,
  hits: any[],
  total: number,
  page = 1,
  cursor?: [number, string],
): any {
  const raw = JSON.stringify({
    timed_out: false,
    _shards: { failed: 0 },
    hits: { total: { value: total, relation: 'eq' }, hits },
    _meta: { license: 'CC0', last_indexed: at, is_data_stale: false, has_data_issue: false },
  });
  return { raw, hash: hash(raw), url: complaintUrl(plan, month, page, cursor), observedAt: at };
}
function fixture(): any {
  return {
    formatVersion: 1,
    plan: structuredClone(plan),
    observedAt: at,
    months: ['2025-01', '2025-02', '2025-03', '2025-04'].map((month, i) => ({
      month,
      pages: [packet(month, [hit(String(100 + i), month)], 1)],
    })),
  };
}
function mutate(input: any, fn: (r: any) => void, month = 0, page = 0) {
  const p = input.months[month].pages[page],
    r = JSON.parse(p.raw);
  fn(r);
  p.raw = JSON.stringify(r);
  p.hash = hash(p.raw);
  return input;
}

test('CFPB exact inclusive month boundaries, cursor pagination and privacy-safe projection', () => {
  assert.equal(monthEnd('2024-02'), '2024-02-29');
  assert.equal(
    new URL(complaintUrl(plan, '2025-01', 1)).searchParams.get('date_received_max'),
    '2025-01-31',
  );
  const input = fixture(),
    first = hit('100', '2025-01'),
    second = hit('110', '2025-01');
  input.months[0].pages = [
    packet('2025-01', [first, second], 3),
    packet('2025-01', [hit('120', '2025-01')], 3, 2, second.sort),
  ];
  const data = buildComplaints(input, states);
  assert.equal(data.records.length, 6);
  assert.equal(data.coverage[0].total, 3);
  assert.equal(data.sources.length, 5);
  assert.equal(data.records[0].timely, 'yes');
  assert.match(data.records[0].source.url, /detail\/100$/);
  // The record fingerprint hashes the validated object; the source-page hash hashes exact bytes.
  assert.match(data.records[0].source.hash, /^[a-f0-9]{64}$/);
  assert.equal(data.sources[0].hash, hash(input.months[0].pages[0].raw));
  const changed = mutate(
    structuredClone(input),
    (r) => (r.hits.hits[0]._source.company_response = 'Different response'),
  );
  assert.notEqual(
    data.records[0].source.hash,
    buildComplaints(changed, states).records[0].source.hash,
  );
  assert.equal('zip_code' in data.records[0], false);
  assert.equal(JSON.stringify(data).includes('Private demographic'), false);
  assert.equal(data.narratives, 'not_available_in_current_api');
  const unmapped = buildComplaints(
    mutate(fixture(), (r) => (r.hits.hits[0]._source.state = 'PR')),
    states,
  );
  assert.equal(unmapped.records[0].state, null);
  assert.equal(unmapped.records[0].reportedState, 'PR');
});

test('CFPB refuses incomplete, duplicate, changed-index, out-of-scope and corrupt captures', () => {
  const missing = fixture();
  missing.months.pop();
  assert.throws(() => buildComplaints(missing, states), /coverage/);
  assert.throws(
    () =>
      buildComplaints(
        mutate(fixture(), (r) => (r.hits.total.value = 2)),
        states,
      ),
    /Incomplete CFPB month/,
  );
  assert.throws(
    () =>
      buildComplaints(
        mutate(fixture(), (r) => r.hits.hits.push(r.hits.hits[0])),
        states,
      ),
    /Duplicate/,
  );
  assert.throws(
    () =>
      buildComplaints(
        mutate(fixture(), (r) => (r._meta.last_indexed = 'changed'), 1),
        states,
      ),
    /index refreshed/,
  );
  assert.throws(
    () =>
      buildComplaints(
        mutate(fixture(), (r) => (r.hits.hits[0]._source.company = 'Other Bank')),
        states,
      ),
    /outside selected/,
  );
  assert.throws(
    () =>
      buildComplaints(
        mutate(fixture(), (r) => (r.hits.hits[0]._source.date_received = '2025-02-01T00:00:00Z')),
        states,
      ),
    /outside selected/,
  );
  assert.throws(
    () =>
      buildComplaints(
        mutate(fixture(), (r) => (r.hits.hits[0].sort[1] = '999')),
        states,
      ),
    /sort identity/,
  );
  assert.throws(() =>
    buildComplaints(
      mutate(fixture(), (r) => (r._meta.has_data_issue = true)),
      states,
    ),
  );
  assert.throws(() =>
    buildComplaints(
      mutate(fixture(), (r) => (r._meta.is_data_stale = true)),
      states,
    ),
  );
  assert.throws(() =>
    buildComplaints(
      mutate(fixture(), (r) => (r.timed_out = true)),
      states,
    ),
  );
  assert.throws(() =>
    buildComplaints(
      mutate(fixture(), (r) => (r.hits.total.relation = 'gte')),
      states,
    ),
  );
  assert.throws(
    () =>
      buildComplaints(
        mutate(fixture(), (r) => (r.hits.total.value = 2001)),
        states,
      ),
    /limit/,
  );
  assert.throws(
    () =>
      buildComplaints(
        mutate(fixture(), (r) => (r._meta.break_points = { '2': [0, '100'] })),
        states,
      ),
    /breakpoint/,
  );
  const corrupt = fixture();
  corrupt.months[0].pages[0].raw += ' ';
  assert.throws(() => buildComplaints(corrupt, states), /hash/);
  const url = fixture();
  url.months[0].pages[0].url += '&format=json';
  assert.throws(() => buildComplaints(url, states), /query or pagination/);
});

test('radar uses calendar-day denominators, filtered shares and explicit small/zero baseline rules', () => {
  const data = buildComplaints(fixture(), states),
    original = data.records[0];
  data.records = [];
  let id = 1000;
  const add = (count: number, date: string, group = original.clusterId) => {
    for (let i = 0; i < count; i++)
      data.records.push({ ...original, id: String(id++), received: date, clusterId: group });
  };
  add(5, '2025-02-15');
  add(10, '2025-04-15');
  add(5, '2025-04-15', 'cg-0000000000000000');
  add(4, '2025-04-15', 'cg-1111111111111111');
  const periods = complaintPeriods(data, '2025-03');
  assert.equal(periods.before.days, 59);
  assert.equal(periods.after.days, 61);
  const groups = complaintGroups(data, {}, '2025-03'),
    growing = groups.find((g) => g.id === original.clusterId)!;
  assert.equal(growing.signal, 'rising');
  assert.ok(Math.abs(growing.growth! - (10 / 61 / (5 / 59) - 1) * 100) < 1e-9);
  assert.equal(growing.beforeShare, 100);
  assert.ok(Math.abs(growing.afterShare! - 1000 / 19) < 1e-9);
  assert.equal(groups.find((g) => g.id === 'cg-0000000000000000')!.signal, 'new_in_slice');
  assert.equal(groups.find((g) => g.id === 'cg-0000000000000000')!.growth, null);
  assert.equal(groups.find((g) => g.id === 'cg-1111111111111111')!.signal, 'context');
  assert.equal(complaintGroups(data, { state: 'CA' }, '2025-03').length, 0);
  assert.equal(filterComplaints(data, { q: 'unavailable TEST bank', state: 'TX' }).length, 24);
  assert.equal(filterComplaints(data, { company: 'Other Bank' }).length, 0);
  assert.throws(() => complaintPeriods(data, '2025-01'), /inside/);
  const examples = complaintExamples([...data.records].reverse());
  assert.deepEqual(
    examples.map((r) => r.id),
    ['1000', '1012', '1023'],
  );
  assert.equal(complaintExamples(data.records, 1)[0].id, '1012');
  assert.throws(() => complaintExamples(data.records, 0), /positive/);
});

test('observed changes distinguish updates, new-to-capture and non-returned records; replay preserves receipts', () => {
  const initial = buildComplaints(fixture(), states),
    input = fixture();
  input.observedAt = '2026-09-17T00:00:00.000Z';
  mutate(input, (r) => (r.hits.hits[0]._source.company_response = 'Closed with monetary relief'));
  mutate(
    input,
    (r) => {
      r.hits.hits = [hit('999', '2025-02')];
    },
    1,
  );
  const next = buildComplaints(input, states, initial);
  assert.deepEqual(
    next.changes.map((c) => c.kind),
    ['updated', 'newly_observed', 'not_returned'],
  );
  assert.match(next.changes[1].detail, /not necessarily newly submitted/);
  assert.match(next.changes[2].detail, /reason not established/);
  assert.equal(next.trackingStartedAt, initial.trackingStartedAt);
  assert.deepEqual(buildComplaints(input, states, next), next);
  assert.throws(() => buildComplaints(fixture(), states, next), /stale/);
  input.observedAt = at;
  assert.throws(() => buildComplaints(input, states, initial), /same-time/);
});

test('local CFPB job acquires JSON, replays offline identically and exposes integrity-checked portable output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ltw-complaints-')),
    workspace = join(directory, 'work'),
    output = join(directory, 'public');
  let calls = 0;
  const first = await runComplaints({
    plan,
    states,
    workspace,
    output,
    fetcher: async (url) => {
      calls++;
      const month = new URL(String(url)).searchParams.get('date_received_min')!.slice(0, 7);
      const page = fixture().months.find((m: any) => m.month === month).pages[0];
      return new Response(page.raw, { headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(calls, 4);
  const second = await runComplaints({
    plan,
    states,
    workspace,
    output,
    offline: true,
    fetcher: async () => {
      throw new Error('Network in offline replay');
    },
  });
  assert.equal(first.release, second.release);
  const fetcher = (async (url: unknown) =>
    new Response(
      await readFile(join(output, String(url).replace('/data/complaints/', '')), 'utf8'),
    )) as typeof fetch;
  const loaded = await loadComplaints(fetcher);
  assert.equal(loaded.data.records.length, 4);
  const corrupt = (async (url: unknown) => {
    const raw = await (await fetcher(url as RequestInfo)).json();
    if (String(url).endsWith('/data.json')) raw.records[0].company = 'Altered';
    return Response.json(raw);
  }) as typeof fetch;
  await assert.rejects(() => loadComplaints(corrupt), /integrity/);
  await assert.rejects(
    () =>
      runComplaints({
        plan: { ...plan, companies: ['Other Bank'] },
        states,
        workspace,
        output,
        offline: true,
      }),
    /plan mismatch/,
  );
  const bad = mutate(fixture(), (r) => (r.hits.total.value = 9));
  bad.observedAt = new Date(Date.now() + 86400000).toISOString();
  await assert.rejects(
    () => runComplaints({ input: bad, states, workspace, output }),
    /Incomplete/,
  );
  assert.equal(
    JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')).release,
    first.release,
  );
});
