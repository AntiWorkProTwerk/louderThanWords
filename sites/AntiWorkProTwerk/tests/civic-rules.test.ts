import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from '../scripts/said-did/engine';
import {
  buildRules,
  parseRuleText,
  collectRules,
  runRules,
  readRulesPublication,
} from '../scripts/civic/rules';
import {
  filterRules,
  relatedRules,
  ruleAlerts,
  ruleFingerprint,
  matchesRuleTopics,
} from '../src/lib/civic/rules';
import { loadRules, loadRuleText } from '../src/lib/civic/rules-repository';

const at = '2026-09-01T12:00:00.000Z',
  later = '2026-09-02T12:00:00.000Z';
const plan = {
  id: 'test-rules',
  term: 'chemical',
  agency: 'environmental-protection-agency',
  from: '2025-01-01',
  through: '2025-06-30',
  pageSize: 1,
  maxPages: 1,
  maxTracked: 100,
};
const xml =
  '<RULE><PREAMB><SUM><P>Some <E>uses</E> remain.</P></SUM><EFFDATE><P>Only the stated provisions are delayed.</P></EFFDATE><FURINF><P>Do not project contacts.</P></FURINF></PREAMB><SUPLINF><HD>Background</HD><P>This does <E>not</E> withdraw the rule.<PRTPAGE P="4"/> Context follows.</P></SUPLINF><REGTEXT><AMDPAR>Revise paragraph (a).</AMDPAR><SECTION><SECTNO>§ 1.1</SECTNO><P>(a) New language.</P><STARS/><GPOTABLE><ROW><ENT>10</ENT><ENT>20</ENT></ROW></GPOTABLE></SECTION></REGTEXT></RULE>';
function metadata(id = '2025-00001'): any {
  return {
    document_number: id,
    title: 'Chemical requirements',
    type: 'Rule',
    action: 'Partial postponement.',
    abstract: 'Agency summary.',
    publication_date: '2025-06-01',
    effective_on: null,
    comments_close_on: null,
    dates: 'Only certain provisions are postponed until August 19, 2025.',
    agencies: [{ id: 145, name: 'Environmental Protection Agency', slug: plan.agency }],
    topics: ['Environmental protection'],
    docket_ids: ['EPA-HQ-OPPT-2020-0642'],
    regulation_id_numbers: ['2070-AK83'],
    cfr_references: [{ title: 40, part: '751' }],
    correction_of: null,
    corrections: [],
    html_url: `https://www.federalregister.gov/documents/2025/06/01/${id}/chemical-requirements`,
    pdf_url: `https://www.govinfo.gov/content/pkg/FR-2025-06-01/pdf/${id}.pdf`,
    full_text_xml_url: `https://www.federalregister.gov/documents/full_text/xml/2025/06/01/${id}.xml`,
  };
}
function input(docs = [metadata()], observedAt = at): any {
  return {
    formatVersion: 1,
    plan,
    observedAt,
    totalMatches: docs.length,
    truncated: false,
    records: docs.map((m) => ({
      metadata: m,
      xml,
      source: {
        url: `https://www.federalregister.gov/api/v1/documents/${m.document_number}.json`,
        hash: hash(m),
        observedAt,
      },
      xmlSource: { url: m.full_text_xml_url, hash: hash(xml), observedAt },
    })),
  };
}
const temp = () => mkdtemp(join(tmpdir(), 'ltw-rules-'));

test('rule parser preserves mixed-content order, amendments, omitted spans and table boundaries without contact projection', () => {
  const text = parseRuleText(xml, '2025-00001');
  assert.equal(text.blocks[0].text, 'Some uses remain.');
  assert.ok(
    text.blocks.some((b) => b.text === 'This does not withdraw the rule. Context follows.'),
  );
  assert.ok(text.blocks.some((b) => b.kind === 'amendment' && b.section === 'regulatory'));
  assert.ok(text.blocks.some((b) => b.kind === 'omission' && b.text === '* * *'));
  assert.ok(text.blocks.some((b) => b.kind === 'table' && b.text.includes('10 | 20')));
  assert.ok(!JSON.stringify(text).includes('Do not project contacts'));
  assert.throws(
    () =>
      parseRuleText('<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///secret">]>' + xml, '2025-00001'),
    /Unsafe/,
  );
  assert.throws(() => parseRuleText('<html><P>Bad gateway</P></html>', '2025-00001'), /root/);
});
test('rule projection keeps indexed unknown dates separate from quoted dates and joins only explicit identifiers', () => {
  const second = metadata('2025-00002'),
    unrelated = metadata('2025-00003');
  unrelated.docket_ids = [];
  unrelated.regulation_id_numbers = [];
  const { data, texts } = buildRules(input([metadata(), second, unrelated]));
  assert.equal(data.documents[0].effectiveOn, null);
  assert.match(data.documents[0].dates, /certain provisions/);
  assert.equal(data.documents[0].amendmentCount, 1);
  assert.equal(texts.size, 3);
  assert.equal(relatedRules(data, data.documents[0]).length, 1);
  assert.equal(filterRules(data, { q: 'chemical', docket: 'EPA-HQ-OPPT-2020-0642' }).length, 2);
  assert.equal(filterRules(data, { type: 'Proposed Rule' }).length, 0);
});
test('rule history distinguishes first observation, revisions, new records and unchanged replay', () => {
  const first = buildRules(input()).data;
  assert.equal(first.events.length, 0);
  assert.deepEqual(buildRules(input(), first).data, first);
  const changed = metadata();
  changed.dates = 'Some provisions are now postponed until October 18, 2025.';
  const next = buildRules(input([changed, metadata('2025-00002')], later), first).data;
  assert.equal(next.events.length, 2);
  assert.deepEqual(next.events[0].changedFields, ['dates']);
  assert.equal(next.events[0].previousObservedAt, at);
  assert.equal(next.events[1].kind, 'document_added');
  assert.deepEqual(buildRules(input([changed, metadata('2025-00002')], later), next).data, next);
  const watch = {
    formatVersion: 1 as const,
    topics: ['Environmental protection'],
    seen: first.documents.map(ruleFingerprint),
  };
  assert.equal(ruleAlerts(first, watch).length, 0);
  assert.equal(ruleAlerts(next, watch).length, 2);
  const counter = metadata();
  counter.page_views = { count: 100 };
  const observed = buildRules(input([counter], later), first).data;
  assert.equal(observed.events.length, 0);
  assert.equal(ruleAlerts(observed, watch).length, 0);
  const withdrawal = metadata('2025-00003');
  withdrawal.type = 'Proposed Rule';
  withdrawal.action = 'Withdrawal of proposed rule.';
  withdrawal.topics = [];
  const withWithdrawal = buildRules(input([metadata(), withdrawal], later), first).data;
  assert.equal(ruleAlerts(withWithdrawal, watch).length, 1);
  assert.equal(
    withWithdrawal.documents.find((d) => d.id === withdrawal.document_number)!.topics.length,
    0,
  );
  assert.equal(matchesRuleTopics(withWithdrawal, withWithdrawal.documents[1], watch.topics), true);
  assert.equal(withWithdrawal.documents.length, 2); // Withdrawal is an action, not record deletion.
});
test('invalid, stale, conflicting, unsafe and incomplete rule acquisitions fail closed', () => {
  const first = buildRules(input()).data;
  const bad = input();
  bad.records[0].xml += ' ';
  assert.throws(() => buildRules(bad), /checksum/);
  const badUrl = input();
  badUrl.records[0].source.url += '?api_key=secret';
  assert.throws(() => buildRules(badUrl), /query/);
  const wrongId = input();
  wrongId.records[0].source.url =
    'https://www.federalregister.gov/api/v1/documents/2025-00002.json';
  assert.throws(() => buildRules(wrongId), /identity/);
  assert.throws(() => buildRules(input([metadata(), metadata()])), /Duplicate/);
  assert.throws(() => buildRules(input([], later), first), /missing/);
  assert.throws(() => buildRules(input([metadata()], '2026-08-01T12:00:00.000Z'), first), /Stale/);
  const changed = metadata();
  changed.dates = 'Conflicting same-time observation';
  assert.throws(() => buildRules(input([changed]), first), /Conflicting/);
  const mixed = input([changed], later);
  mixed.records[0].source.observedAt = at;
  assert.throws(() => buildRules(mixed, first), /Stale changed source/);
  const outside = metadata();
  outside.publication_date = '2024-12-01';
  assert.throws(() => buildRules(input([outside])), /outside/);
});
test('acquisition archives discovery and refreshes retained IDs outside the bounded query', async () => {
  const workspace = await temp(),
    seen: string[] = [];
  const fetcher = async (raw: any) => {
    const url = new URL(String(raw));
    seen.push(url.href);
    if (url.pathname.endsWith('/documents.json'))
      return Response.json({
        count: 10,
        total_pages: 10,
        results: [{ document_number: '2025-00002' }],
      });
    if (url.pathname.endsWith('.xml')) return new Response(xml);
    return Response.json(metadata(url.pathname.includes('00002') ? '2025-00002' : '2025-00001'));
  };
  const previous = buildRules(input()).data;
  const acquired = await collectRules(plan, previous, workspace, fetcher as typeof fetch);
  assert.equal(acquired.records.length, 2);
  assert.equal(acquired.truncated, true);
  assert.ok(seen.some((u) => u.endsWith('/2025-00001.json')));
  assert.equal(buildRules(acquired, previous).data.documents.length, 2);
  assert.equal(
    JSON.parse(await readFile(join(workspace, 'acquisition.json'), 'utf8')).records.length,
    2,
  );
  await assert.rejects(
    () => collectRules({ ...plan, maxTracked: 1 }, previous, workspace, fetcher as typeof fetch),
    /maxTracked/,
  );
});
test('rule publishing is replayable, preserves pointers on failure, and serves lazy hash-verified text under a base path', async () => {
  const workspace = await temp(),
    output = join(workspace, 'public');
  const first = await runRules({ input: input(), workspace, output });
  assert.equal(
    (await runRules({ input: input(), workspace, output })).manifest.release,
    first.manifest.release,
  );
  await assert.rejects(() => runRules({ input: input([], later), workspace, output }), /missing/);
  assert.equal((await readRulesPublication(output))!.manifest.release, first.manifest.release);
  const paths: string[] = [];
  const fetcher = async (raw: any) => {
    const path = String(raw);
    paths.push(path);
    return new Response(
      await readFile(join(output, path.replace('/contributor/data/rules/', '')), 'utf8'),
    );
  };
  const index = await loadRules(fetcher as typeof fetch, '/contributor');
  assert.equal(paths.length, 2);
  assert.equal(
    paths.some((p) => p.includes('/texts/')),
    false,
  );
  const doc = index.data.documents[0];
  const text = await loadRuleText(fetcher as typeof fetch, doc.id, doc.textHash, '/contributor');
  assert.equal(text.documentId, doc.id);
  await assert.rejects(
    () => loadRuleText(fetcher as typeof fetch, '2025-99999', doc.textHash, '/contributor'),
    /identity/,
  );
  await assert.rejects(
    () =>
      loadRuleText(
        (async () =>
          Response.json({ formatVersion: 1, documentId: doc.id, blocks: [] })) as typeof fetch,
        doc.id,
        doc.textHash,
      ),
    /integrity/,
  );
  await assert.rejects(
    () => loadRuleText(fetcher as typeof fetch, doc.id, '../../secret'),
    /Invalid/,
  );
});
