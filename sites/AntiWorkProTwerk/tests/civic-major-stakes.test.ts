import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from '../scripts/said-did/engine';
import {
  buildStakes,
  buildStakeSeries,
  parseStakeFiling,
  runStakes,
  stakeDocumentUrl,
  type StakeInput,
} from '../scripts/civic/major-stakes';
import {
  secSubmissionRows,
  secSubmissionsUrl,
  type SecCapture,
  type SecSubmissionRow,
} from '../scripts/civic/sec-submissions';
import { stakeComparison, stakeSelection, stakeStateCounts } from '../src/lib/civic/major-stakes';
import { loadStakes, readStakeDetail } from '../src/lib/civic/major-stakes-repository';

const cik = '0000000001',
  filer = '0000000011',
  at = '2026-09-16T00:00:00.000Z';
function capture(key: string, url: string, body: string): SecCapture {
  return {
    key,
    body,
    source: {
      url,
      hash: createHash('sha256').update(body).digest('hex'),
      bytes: Buffer.byteLength(body),
      observedAt: at,
      lastModified: null,
    },
  };
}
function row(n: number, form = 'SCHEDULE 13D'): SecSubmissionRow {
  return {
    accessionNumber: `0001234567-26-${String(n).padStart(6, '0')}`,
    filingDate: `2026-06-0${n}`,
    acceptanceDateTime: `2026-06-0${n}T12:00:00Z`,
    form,
    primaryDocument: 'primary_doc.xml',
  };
}
function xml(
  n: number,
  {
    g = false,
    modern = false,
    purpose = true,
    quantity = '9007199254740993.125',
    percent = '7.125',
    personCik = true,
    issuer = cik,
  }: {
    g?: boolean;
    modern?: boolean;
    purpose?: boolean;
    quantity?: string;
    percent?: string;
    personCik?: boolean;
    issuer?: string;
  } = {},
) {
  const form = `SCHEDULE 13${g ? 'G' : 'D'}${n > 1 ? '/A' : ''}`;
  const person = g
    ? `<coverPageHeaderReportingPersonDetails><reportingPersonName>Test Fund</reportingPersonName>${personCik ? '<reportingCik>11</reportingCik>' : ''}<reportingPersonBeneficiallyOwnedAggregateNumberOfShares>${quantity}</reportingPersonBeneficiallyOwnedAggregateNumberOfShares><classPercent>${percent}</classPercent><reportingPersonBeneficiallyOwnedNumberOfShares><soleVotingPower>0</soleVotingPower></reportingPersonBeneficiallyOwnedNumberOfShares><comments>Reporting realignment, not necessarily a sale.</comments></coverPageHeaderReportingPersonDetails>`
    : `<reportingPersons><reportingPersonInfo><reportingPersonName>Test Fund</reportingPersonName>${personCik ? '<reportingPersonCIK>11</reportingPersonCIK>' : ''}<aggregateAmountOwned>${quantity}</aggregateAmountOwned><percentOfClass>${percent}</percentOfClass><soleVotingPower>0</soleVotingPower><memberOfGroup>a</memberOfGroup><isAggregateExcludeShares>N</isAggregateExcludeShares><reportingPersonAddress>PRIVATE ADDRESS</reportingPersonAddress></reportingPersonInfo></reportingPersons>`;
  return `<edgarSubmission><headerData><submissionType>${form}</submissionType><filerInfo><filer><filerCredentials><cik>${filer}</cik><ccc>PRIVATE CCC</ccc></filerCredentials></filer></filerInfo></headerData><formData><coverPageHeader><issuerInfo><${g ? 'issuerCik' : 'issuerCIK'}>${issuer}</${g ? 'issuerCik' : 'issuerCIK'}><issuerName>Test Company</issuerName>${modern ? '<issuerCusips><issuerCusipNumber>111111111</issuerCusipNumber></issuerCusips>' : `<${g ? 'issuerCusip' : 'issuerCUSIP'}>111111111</${g ? 'issuerCusip' : 'issuerCUSIP'}>`}</issuerInfo><securitiesClassTitle>Common</securitiesClassTitle><${g ? 'eventDateRequiresFilingThisStatement' : 'dateOfEvent'}>06/0${n}/2026</${g ? 'eventDateRequiresFilingThisStatement' : 'dateOfEvent'}>${n > 1 ? `<amendmentNo>${n - 1}</amendmentNo>` : ''}</coverPageHeader>${person}${g ? `<items><item5><classOwnership5PercentOrLess>N</classOwnership5PercentOrLess></item5><item10>${purpose ? '<certifications>Held in the ordinary course.</certifications>' : ''}</item10></items>` : `<items1To7><item2><address>PRIVATE ITEM TWO</address></item2><item4>${purpose ? '<transactionPurpose>Investment purpose.\n\nPlans &amp; context.</transactionPurpose>' : ''}</item4></items1To7>`}<signature>PRIVATE SIGNATURE</signature></formData></edgarSubmission>`;
}
function filing(n: number, options: Parameters<typeof xml>[1] = {}) {
  const r = row(n, `SCHEDULE 13${options.g ? 'G' : 'D'}${n > 1 ? '/A' : ''}`);
  return {
    r,
    c: capture(
      'filing-' + r.accessionNumber,
      stakeDocumentUrl(cik, r.accessionNumber, r.primaryDocument),
      xml(n, options),
    ),
  };
}
function columns(rows: SecSubmissionRow[]) {
  return Object.fromEntries(
    ['accessionNumber', 'filingDate', 'acceptanceDateTime', 'form', 'primaryDocument'].map((k) => [
      k,
      rows.map((r) => r[k as keyof SecSubmissionRow]),
    ]),
  );
}
function fixture(historical = false): StakeInput {
  const f = [
    filing(1),
    filing(2, { modern: true, purpose: false, quantity: '9007199254740994.25', percent: '8' }),
  ];
  const history = 'CIK0000000001-submissions-001.json';
  const profile = {
    cik: 1,
    name: 'Test Company',
    tickers: ['TEST'],
    addresses: { business: { stateOrCountry: 'TX', street1: 'PRIVATE PROFILE' } },
    filings: {
      recent: columns(historical ? [f[1].r] : f.map((f) => f.r)),
      files: historical
        ? [{ name: history, filingCount: 1, filingFrom: '2026-06-01', filingTo: '2026-06-01' }]
        : [],
    },
  };
  return {
    formatVersion: 1,
    plan: {
      id: 'test',
      title: 'Synthetic test',
      selection: 'Fictional fixtures',
      issuers: [cik],
      from: '2026-01-01',
      through: '2026-09-15',
      maxFilings: 100,
      maxIndexPages: 10,
    },
    captures: [
      capture('issuer-' + cik, secSubmissionsUrl(cik), JSON.stringify(profile)),
      ...(historical
        ? [
            capture(
              history.replace('.json', '').toLowerCase(),
              secSubmissionsUrl(cik, history),
              JSON.stringify(columns([f[0].r])),
            ),
          ]
        : []),
      ...f.map((f) => f.c),
    ],
  };
}
function editCapture(input: StakeInput, key: string, change: (body: string) => string) {
  const i = input.captures.findIndex((c) => c.key === key),
    c = input.captures[i];
  input.captures[i] = capture(c.key, c.source.url, change(c.body));
}

test('13D legacy uppercase CUSIP joins modern schedules; exact decimals and missing purpose survive', () => {
  const { data, attachments } = buildStakes(fixture());
  assert.equal(data.series.length, 1);
  assert.deepEqual(data.series[0].cusips, ['111111111']);
  assert.equal(data.filings[1].purpose, 'not-restated');
  assert.equal(data.filings[0].reporters[0].quantity, '9007199254740993.125');
  assert.equal(
    stakeComparison(...(data.filings as [(typeof data.filings)[0], (typeof data.filings)[0]]))
      .values[0].quantityDelta,
    '1.125',
  );
  const first = attachments[`filings/${data.filings[0].accession}.json`];
  assert.equal(
    first.fields.find((f) => f.path.endsWith('transactionPurpose'))?.text,
    'Investment purpose.\n\nPlans & context.',
  );
  assert.ok(!JSON.stringify({ data, attachments }).includes('PRIVATE'));
});

test('13G numeric fields, nulls, zero and certification are distinct from takeover purpose', () => {
  const { r, c } = filing(1, { g: true, quantity: '', percent: '0' }),
    d = parseStakeFiling(r, c);
  assert.equal(d.filing.purpose, '13g-certification');
  assert.equal(d.filing.reporters[0].quantity, null);
  assert.equal(d.filing.reporters[0].percent, '0');
  assert.equal(d.filing.reporters[0].soleVoting, '0');
  assert.equal(d.filing.reporters[0].sharedVoting, null);
  assert.equal(d.filing.belowThreshold, false);
  assert.ok(d.fields.some((f) => f.text.includes('realignment')));
  const modern = filing(1, { g: true, modern: true });
  assert.deepEqual(parseStakeFiling(modern.r, modern.c).filing.cusips, ['111111111']);
});

test('namespace prefixes are supported; multiple securities are retained as one disclosed set', () => {
  const { r, c } = filing(1, { modern: true });
  c.body = c.body
    .replace(
      '<issuerCusipNumber>111111111</issuerCusipNumber>',
      '<issuerCusipNumber>111111111</issuerCusipNumber><issuerCusipNumber>222222222</issuerCusipNumber>',
    )
    .replace(/<(\/?)([A-Za-z][A-Za-z0-9]*)/g, '<$1sec:$2');
  const d = parseStakeFiling(r, c);
  assert.deepEqual(d.filing.cusips, ['111111111', '222222222']);
  assert.equal(d.filing.reporters[0].quantity, '9007199254740993.125');
});

test('overlapping reporters are not summed, changed or missing names never become zero', () => {
  const a = filing(1, { personCik: false }),
    b = filing(2, { personCik: false });
  const before = parseStakeFiling(a.r, a.c).filing,
    after = parseStakeFiling(b.r, b.c).filing;
  assert.equal(before.reporters[0].identity, 'filer-scoped-name');
  const changed = parseStakeFiling(b.r, {
    ...b.c,
    body: b.c.body.replace('Test Fund', 'Renamed Fund'),
  }).filing;
  assert.equal(stakeComparison(before, changed).values[0].quantityDelta, null);
  assert.equal(stakeComparison(before, changed).notRepeated.length, 1);
  const doubled = {
    ...after,
    reporters: [...after.reporters, { ...after.reporters[0], id: 'other', name: 'Co-reporter' }],
  };
  assert.equal(stakeComparison(before, doubled).values.length, 2);
  assert.equal(stakeComparison(before, doubled).values[1].quantityDelta, null);
});

test('comparison blocks revised event dates, future event dates, form conversion and unresolved security', () => {
  const [a, b] = buildStakes(fixture()).data.filings;
  for (const next of [
    { ...b, event: a.event },
    { ...b, event: '2027-01-01' },
    { ...b, form: 'SCHEDULE 13G/A' as const },
    { ...b, cusips: [] },
    { ...b, filerCik: '0000000012' },
  ])
    assert.equal(stakeComparison(a, next).values[0].quantityDelta, null);
  const offset = { ...a, accepted: '2026-06-01T23:00:00-12:00' };
  assert.notEqual(stakeComparison(offset, b).values[0].quantityDelta, null);
  assert.equal(
    stakeComparison({ ...offset, accepted: '2026-06-02T01:00:00-12:00' }, b).values[0]
      .quantityDelta,
    null,
  );
});

test('history warns about missing originals and nonconsecutive amendments without inventing them', () => {
  const [a, b] = buildStakes(fixture()).data.filings;
  assert.match(buildStakeSeries([b])[0].issues.join(' '), /begins with an amendment/);
  assert.match(
    buildStakeSeries([a, { ...b, amendmentNo: 3 }])[0].issues.join(' '),
    /nonconsecutive/,
  );
  assert.match(
    buildStakeSeries([a, { ...b, previousAccession: '0001234567-25-000099' }])[0].issues.join(' '),
    /outside/,
  );
});

test('historical indexes are included, coverage is enforced and caps fail instead of truncating', () => {
  const input = fixture(true),
    built = buildStakes(input);
  assert.equal(built.data.issuers[0].historyPages, 1);
  assert.equal(built.data.filings.length, 2);
  assert.throws(
    () =>
      buildStakes({ ...input, captures: input.captures.filter((c) => !c.key.startsWith('cik')) }),
    /historical/,
  );
  assert.throws(() => buildStakes({ ...input, plan: { ...input.plan, maxFilings: 1 } }), /cap/);
  assert.throws(() => buildStakes({ ...input, plan: { ...input.plan, maxIndexPages: 1 } }), /cap/);
  const bad = structuredClone(input);
  editCapture(bad, 'issuer-' + cik, (s) => s.replace('"filingCount":1', '"filingCount":2'));
  assert.throws(() => buildStakes(bad), /count or date/);
  assert.throws(() => secSubmissionRows({ accessionNumber: ['0001234567-26-000001'] }), /columns/);
  assert.throws(() => secSubmissionRows(columns([row(1), row(1)])), /Duplicate/);
});

test('source identity, checksums, XML form and numeric validation fail closed', () => {
  const input = fixture();
  input.captures[1].body += ' ';
  assert.throws(() => buildStakes(input), /integrity/);
  const wrong = fixture();
  editCapture(wrong, 'issuer-' + cik, (s) => s.replace('"cik":1', '"cik":2'));
  assert.throws(() => buildStakes(wrong), /CIK/);
  const f = filing(1);
  assert.throws(() => parseStakeFiling({ ...f.r, form: 'SCHEDULE 13G' }, f.c), /form disagrees/);
  for (const quantity of ['-1', 'NaN', '1,000']) {
    const f = filing(1, { quantity });
    assert.throws(() => parseStakeFiling(f.r, f.c), /amount/);
  }
  const excessive = filing(1, { percent: '100.01' });
  assert.throws(() => parseStakeFiling(excessive.r, excessive.c), /exceeds 100/);
  assert.throws(
    () => stakeDocumentUrl(cik, row(1).accessionNumber, '../../private.xml'),
    /structured/,
  );
  assert.throws(() => secSubmissionsUrl(cik, 'CIK0000000002-submissions-001.json'), /filename/);
});

test('filings about a different subject issuer are explicitly excluded, not misattributed', () => {
  const input = fixture();
  editCapture(input, input.captures[1].key, (s) =>
    s.replace(`<issuerCIK>${cik}</issuerCIK>`, '<issuerCIK>0000000099</issuerCIK>'),
  );
  const data = buildStakes(input).data;
  assert.equal(data.filings.length, 1);
  assert.equal(data.exclusions[0].actualIssuer, '0000000099');
});

test('state counts count issuers once and ignore selected evidence but preserve collection filters', () => {
  const { data } = buildStakes(fixture());
  assert.deepEqual(stakeStateCounts(data, new URLSearchParams('state=CA&series=missing')), {
    TX: 1,
  });
  assert.deepEqual(stakeStateCounts(data, new URLSearchParams('q=unknown')), {});
  assert.equal(stakeSelection(data, new URLSearchParams('q=TEST&initial=1')).length, 1);
  assert.equal(stakeSelection(data, new URLSearchParams('form=13G')).length, 0);
  assert.equal(stakeSelection(data, new URLSearchParams('state=CA')).length, 0);
});

test('identical portable replay is stable; scope loss and stale recaptures are rejected', () => {
  const input = fixture(),
    first = buildStakes(input).data;
  assert.equal(hash(buildStakes(input, first).data), hash(first));
  assert.throws(
    () =>
      buildStakes(
        {
          ...input,
          captures: input.captures.filter((c) => c.key !== 'filing-0001234567-26-000001'),
          plan: { ...input.plan, from: '2026-06-02' },
        },
        first,
      ),
    /disappeared/,
  );
  const stale = structuredClone(input);
  stale.captures.forEach((c) => (c.source.observedAt = '2026-09-15T00:00:00.000Z'));
  assert.throws(() => buildStakes(stale, first), /Stale/);
});

test('published evidence loads lazily with checksums, rejects tampering and honors cancellation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ltw-stakes-')),
    output = join(directory, 'public');
  const a = await runStakes({ input: fixture(), workspace: join(directory, 'job'), output });
  const b = await runStakes({ input: fixture(), workspace: join(directory, 'job'), output });
  assert.equal(a.release, b.release);
  let requests = 0,
    tamper = false;
  const fetcher = (async (input: RequestInfo | URL) => {
    requests++;
    const url = String(input),
      local = url.replace('/data/major-stakes/', '');
    let body = await readFile(join(output, local), 'utf8');
    if (tamper) body = body.replace('Test Fund', 'Forged Fund');
    return new Response(body, { headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const bundle = await loadStakes(fetcher);
  assert.equal(requests, 2);
  const accession = bundle.data.filings[0].accession;
  assert.equal((await readStakeDetail(fetcher, bundle, accession)).filing.accession, accession);
  tamper = true;
  await assert.rejects(() => readStakeDetail(fetcher, bundle, accession), /integrity/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => readStakeDetail(fetcher, bundle, accession, '', controller.signal),
    /abort/i,
  );
  await assert.rejects(() => readStakeDetail(fetcher, bundle, '0001234567-26-999999'), /outside/);
});
