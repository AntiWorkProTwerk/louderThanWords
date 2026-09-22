import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fundVoteDirection,
  fundVoteManagement,
  fundVoteDataSchema,
  fundVoteMeetingSchema,
  fundVoteFundDetailSchema,
  fundVoteEvidencePageSchema,
  type FundVoteCover,
  type FundVotePlan,
} from '../src/lib/civic/fund-votes';
import { resolveFundVotes } from '../scripts/civic/fund-vote-resolution';
import { buildFundVotes, runFundVotes } from '../scripts/civic/fund-votes';
import { hash } from '../scripts/said-did/engine';
import {
  parseFundVoteCover,
  parseFundVoteRecord,
  proxyXmlRows,
  fundMeetingDate,
} from '../scripts/civic/fund-vote-parser';
import { secDocumentUrl, secDirectory, secXmlDocuments } from '../scripts/civic/sec-filing-index';
import { acquireFundVotes, normalizeFundVotes } from '../scripts/civic/fund-votes-acquisition';
import {
  secSubmissionsUrl,
  type SecCapture,
  type SecSubmissionRow,
} from '../scripts/civic/sec-submissions';
const cik = '0000000001',
  series = 'S000000001',
  acc = '0001234567-26-000001';
const row: SecSubmissionRow = {
  accessionNumber: acc,
  filingDate: '2026-08-01',
  acceptanceDateTime: '2026-08-01T12:00:00Z',
  form: 'N-PX',
  primaryDocument: 'xslN-PX_X01/primary_doc.xml',
};
const plan: FundVotePlan = {
  id: 'synthetic',
  title: 'Synthetic',
  selection: 'Fictional tests',
  period: '2026-06-30',
  filedThrough: '2026-09-16',
  funds: [{ cik, series }],
  maxFilings: 10,
  maxIndexPages: 10,
  maxVotes: 100,
  maxFileBytes: 5000000,
};
const capture = (key: string, url: string, body: string): SecCapture => ({
  key,
  body,
  source: {
    url,
    hash: createHash('sha256').update(body).digest('hex'),
    bytes: Buffer.byteLength(body),
    observedAt: '2026-09-16T00:00:00.000Z',
    lastModified: null,
  },
});
const coverBody = `<edgarSubmission><headerData><submissionType>N-PX</submissionType><filerInfo><filer><issuerCredentials><cik>${cik}</cik><ccc>PRIVATE TOKEN</ccc></issuerCredentials></filer><periodOfReport>06/30/2026</periodOfReport></filerInfo></headerData><formData><coverPage><yearOrQuarter>YEAR</yearOrQuarter><reportingPerson><name>Test Trust</name><address><stateOrCountry>TX</stateOrCountry><street1>PRIVATE STREET</street1></address></reportingPerson><reportInfo><reportType>FUND VOTING REPORT</reportType></reportInfo><explanatoryInformation><explanatoryNotes>Separate manager groups may overlap.</explanatoryNotes></explanatoryInformation></coverPage><summaryPage><otherIncludedManagersCount>1</otherIncludedManagersCount><otherManagers2><investmentManagers><serialNo>1</serialNo><name>Test Manager</name><form13FFileNumber>028-12345</form13FFileNumber></investmentManagers></otherManagers2></summaryPage><seriesPage><seriesCount>1</seriesCount><seriesDetails><seriesReports><idOfSeries>${series}</idOfSeries><nameOfSeries>Test Fund</nameOfSeries></seriesReports></seriesDetails></seriesPage><signaturePage>PRIVATE SIGNATURE</signaturePage></formData></edgarSubmission>`;
function cover(body = coverBody) {
  return parseFundVoteCover(
    row,
    capture('cover', secDocumentUrl(cik, acc, 'primary_doc.xml'), body),
  );
}
function raw(choice = 'FOR', shares = '9007199254740993.125', manager = '') {
  return `<proxyTable><issuerName>Example Company</issuerName><cusip>111111111</cusip><isin>US1111111111</isin><meetingDate>05/01/2026</meetingDate><voteDescription>Report on workforce safety.</voteDescription><voteCategories><voteCategory><categoryType>HUMAN RIGHTS OR HUMAN CAPITAL/WORKFORCE</categoryType></voteCategory></voteCategories><voteSource>SECURITY HOLDER</voteSource><sharesVoted>${shares}</sharesVoted><sharesOnLoan>0</sharesOnLoan><vote><voteRecord><howVoted>${choice}</howVoted><sharesVoted>${shares}</sharesVoted><managementRecommendation>AGAINST</managementRecommendation></voteRecord></vote>${manager ? `<voteManager><otherManagers><otherManager>${manager}</otherManager></otherManagers></voteManager>` : ''}<voteSeries>${series}</voteSeries><voteOtherInfo>As reported.</voteOtherInfo></proxyTable>`;
}
function record(body = raw(), ordinal = 1) {
  return parseFundVoteRecord(body, ordinal, 'Votes.xml', cover());
}
function sourceMap() {
  const indexName = acc + '-index.html',
    files = [indexName, 'primary_doc.xml', 'Votes.xml'];
  const html = [
    '<table>',
    ...['primary_doc.xml', 'Votes.xml'].map(
      (name, i) =>
        `<tr><td>${i + 1}</td><td></td><td><a href="${secDocumentUrl(cik, acc, name).replace('/' + name, '/xslN-PX_X01/' + name)}">HTML</a></td><td>${i ? 'PROXY VOTING RECORD' : 'N-PX'}</td><td></td></tr><tr><td>${i + 1}</td><td></td><td><a href="${name}">XML</a></td><td>${i ? 'PROXY VOTING RECORD' : 'N-PX'}</td><td>100</td></tr>`,
    ),
    '</table>',
  ].join('');
  const recent = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, [v]]));
  return new Map([
    [
      secSubmissionsUrl(cik),
      JSON.stringify({ cik: 1, name: 'Test Trust', filings: { recent, files: [] } }),
    ],
    [secDocumentUrl(cik, acc, 'primary_doc.xml'), coverBody],
    [
      secDocumentUrl(cik, acc, 'index.json'),
      JSON.stringify({
        directory: {
          name: new URL(secDocumentUrl(cik, acc, 'index.json')).pathname.replace('/index.json', ''),
          item: files.map((name) => ({ name, size: '100', type: 'text.gif' })),
        },
      }),
    ],
    [secDocumentUrl(cik, acc, indexName), html],
    [
      secDocumentUrl(cik, acc, 'Votes.xml'),
      `<proxyVoteTable>${raw()}${raw('AGAINST', '10', '1')}</proxyVoteTable>`,
    ],
  ]);
}

test('N-PX cover projects exact series and manager identifiers without credentials or signatures', () => {
  const c = cover();
  assert.equal(c.series[0].id, series);
  assert.equal(c.state, 'TX');
  assert.equal(c.managers[0].file13f, '028-12345');
  assert.ok(!JSON.stringify(c).includes('PRIVATE'));
  assert.throws(() => cover(coverBody.replace('<seriesCount>1', '<seriesCount>2')), /series count/);
  assert.throws(
    () =>
      cover(coverBody.replace('<otherIncludedManagersCount>1', '<otherIncludedManagersCount>2')),
    /manager count/,
  );
});

test('amendment covers distinguish full restatements from added proxy records and preserve fund notices', () => {
  for (const type of ['RESTATEMENT', 'NEW PROXY']) {
    const body = coverBody
      .replace('<submissionType>N-PX</submissionType>', '<submissionType>N-PX/A</submissionType>')
      .replace(
        '<yearOrQuarter>YEAR</yearOrQuarter>',
        `<yearOrQuarter>YEAR</yearOrQuarter><amendmentInfo><isAmendment>Y</isAmendment><amendmentNo>1</amendmentNo><amendmentType>${type}</amendmentType></amendmentInfo>`,
      );
    const amended = parseFundVoteCover(
      { ...row, form: 'N-PX/A' },
      capture('cover', secDocumentUrl(cik, acc, 'primary_doc.xml'), body),
    );
    assert.equal(amended.amendment, type);
    assert.equal(amended.amendmentNo, 1);
  }
  assert.equal(
    cover(coverBody.replace('FUND VOTING REPORT', 'FUND NOTICE REPORT')).reportType,
    'FUND NOTICE REPORT',
  );
  assert.throws(
    () => cover(coverBody.replace('N-PX</submissionType>', 'N-PX/A</submissionType>')),
    /form or period/,
  );
});

test('withdrawn wording and a positive amount without vote directions do not invent a vote', () => {
  const body = raw()
    .replace(/<vote>[\s\S]*?<\/vote>/, '')
    .replace('Report on workforce safety.', 'Election of director *Withdrawn Resolution*');
  const r = record(body);
  assert.equal(r.votes.length, 0);
  assert.equal(r.shares, '9007199254740993.125');
  assert.match(r.issues.join(' '), /No vote directions/);
  assert.equal(fundVoteDirection([r]).status, 'unresolved');
  assert.equal(record(raw().replace('SECURITY HOLDER', 'UNKNOWN')).proposal, null);
});
test('N-PX exact amounts and manager-group duplicate rows stay separate; split directions are not majority votes', () => {
  const a = record(),
    b = record(raw('AGAINST', '10', '1'), 2);
  assert.equal(a.shares, '9007199254740993.125');
  assert.equal(a.proposal, b.proposal);
  assert.notEqual(a.id, b.id);
  assert.deepEqual(fundVoteDirection([a, b]), {
    status: 'multiple-directions',
    choices: ['AGAINST', 'FOR'],
  });
  assert.equal(b.managers[0], '1');
  assert.deepEqual(fundVoteDirection([]), { status: 'not-reported', choices: [] });
  assert.equal(fundVoteDirection([record(raw('FOR', '0'))]).status, 'no-shares-voted');
});
test('same-proposal matching requires security, date, wording and source; no name-only or thematic guesses', () => {
  const a = record();
  assert.equal(
    a.proposal,
    record(raw().replace('workforce safety.', 'workforce\n   safety.')).proposal,
  );
  for (const body of [
    raw().replace('111111111</cusip>', '222222222</cusip>'),
    raw().replace('05/01/2026', '05/02/2026'),
    raw().replace('workforce safety.', 'workforce pay.'),
    raw().replace('SECURITY HOLDER', 'ISSUER'),
  ])
    assert.notEqual(record(body).proposal, a.proposal);
  const missing = record(
    raw().replace('<cusip>111111111</cusip>', '').replace('<isin>US1111111111</isin>', ''),
  );
  assert.equal(missing.proposal, null);
  assert.match(missing.issues.join(' '), /identifier/);
});
test('unresolved amounts, dates, series and managers remain visible without invented zeros or votes', () => {
  for (const body of [
    raw().replaceAll('9007199254740993.125', 'NaN'),
    raw().replace('05/01/2026', '45447'),
    raw().replace(series, 'S000000099'),
    raw('FOR', '5', '99'),
  ]) {
    const r = record(body);
    assert.ok(r.issues.length);
    assert.equal(fundVoteDirection([r]).status, 'unresolved');
  }
  assert.equal(fundMeetingDate('02/30/2026'), null);
  assert.equal(fundMeetingDate('2026-05-01'), null);
  assert.equal(record(raw().replace('05/01/2026', '07/01/2026')).proposal, null);
  const mismatch = record(
    raw().replace(
      '<sharesVoted>9007199254740993.125</sharesVoted>',
      '<sharesVoted>1</sharesVoted>',
    ),
  );
  assert.match(mismatch.issues.join(' '), /reconcile/);
});
test('large vote tables are parsed record by record with no truncation, DTD or unknown-child fallback', () => {
  const body = `<?xml version="1.0"?><proxyVoteTable xmlns="http://www.sec.gov/edgar/document/npxproxy/informationtable">${raw()}<!-- separator -->${raw('AGAINST')}</proxyVoteTable>`;
  const rows = [...proxyXmlRows(body, 5000000)];
  assert.deepEqual(
    rows.map((r) => r.ordinal),
    [1, 2],
  );
  assert.equal(rows[0].raw, raw());
  assert.throws(() => [...proxyXmlRows(body, 10)], /size/);
  assert.throws(
    () => [
      ...proxyXmlRows(body.replace('</proxyVoteTable>', '<unknown/></proxyVoteTable>'), 5000000),
    ],
    /trailing/,
  );
  assert.throws(
    () => [...proxyXmlRows('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///secret">]>' + body, 5000000)],
    /entity/,
  );
  assert.throws(
    () => [...proxyXmlRows(body.replace('</proxyVoteTable>', ''), 5000000)],
    /Malformed/,
  );
  const prefixed = raw().replace(/<(\/?)(\w+)/g, '<$1n:$2');
  assert.equal(record(prefixed).proposal, record().proposal);
});
test('filing directory preserves filename case and deduplicates only equivalent rendered/raw document links', () => {
  const map = sourceMap(),
    url = secDocumentUrl(cik, acc, 'index.json'),
    directory = secDirectory(cik, acc, capture('index', url, map.get(url)!));
  const docs = secXmlDocuments(
    cik,
    acc,
    map.get(secDocumentUrl(cik, acc, directory.index))!,
    directory.files,
  );
  assert.deepEqual(docs, [
    { name: 'primary_doc.xml', role: 'N-PX' },
    { name: 'Votes.xml', role: 'PROXY VOTING RECORD' },
  ]);
  assert.throws(() => secDocumentUrl(cik, acc, '../Votes.xml'), /filename/);
  const html = map.get(secDocumentUrl(cik, acc, directory.index))!;
  assert.throws(
    () =>
      secXmlDocuments(
        cik,
        acc,
        html.replaceAll('https://www.sec.gov', 'https://other.example'),
        directory.files,
      ),
    /outside/,
  );
  assert.throws(
    () => secXmlDocuments(cik, acc, html.replace('PROXY VOTING RECORD', 'N-PX'), directory.files),
    /Conflicting/,
  );
});
test('N-PX acquisition archives complete sources and replays offline without network access', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ltw-fund-votes-')),
    map = sourceMap();
  let requests = 0;
  const fetcher = (async (url: RequestInfo | URL) => {
    requests++;
    const body = map.get(String(url));
    assert.notEqual(body, undefined, String(url));
    return new Response(body, {
      headers: {
        'content-type': String(url).endsWith('.xml')
          ? 'application/xml'
          : String(url).endsWith('.json')
            ? 'application/json'
            : 'text/html',
      },
    });
  }) as typeof fetch;
  const input = await acquireFundVotes(plan, dir, false, fetcher),
    corpus = normalizeFundVotes(input);
  assert.equal(requests, 5);
  assert.equal(corpus.scanned, 2);
  assert.equal(corpus.covers.length, 1);
  const replay = await acquireFundVotes(plan, dir, true, (async () => {
    throw new Error('Network forbidden');
  }) as typeof fetch);
  assert.deepEqual(normalizeFundVotes(replay), corpus);
  const bad = structuredClone(input);
  bad.captures[0].body += ' ';
  assert.throws(() => normalizeFundVotes(bad), /integrity/);
  assert.throws(() => normalizeFundVotes({ ...input, plan: { ...plan, maxVotes: 1 } }), /cap/);
  assert.throws(
    () =>
      normalizeFundVotes({
        ...input,
        captures: input.captures.filter((c) => !c.key.startsWith('votes-')),
      }),
    /Missing discovered/,
  );
  assert.ok(
    (await readFile(join(dir, 'sources', 'receipts', 'issuer-' + cik + '.json'), 'utf8')).includes(
      'observedAt',
    ),
  );
});

function amended(number: number, amendment: 'RESTATEMENT' | 'NEW PROXY'): FundVoteCover {
  return {
    ...cover(),
    accession: `0001234567-26-${String(number + 1).padStart(6, '0')}`,
    accepted: `2026-08-${String(number + 1).padStart(2, '0')}T12:00:00Z`,
    filed: `2026-08-${String(number + 1).padStart(2, '0')}`,
    form: 'N-PX/A',
    amendmentNo: number,
    amendment,
  };
}
test('fund amendment resolution replaces whole records, adds records, and retains every version', () => {
  const original = cover(),
    add = amended(1, 'NEW PROXY'),
    restate = amended(2, 'RESTATEMENT'),
    later = amended(3, 'NEW PROXY');
  const first = resolveFundVotes(plan, [add, original])[0];
  assert.equal(first.status, 'voting-report');
  assert.deepEqual(first.active, [original.accession, add.accession]);
  const last = resolveFundVotes(plan, [later, original, restate, add])[0];
  assert.deepEqual(last.active, [restate.accession, later.accession]);
  assert.deepEqual(last.superseded, [original.accession, add.accession]);
  assert.equal(last.filings.length, 4);
  assert.deepEqual(last.issues, []);
  assert.equal(resolveFundVotes(plan, [])[0].status, 'missing');
  assert.equal(
    resolveFundVotes(plan, [{ ...original, reportType: 'FUND NOTICE REPORT' }])[0].status,
    'notice',
  );
});
test('ambiguous amendment targets, orders and duplicate originals never silently merge', () => {
  const original = cover(),
    add = amended(1, 'NEW PROXY');
  const cases = [
    [original, { ...original, accession: add.accession, accepted: add.accepted }],
    [
      original,
      { ...add, series: [...add.series, { id: 'S000000002', name: 'Other Fund', lei: null }] },
    ],
    [original, { ...add, accepted: original.accepted }],
    [original, add, { ...amended(2, 'RESTATEMENT'), amendmentNo: 1 }],
    [{ ...original, accepted: '2026-08-20T00:00:00Z' }, add],
    [original, { ...add, amendmentNo: null }],
  ];
  for (const files of cases) {
    const result = resolveFundVotes(plan, files)[0];
    assert.equal(result.status, 'unresolved', JSON.stringify(files));
    assert.deepEqual(result.active, []);
    assert.deepEqual(result.superseded, []);
  }
  assert.throws(() => resolveFundVotes(plan, [original, original]), /Duplicate/);
});
test('added records require a complete baseline; full restatements can restore one with a history warning', () => {
  const original = cover(),
    gap = amended(2, 'NEW PROXY'),
    full = amended(3, 'RESTATEMENT');
  assert.equal(resolveFundVotes(plan, [amended(1, 'NEW PROXY')])[0].status, 'unresolved');
  assert.equal(resolveFundVotes(plan, [original, gap])[0].status, 'unresolved');
  const recovered = resolveFundVotes(plan, [original, gap, full])[0];
  assert.equal(recovered.status, 'voting-report');
  assert.deepEqual(recovered.active, [full.accession]);
  assert.ok(recovered.cautions.some((c) => c.includes('missing')));
  const standalone = resolveFundVotes(plan, [full])[0];
  assert.equal(standalone.status, 'voting-report');
  assert.ok(standalone.cautions.length);
  assert.equal(
    resolveFundVotes(plan, [
      { ...original, reportType: 'FUND NOTICE REPORT' },
      amended(1, 'NEW PROXY'),
    ])[0].status,
    'unresolved',
  );
  assert.ok(
    resolveFundVotes(plan, [{ ...original, confidential: true }])[0].cautions.some((c) =>
      c.includes('confidential'),
    ),
  );
});

function portableFixture(twoFunds = false) {
  const second = 'S000000002',
    selectedPlan = structuredClone(plan),
    map = sourceMap();
  if (twoFunds) {
    selectedPlan.funds.push({ cik, series: second });
    map.set(
      secDocumentUrl(cik, acc, 'primary_doc.xml'),
      coverBody
        .replace('<seriesCount>1</seriesCount>', '<seriesCount>2</seriesCount>')
        .replace(
          '</seriesDetails>',
          `<seriesReports><idOfSeries>${second}</idOfSeries><nameOfSeries>Second Test Fund</nameOfSeries></seriesReports></seriesDetails>`,
        ),
    );
    map.set(
      secDocumentUrl(cik, acc, 'Votes.xml'),
      `<proxyVoteTable>${raw()}${raw('AGAINST').replace(series, second)}</proxyVoteTable>`,
    );
  }
  const keys = [
    [`issuer-${cik}`, secSubmissionsUrl(cik)],
    [`cover-${acc}`, secDocumentUrl(cik, acc, 'primary_doc.xml')],
    [`directory-${acc}`, secDocumentUrl(cik, acc, 'index.json')],
    [`index-${acc}`, secDocumentUrl(cik, acc, acc + '-index.html')],
    [`votes-${acc}-${hash('Votes.xml').slice(0, 12)}`, secDocumentUrl(cik, acc, 'Votes.xml')],
  ];
  return {
    formatVersion: 1 as const,
    plan: selectedPlan,
    captures: keys.map(([key, url]) => capture(key, url, map.get(url)!)),
  };
}
test('compact publication compares exact proposals and has a verified lazy path to every original row', () => {
  const result = buildFundVotes(portableFixture(true)),
    { data, attachments } = result;
  assert.equal(data.counts.proposals, 1);
  assert.equal(data.counts.comparable, 1);
  assert.equal(data.counts.differing, 1);
  assert.equal(data.funds.length, 2);
  assert.equal(data.counts.retainedRows, 2);
  assert.equal(data.counts.activeRows, 2);
  const a = fundVoteFundDetailSchema.parse(attachments[data.funds[0].file.path]);
  const b = fundVoteFundDetailSchema.parse(attachments[data.funds[1].file.path]);
  assert.deepEqual(a.meetings[0].file, b.meetings[0].file);
  const meeting = fundVoteMeetingSchema.parse(attachments[a.meetings[0].file.path]);
  assert.deepEqual(
    meeting.proposals[0].records.map((r) => r.record.votes[0].choice),
    ['FOR', 'AGAINST'],
  );
  for (const r of meeting.proposals[0].records) {
    const page = fundVoteEvidencePageSchema.parse(attachments[r.page.path]);
    const evidence = page.evidence.find((e) => e.record.id === r.record.id)!;
    assert.equal(hash(evidence.raw), r.record.rawHash);
    assert.equal(evidence.record.shares, '9007199254740993.125');
    assert.deepEqual(evidence.record, r.record);
  }
  // Walk every nested attachment reference, not just the small root manifest.
  const seen = new Set<string>();
  function walk(v: any): void {
    if (!v || typeof v !== 'object') return;
    if (typeof v.path === 'string' && typeof v.hash === 'string') {
      assert.equal(hash(attachments[v.path]), v.hash);
      assert.equal(Buffer.byteLength(JSON.stringify(attachments[v.path])), v.bytes);
      if (!seen.has(v.path)) {
        seen.add(v.path);
        walk(attachments[v.path]);
      }
    } else for (const child of Object.values(v)) walk(child);
  }
  walk(data);
  assert.equal(seen.size, Object.keys(attachments).length);
  assert.ok(!JSON.stringify(data).includes('<proxyTable>'));
  assert.equal(fundVoteManagement('AGAINST'), 'Against management’s recommendation');
  assert.equal(fundVoteManagement('NONE'), 'No management recommendation');
});
test('unresolved, unmatched and unassigned source rows remain downloadable and do not invent comparisons', () => {
  const input = portableFixture(true),
    votes = input.captures.find((c) => c.key.startsWith('votes-'))!;
  const variants = [
    raw('AGAINST')
      .replace(series, 'S000000002')
      .replace(/<vote>.*<\/vote>/, ''),
    raw().replace('05/01/2026', 'unknown'),
    raw().replace(series, 'S999999999'),
  ];
  votes.body = `<proxyVoteTable>${raw()}${variants.join('')}</proxyVoteTable>`;
  votes.source.hash = hash(votes.body);
  votes.source.bytes = Buffer.byteLength(votes.body);
  const { data, attachments } = buildFundVotes(input);
  assert.equal(data.counts.retainedRows, 4);
  assert.equal(data.counts.activeRows, 3);
  assert.equal(data.counts.unassignedRows, 1);
  assert.equal(data.counts.unmatchedRows, 1);
  assert.equal(data.counts.unresolvedRows, 2);
  assert.equal(data.counts.comparable, 0);
  assert.equal(data.counts.differing, 0);
  assert.ok(data.funds.every((f) => f.cautions.some((c) => c.includes('attribution'))));
  const detail = fundVoteFundDetailSchema.parse(attachments[data.funds[0].file.path]);
  assert.equal(detail.unmatched.length, 1);
});
test('public job supports portable offline replay and rejects stale, narrowed and corrupted releases', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ltw-fund-public-')),
    input = portableFixture(true);
  const options = {
    input,
    workspace: join(dir, 'work'),
    output: join(dir, 'public'),
    offline: true,
  };
  const first = await runFundVotes(options),
    replay = await runFundVotes(options);
  assert.equal(replay.release, first.release);
  const manifest = JSON.parse(await readFile(join(options.output, 'manifest.json'), 'utf8'));
  const saved = JSON.parse(
    await readFile(join(options.output, 'releases', first.release, 'data.json'), 'utf8'),
  );
  const previous = fundVoteDataSchema.parse(saved);
  assert.equal(hash(saved), manifest.dataHash);
  for (const [path, digest] of Object.entries(manifest.files))
    assert.equal(
      hash(
        JSON.parse(await readFile(join(options.output, 'releases', first.release, path), 'utf8')),
      ),
      digest,
    );
  const stale = structuredClone(input);
  stale.captures.forEach((c) => (c.source.observedAt = '2026-09-15T00:00:00.000Z'));
  assert.throws(() => buildFundVotes(stale, previous), /stale/);
  const narrowed = structuredClone(input);
  narrowed.plan.funds.pop();
  assert.throws(() => buildFundVotes(narrowed, previous), /scope narrowed/);
  const changed = structuredClone(input),
    table = changed.captures.find((c) => c.key.startsWith('votes-'))!;
  table.body = table.body.replace('AGAINST', 'ABSTAIN');
  table.source.hash = hash(table.body);
  table.source.bytes = Buffer.byteLength(table.body);
  assert.throws(() => buildFundVotes(changed, previous), /same-capture/);
  await assert.rejects(
    () => runFundVotes({ ...options, input: { ...input, captures: input.captures.slice(1) } }),
    /Missing/,
  );
  assert.equal(
    JSON.parse(await readFile(join(options.output, 'manifest.json'), 'utf8')).release,
    first.release,
  );
});
