import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from '../scripts/said-did/engine';
import {
  buildEcho,
  acquireEcho,
  echoSearchUrl,
  echoPageUrl,
  echoReportUrl,
  echoDate,
  echoMoney,
  runEcho,
} from '../scripts/civic/echo';
import {
  filterEcho,
  echoStatus,
  echoYearRows,
  echoInvalidWindow,
  type EchoPlan,
} from '../src/lib/civic/echo';
import { loadEcho, createEchoReader } from '../src/lib/civic/echo-repository';

const at = '2026-09-16T00:00:00.000Z';
const plan: EchoPlan = {
  id: 'test-echo',
  title: 'Fixture',
  selection: 'Explicit test query',
  queries: [{ state: 'TX', city: 'Test City', naics: '325', active: 'Y' }],
  maxFacilities: 10,
};
const source = (url: string, results: unknown) => {
  const raw = JSON.stringify({ Results: results });
  return { url, raw, hash: hash(raw), fetchedAt: at };
};
function report(id = '110000000001', system = 'FRS'): any {
  return {
    Message: 'Success',
    RegistryID: id,
    MultipleFRSFacilities: {},
    Permits: [
      {
        EPASystem: system,
        SourceID: id,
        Statute: system === 'FRS' ? '' : 'RCRA',
        FacilityName: 'Fixture Chemicals',
        FacilityCity: 'Other linked address',
        FacilityState: 'TX',
        FacilityStreet: '1 Industrial Road',
        FacilityZip: '77501',
        Latitude: '29.7',
        Longitude: '-95.1',
        CollectDesc: 'Address matching',
        AccuracyValue: '50',
      },
    ],
    SystemExtractDates: { Dates: [{ EPASystem: 'ICIS-NPDES', SystemExtractDate: '09/11/2026' }] },
    ComplianceSummary: {
      ProgramDates: [{ Program: 'CWA', StartDate: '07/01/2023', EndDate: '06/30/2026' }],
      Source: [
        {
          Statute: 'CWA',
          SourceID: 'TX0000001',
          QtrsInNC: '4',
          CurrentSNC: 'Yes',
          CurrentAsOf: '06/30/2026',
        },
      ],
    },
    CWA3YrCompliance: {
      Header: {
        Qtr1Start: '07/01/2023',
        Qtr1End: '09/30/2023',
        Qtr2Start: '10/01/2023',
        Qtr2End: '12/31/2023',
        Qtr13Start: '07/01/2026',
        Qtr13End: '09/11/2026',
      },
      Sources: [
        {
          Status: [
            {
              SourceID: 'TX0000001',
              Qtr1Status: 'No Violation Identified',
              Qtr2Status: 'Significant/Category I Noncompliance',
              Qtr13Status: 'Undetermined',
            },
          ],
        },
      ],
    },
    ComplianceHistory: {
      ProgramDates: [{ Program: 'CWA', StartDate: '09/12/2016', EndDate: '06/30/2026' }],
      Inspection: [
        {
          Statute: 'CWA',
          SourceID: 'TX0000001',
          Date: '02/18/2025',
          InspectionType: 'Compliance inspection',
          LeadAgency: 'State',
          OfficialFlag: 'Y',
          Finding: null,
        },
      ],
    },
    Notices: {
      ProgramDates: [{ Program: 'CWA', StartDate: '09/12/2016', EndDate: '06/30/2026' }],
      Notice: [
        {
          Statute: 'CWA',
          SourceID: 'TX0000001',
          NoticeDate: '03/18/2025',
          ActionType: 'Written notice',
          LeadAgency: 'State',
          OfficialFlag: 'Y',
        },
      ],
    },
    FormalActions: {
      ProgramDates: [{ Program: 'CWA', StartDate: '09/12/2021', EndDate: '06/30/2026' }],
      Action: [
        {
          Statute: 'CWA',
          SourceID: 'TX0000001',
          ActionDate: '05/01/2025',
          ActionType: 'Administrative order',
          LeadAgency: 'State',
          PenaltyAmount: '$12,000.25',
        },
        {
          Statute: 'CWA',
          SourceID: 'TX0000002',
          ActionDate: '05/01/2025',
          ActionType: 'Administrative order',
          LeadAgency: 'State',
          PenaltyAmount: '$12,000.25',
        },
      ],
    },
    CaseFormalActions: {
      ProgramDates: [{ Program: 'CWA', StartDate: '09/12/2016', EndDate: '06/30/2026' }],
      Action: [
        {
          CaseID: '06-2025-0001',
          IssueDate: '01/01/0001',
          ActivityID: '123',
          Settlements: {
            Settlement: [{ SettlementDate: '05/01/2025', StateLocalPenalty: '$12,000.25' }],
          },
        },
      ],
    },
    ACS2024Demographics: { Unused: 'NOT IN THE PUBLIC PROJECTION' },
  };
}
function fixture(): any {
  return {
    formatVersion: 1,
    plan,
    observedAt: at,
    retainedIds: [],
    discoveries: [
      {
        query: 0,
        start: source(echoSearchUrl(plan.queries[0]), {
          Message: 'Success',
          QueryRows: '1',
          QueryID: '1',
        }),
        pages: [
          source(echoPageUrl('1', 1), {
            Message: 'Working',
            QueryRows: '1',
            QueryID: '1',
            PageNo: '1',
            Facilities: [{ RegistryID: '110000000001', FacName: 'Fixture Chemicals' }],
          }),
        ],
      },
    ],
    reports: [{ id: '110000000001', source: source(echoReportUrl('110000000001'), report()) }],
  };
}
function edit(sourceValue: any, change: (results: any) => void) {
  const body = JSON.parse(sourceValue.raw);
  change(body.Results);
  sourceValue.raw = JSON.stringify(body);
  sourceValue.hash = hash(sourceValue.raw);
}

test('EPA projection preserves actual identifiers, differing reporting periods, source statuses and duplicate action rows without summing penalties', () => {
  const { data, details } = buildEcho(fixture()),
    detail = details[0];
  assert.equal(data.facilities.length, 1);
  assert.equal(data.facilities[0].city, 'Other linked address');
  assert.equal(detail.periods.find((p) => p.section === 'FormalActions')?.from, '2021-09-12');
  assert.equal(detail.periods.find((p) => p.section === 'ComplianceHistory')?.from, '2016-09-12');
  assert.equal(detail.events.filter((e) => e.kind === 'formal').length, 2);
  assert.equal(detail.events[0].penaltyCents, 1200025);
  assert.ok(!('totalPenalties' in data.facilities[0]));
  assert.equal(detail.quarters[0].cells[2].additional, true);
  assert.equal(detail.quarters[0].cells[2].status, 'Undetermined');
  assert.ok(!JSON.stringify(detail).includes('NOT IN THE PUBLIC PROJECTION'));
  assert.equal(echoDate('01/01/0001'), null);
  assert.equal(echoMoney('$0'), 0);
  assert.equal(echoMoney(null), null);
  assert.throws(() => echoMoney('$1,2'));
  assert.equal(echoStatus('No Violation Identified'), 'none');
  assert.equal(echoStatus('Terminated Permit'), 'inactive');
  assert.equal(echoStatus(null), 'unknown');
  assert.equal(echoStatus('New agency code'), 'unknown');
  assert.equal(echoInvalidWindow('2026-02-30', ''), true);
  assert.equal(echoInvalidWindow('2026-99-01', '2026-12-31'), true);
  assert.equal(echoInvalidWindow('2026-06-01', '2026-05-31'), true);
  assert.equal(echoInvalidWindow('2024-02-29', ''), false);
});

test('EPA filtering counts repeated reported quarters per source without combining distinct statutes or making unknowns zero', () => {
  const { data, details } = buildEcho(fixture());
  assert.equal(filterEcho(data, new URLSearchParams('repeated=1&program=CWA')).length, 1);
  assert.equal(filterEcho(data, new URLSearchParams('repeated=1&program=CAA')).length, 0);
  assert.deepEqual(echoYearRows(details[0].events), [
    { year: '2025', inspection: 1, informal: 1, formal: 2 },
  ]);
  const input = fixture();
  edit(input.reports[0].source, (r) => (r.ComplianceSummary.Source[0].QtrsInNC = null));
  const unknown = buildEcho(input).data;
  assert.equal(unknown.facilities[0].programs[0].quartersInNC, null);
  assert.equal(filterEcho(unknown, new URLSearchParams('repeated=1')).length, 0);
});

test('program-only EPA identities remain explicitly labeled, and ambiguous/changed/corrupt sources fail closed', () => {
  const input = fixture(),
    id = 'CAC003402119';
  edit(input.discoveries[0].pages[0], (r) => (r.Facilities[0].RegistryID = id));
  input.reports = [{ id, source: source(echoReportUrl(id), report(id, 'RCRAInfo')) }];
  assert.equal(buildEcho(input).data.facilities[0].identitySystem, 'RCRAInfo');
  const corrupt = fixture();
  corrupt.reports[0].source.raw += ' ';
  assert.throws(() => buildEcho(corrupt), /hash mismatch/);
  const ambiguous = fixture();
  edit(ambiguous.reports[0].source, (r) => (r.MultipleFRSFacilities = { Facilities: [1, 2] }));
  assert.throws(() => buildEcho(ambiguous), /ambiguous/);
  const wrong = fixture();
  edit(wrong.reports[0].source, (r) => (r.RegistryID = '110000000002'));
  assert.throws(() => buildEcho(wrong), /mismatched/);
  const foreign = fixture();
  foreign.reports[0].source.url = 'https://example.com/';
  assert.throws(() => buildEcho(foreign), /URL/);
  const noId = fixture();
  edit(noId.reports[0].source, (r) => delete r.ComplianceSummary.Source[0].SourceID);
  assert.throws(() => buildEcho(noId), /Missing EPA summary source ID/);
});

test('EPA discovery requires complete pages, stable query counts and exact report coverage', () => {
  const missing = fixture();
  missing.discoveries[0].pages = [];
  assert.throws(() => buildEcho(missing), /incomplete/);
  const countChanged = fixture();
  edit(countChanged.discoveries[0].pages[0], (r) => (r.QueryRows = '2'));
  assert.throws(() => buildEcho(countChanged), /count mismatch/);
  const duplicate = fixture();
  edit(duplicate.discoveries[0].pages[0], (r) => r.Facilities.push(r.Facilities[0]));
  assert.throws(() => buildEcho(duplicate), /Duplicate/);
  const omitted = fixture();
  omitted.reports = [];
  assert.throws(() => buildEcho(omitted), /incomplete/);
  const httpError = fixture();
  edit(httpError.reports[0].source, (r) => (r.Error = { ErrorMessage: 'no data' }));
  assert.throws(() => buildEcho(httpError), /EPA source error/);
});

test('EPA acquisition uses complete explicit queries, archives receipts, and refreshes previously discovered records outside the new query', async () => {
  const f = fixture(),
    workspace = await mkdtemp(join(tmpdir(), 'ltw-echo-')),
    urls: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    urls.push(String(url));
    const sources = [f.discoveries[0].start, ...f.discoveries[0].pages, f.reports[0].source],
      found = sources.find((s) => s.url === String(url));
    return new Response(found?.raw ?? 'missing', { status: found ? 200 : 404 });
  }) as typeof fetch;
  const first = await acquireEcho(plan, workspace, null, fetcher);
  assert.equal(buildEcho(first).data.facilities.length, 1);
  assert.equal(urls.length, 3);
  const previous = buildEcho(f).data;
  edit(f.discoveries[0].start, (r) => (r.QueryRows = '0'));
  urls.length = 0;
  const retained = await acquireEcho(plan, workspace, previous, fetcher),
    projection = buildEcho(retained, previous);
  assert.deepEqual(projection.data.changes.outsideDiscovery, ['110000000001']);
  assert.equal(projection.data.facilities[0].retained, true);
  assert.equal(urls.length, 2);
});

test('EPA portable jobs replay exactly and failed captures cannot replace the published snapshot', async () => {
  const f = fixture(),
    { data } = buildEcho(f);
  assert.deepEqual(buildEcho(f, data).data, data);
  const changed = fixture();
  edit(changed.reports[0].source, (r) => (r.Permits[0].FacilityName = 'Changed source name'));
  assert.throws(() => buildEcho(changed, data), /same capture/);
  changed.observedAt = '2026-09-17T00:00:00.000Z';
  assert.deepEqual(buildEcho(changed, data).data.changes.updated, ['110000000001']);
  const workspace = await mkdtemp(join(tmpdir(), 'ltw-echo-publish-')),
    output = join(workspace, 'public');
  const a = await runEcho({ input: f, workspace, output, offline: true }),
    b = await runEcho({ input: f, workspace, output, offline: true });
  assert.equal(a.release, b.release);
  const before = await readFile(join(output, 'manifest.json'), 'utf8');
  f.reports = [];
  await assert.rejects(() => runEcho({ input: f, workspace, output, offline: true }));
  assert.equal(await readFile(join(output, 'manifest.json'), 'utf8'), before);
});

test('EPA browser evidence verifies lazy files, retries corruption, checks index identity and honors aborts', async () => {
  const { data, details } = buildEcho(fixture()),
    detail = details[0];
  const manifest = {
    formatVersion: 1,
    release: `ep-${hash(data).slice(0, 24)}`,
    dataHash: hash(data),
    publishedAt: at,
    files: { 'facilities/110000000001.json': hash(detail) },
  };
  const requests: string[] = [];
  let corrupt = false;
  const fetcher = (async (url: unknown) => {
    const path = String(url);
    requests.push(path);
    return Response.json(
      path.endsWith('manifest.json')
        ? manifest
        : path.endsWith('data.json')
          ? data
          : corrupt
            ? { ...detail, events: [] }
            : detail,
    );
  }) as typeof fetch;
  const bundle = await loadEcho(fetcher, '/test');
  assert.equal(requests.length, 2);
  const reader = createEchoReader(fetcher, '/test');
  corrupt = true;
  await assert.rejects(() => reader(bundle, detail.facility.id), /integrity/);
  corrupt = false;
  assert.deepEqual(await reader(bundle, detail.facility.id), detail);
  const count = requests.length;
  await reader(bundle, detail.facility.id);
  assert.equal(requests.length, count);
  await assert.rejects(() => reader(bundle, '110000000002'), /outside/);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(() => reader(bundle, detail.facility.id, aborted.signal), {
    name: 'AbortError',
  });
  const mismatch = structuredClone(bundle);
  mismatch.data.facilities[0].name = 'Other name';
  await assert.rejects(() => createEchoReader(fetcher)(mismatch, detail.facility.id), /mismatch/);
  const missing = structuredClone(manifest);
  missing.files = {} as typeof manifest.files;
  await assert.rejects(
    () =>
      loadEcho((async (url: unknown) =>
        Response.json(String(url).endsWith('manifest.json') ? missing : data)) as typeof fetch),
    /reference missing/,
  );
});

test('failed EPA collection waits for its other worker and never publishes a partial acquisition', async () => {
  const f = fixture(),
    workspace = await mkdtemp(join(tmpdir(), 'ltw-echo-workers-'));
  edit(f.discoveries[0].start, (r) => (r.QueryRows = '3'));
  edit(f.discoveries[0].pages[0], (r) => {
    r.QueryRows = '3';
    r.Facilities = ['110000000001', '110000000002', '110000000003'].map((RegistryID) => ({
      RegistryID,
    }));
  });
  let releaseSecond!: () => void, startSecond!: () => void;
  const secondStarted = new Promise<void>((resolve) => (startSecond = resolve)),
    holdSecond = new Promise<void>((resolve) => (releaseSecond = resolve));
  const urls: string[] = [];
  const fetcher = (async (url: unknown) => {
    const path = String(url);
    urls.push(path);
    if (path === f.discoveries[0].start.url) return new Response(f.discoveries[0].start.raw);
    if (path === f.discoveries[0].pages[0].url) return new Response(f.discoveries[0].pages[0].raw);
    if (path === echoReportUrl('110000000001')) {
      await secondStarted;
      return new Response('failure', { status: 503 });
    }
    startSecond();
    await holdSecond;
    return Response.json({ Results: report('110000000002') });
  }) as typeof fetch;
  let settled = false;
  const attempt = acquireEcho(plan, workspace, null, fetcher).finally(() => (settled = true));
  const rejected = assert.rejects(attempt, /503/);
  await secondStarted;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  releaseSecond();
  await rejected;
  assert.ok(!urls.includes(echoReportUrl('110000000003')));
  await assert.rejects(() => readFile(join(workspace, 'acquisition.json'), 'utf8'), {
    code: 'ENOENT',
  });
});
