import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from '../said-did/engine';
import { writeAtomic, withLock } from '../said-did/pipeline';
import { publishSnapshot } from './snapshots';
import {
  echoPlanSchema,
  echoDataSchema,
  echoDetailSchema,
  registryIdSchema,
  type EchoPlan,
  type EchoQuery,
  type EchoData,
  type EchoDetail,
  type EchoEvent,
} from '../../src/lib/civic/echo';

const host = 'https://echodata.epa.gov/echo/';
const sourceSchema = z.object({
  url: z.string().url(),
  raw: z.string(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  fetchedAt: z.string().datetime(),
});
export const echoInputSchema = z.object({
  formatVersion: z.literal(1),
  plan: echoPlanSchema,
  observedAt: z.string().datetime(),
  retainedIds: z.array(registryIdSchema),
  discoveries: z.array(
    z.object({
      query: z.number().int().nonnegative(),
      start: sourceSchema,
      pages: z.array(sourceSchema),
    }),
  ),
  reports: z.array(z.object({ id: registryIdSchema, source: sourceSchema })),
});
type Input = z.infer<typeof echoInputSchema>;
type Source = z.infer<typeof sourceSchema>;
type Row = Record<string, any>;
export function echoSearchUrl(q: EchoQuery) {
  const u = new URL('echo_rest_services.get_facilities', host);
  u.search = new URLSearchParams({
    output: 'JSON',
    p_st: q.state,
    p_ct: q.city,
    p_ncs: q.naics,
    p_act: q.active,
    responseset: '1000',
  }).toString();
  return u.href;
}
export function echoPageUrl(qid: string, page: number) {
  if (!/^\d+$/.test(qid)) throw new Error('Invalid EPA query ID');
  return `${host}echo_rest_services.get_qid?${new URLSearchParams({ output: 'JSON', qid, pageno: String(page) })}`;
}
export function echoReportUrl(id: string) {
  registryIdSchema.parse(id);
  return `${host}dfr_rest_services.get_dfr?output=JSON&p_id=${id}&p_gt5yr=Y`;
}
function decoded(source: Source, expected: string) {
  if (source.url !== expected || hash(source.raw) !== source.hash)
    throw new Error('EPA source URL/hash mismatch');
  const result = JSON.parse(source.raw).Results;
  if (
    !result ||
    result.Error ||
    !['Success', 'Working', 'No Data Found', 'No Data'].includes(result.Message)
  )
    throw new Error(
      `EPA source error: ${result?.Error?.ErrorMessage ?? result?.Message ?? 'missing result'}`,
    );
  return result as Row;
}
function rows(value: unknown, name: string): Row[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => !v || typeof v !== 'object' || Array.isArray(v)))
    throw new Error(`Invalid EPA ${name} rows`);
  return value;
}
function text(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error('Invalid EPA text');
  return value;
}
function requiredText(value: unknown, field: string): string {
  const result = text(value);
  if (!result?.trim()) throw new Error(`Missing EPA ${field}`);
  return result;
}
function integer(value: unknown): number | null {
  const s = text(value);
  if (s === null) return null;
  if (!/^\d+$/.test(s)) throw new Error('Invalid EPA count');
  return Number(s);
}
export function echoDate(value: unknown): string | null {
  const s = text(value);
  if (!s || ['01/01/0001', '00/00/0000'].includes(s)) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!match) throw new Error(`Invalid EPA date ${s}`);
  return z.string().date().parse(`${match[3]}-${match[1]}-${match[2]}`);
}
export function echoMoney(value: unknown): number | null {
  const s = text(value);
  if (s === null) return null;
  if (!/^\$?\d+(?:,\d{3})*(?:\.\d{1,2})?$/.test(s)) throw new Error(`Invalid EPA money ${s}`);
  const [a, b = ''] = s.replace(/[$,]/g, '').split('.'),
    n = Number(a) * 100 + Number(b.padEnd(2, '0'));
  if (!Number.isSafeInteger(n)) throw new Error('Unsafe EPA money');
  return n;
}
function coordinate(value: unknown) {
  const s = text(value);
  if (s === null) return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) throw new Error('Invalid EPA coordinate');
  return Number(s);
}
export const echoEvidenceSections = [
  'Permits',
  'ComplianceSummary',
  'InspectionEnforcementSummary',
  'EnforcementComplianceSummaries',
  'AirCompliance',
  'RCRACompliance',
  'CWA3YrCompliance',
  'CWARNCCompliance',
  'CWAEffluentComplianceEXP',
  'CWAPSCompliance',
  'CWASECompliance',
  'CWACSCompliance',
  'SDWISCompliance',
  'ComplianceHistory',
  'Notices',
  'FormalActions',
  'CaseFormalActions',
  'ICISFormalActions',
  'SystemExtractDates',
] as const;
function discoveryRecords(input: Input) {
  if (
    input.discoveries.length !== input.plan.queries.length ||
    new Set(input.discoveries.map((d) => d.query)).size !== input.discoveries.length
  )
    throw new Error('EPA discovery queries incomplete');
  const members = new Map<string, number[]>(),
    discoveries: EchoData['discoveries'] = [];
  for (let index = 0; index < input.plan.queries.length; index++) {
    const discovery = input.discoveries.find((d) => d.query === index)!;
    if (!discovery) throw new Error('EPA query missing');
    const q = input.plan.queries[index],
      start = decoded(discovery.start, echoSearchUrl(q)),
      total = integer(start.QueryRows);
    if (total === null || total > input.plan.maxFacilities)
      throw new Error('EPA discovery count missing or exceeds collection limit');
    const qid = String(start.QueryID ?? ''),
      seen = new Set<string>();
    if (discovery.pages.length !== Math.ceil(total / 1000))
      throw new Error('EPA result pages incomplete');
    discovery.pages.forEach((source, i) => {
      const page = decoded(source, echoPageUrl(qid, i + 1));
      if (
        String(page.QueryID) !== qid ||
        integer(page.QueryRows) !== total ||
        integer(page.PageNo) !== i + 1
      )
        throw new Error('EPA discovery page identity/count mismatch');
      for (const row of rows(page.Facilities, 'facility search')) {
        const id = registryIdSchema.parse(row.RegistryID);
        if (seen.has(id)) throw new Error('Duplicate EPA discovery facility');
        seen.add(id);
        const matched = members.get(id) ?? [];
        matched.push(index);
        members.set(id, matched);
      }
    });
    if (seen.size !== total) throw new Error('EPA discovery collection incomplete');
    discoveries.push({
      query: q,
      rows: total,
      sourceHash: discovery.start.hash,
      pageHashes: discovery.pages.map((p) => p.hash),
    });
  }
  return { members, discoveries };
}
export function projectEchoReport(
  id: string,
  source: Source,
  matches: number[],
  retained: boolean,
): EchoDetail {
  const r = decoded(source, echoReportUrl(id));
  if (
    String(r.RegistryID) !== id ||
    (r.MultipleFRSFacilities && Object.keys(r.MultipleFRSFacilities).length)
  )
    throw new Error('EPA facility identity is ambiguous or mismatched');
  const permits = rows(r.Permits, 'permits'),
    frs = permits.filter((p) => p.EPASystem === 'FRS' && p.SourceID === id);
  const identified = frs.length ? frs : permits.filter((p) => p.SourceID === id);
  if (identified.length !== 1)
    throw new Error('EPA facility missing an unambiguous exact identity record');
  const f = identified[0],
    programs = rows(r.ComplianceSummary?.Source, 'compliance summary').map((p) => ({
      program: requiredText(p.Statute, 'summary statute'),
      sourceId: requiredText(p.SourceID, 'summary source ID'),
      quartersInNC: integer(p.QtrsInNC),
      currentSNC: text(p.CurrentSNC),
      asOf: echoDate(p.CurrentAsOf),
    }));
  if (new Set(programs.map((p) => `${p.program}/${p.sourceId}`)).size !== programs.length)
    throw new Error('Duplicate EPA program summary');
  const periods: EchoDetail['periods'] = [];
  for (const section of [
    'ComplianceSummary',
    'ComplianceHistory',
    'Notices',
    'FormalActions',
    'CaseFormalActions',
    'InspectionEnforcementSummary',
  ])
    for (const p of rows(r[section]?.ProgramDates, `${section} periods`))
      periods.push({
        section,
        program: requiredText(p.Program, 'period program'),
        from: echoDate(p.StartDate),
        through: echoDate(p.EndDate),
      });
  const quarters: EchoDetail['quarters'] = [];
  for (const [section, program, field] of [
    ['AirCompliance', 'CAA', 'PermitHistory'],
    ['RCRACompliance', 'RCRA', 'Status'],
    ['CWA3YrCompliance', 'CWA', 'Status'],
    ['SDWISCompliance', 'SDWA', 'Status'],
  ] as const) {
    const sourceData = r[section] ?? {},
      header = sourceData.Header ?? sourceData;
    for (const group of rows(sourceData.Sources, `${section} sources`)) {
      const statuses = Array.isArray(group[field])
        ? rows(group[field], `${section} status`)
        : group[field]
          ? [group[field]]
          : [];
      for (const row of statuses) {
        const cells: EchoDetail['quarters'][number]['cells'] = [];
        for (let i = 1; i <= 13; i++) {
          const from = echoDate(header[`Qtr${i}Start`]),
            through = echoDate(header[`Qtr${i}End`]);
          if (!from && !through) continue;
          if (!from || !through || from > through) throw new Error('EPA quarter boundary mismatch');
          cells.push({
            ordinal: i,
            from,
            through,
            status: text(row[`Qtr${i}Status`]),
            additional: i === 13,
          });
        }
        quarters.push({
          program,
          sourceId: requiredText(row.SourceID, 'quarter source ID'),
          cells,
        });
      }
    }
  }
  if (new Set(quarters.map((q) => `${q.program}/${q.sourceId}`)).size !== quarters.length)
    throw new Error('Duplicate EPA quarter series');
  const events: EchoEvent[] = [];
  for (const [section, key, kind, dateKey, typeKey] of [
    ['ComplianceHistory', 'Inspection', 'inspection', 'Date', 'InspectionType'],
    ['Notices', 'Notice', 'informal', 'NoticeDate', 'ActionType'],
    ['FormalActions', 'Action', 'formal', 'ActionDate', 'ActionType'],
  ] as const) {
    rows(r[section]?.[key], section).forEach((row, index) =>
      events.push({
        id: `${kind}-${hash({ row, index }).slice(0, 20)}`,
        kind,
        program: text(row.Statute) ?? '',
        sourceId: text(row.SourceID) ?? '',
        date: echoDate(row[dateKey]),
        type: text(row[typeKey]) ?? 'Type not reported',
        agency: text(row.LeadAgency),
        penaltyCents: kind === 'formal' ? echoMoney(row.PenaltyAmount) : null,
        penaltyReported: kind === 'formal' ? text(row.PenaltyAmount) : null,
        official: text(row.OfficialFlag),
        finding: text(row.Finding),
        locator: `${section}.${key}[${index}]`,
        fields: row,
      }),
    );
  }
  events.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id));
  const evidence = Object.fromEntries(
    echoEvidenceSections.map((section) => [section, r[section] ?? {}]),
  );
  const lat = coordinate(f.Latitude),
    lon = coordinate(f.Longitude);
  return echoDetailSchema.parse({
    facility: {
      id,
      identitySystem: requiredText(f.EPASystem, 'identity system'),
      name: text(f.FacilityName) ?? 'Name not reported',
      city: text(f.FacilityCity) ?? '',
      state: text(f.FacilityState) ?? '',
      street: text(f.FacilityStreet) ?? '',
      zip: text(f.FacilityZip) ?? '',
      lat: lat === null || lon === null || (!lat && !lon) ? null : lat,
      lon: lat === null || lon === null || (!lat && !lon) ? null : lon,
      coordinateMethod: text(f.CollectDesc),
      coordinateAccuracy: text(f.AccuracyValue),
      queryMatches: matches,
      retained,
      programs,
      inspectionRows: events.filter((e) => e.kind === 'inspection').length,
      informalRows: events.filter((e) => e.kind === 'informal').length,
      formalRows: events.filter((e) => e.kind === 'formal').length,
      latestEvent: events.find((e) => e.date)?.date ?? null,
      recordHash: hash(evidence),
    },
    source: { url: source.url, hash: source.hash, fetchedAt: source.fetchedAt },
    extractDates: rows(r.SystemExtractDates?.Dates, 'extract dates').map((row) => ({
      system: requiredText(row.EPASystem, 'extract system'),
      date: echoDate(row.SystemExtractDate),
    })),
    periods,
    quarters,
    events,
    evidence,
  });
}
export function buildEcho(value: unknown, previous: EchoData | null = null) {
  const input = echoInputSchema.parse(value);
  if (
    previous &&
    (hash(previous.plan) !== hash(input.plan) || previous.observedAt > input.observedAt)
  )
    throw new Error('EPA changed scope or stale capture');
  const { members, discoveries } = discoveryRecords(input),
    ids = new Set([...members.keys(), ...input.retainedIds]);
  if (
    new Set(input.retainedIds).size !== input.retainedIds.length ||
    ids.size > input.plan.maxFacilities ||
    input.reports.length !== ids.size ||
    new Set(input.reports.map((r) => r.id)).size !== ids.size ||
    input.reports.some((r) => !ids.has(r.id))
  )
    throw new Error('EPA report collection incomplete or out of scope');
  if (previous && previous.facilities.some((f) => !ids.has(f.id)))
    throw new Error('Prior EPA facility must be refreshed, not silently dropped');
  const details = input.reports
    .map((r) => projectEchoReport(r.id, r.source, members.get(r.id) ?? [], !members.has(r.id)))
    .sort((a, b) => a.facility.id.localeCompare(b.facility.id));
  const old = new Map(previous?.facilities.map((f) => [f.id, f.recordHash]) ?? []);
  const data = echoDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'epa-echo-v1',
    plan: input.plan,
    observedAt: input.observedAt,
    discoveries,
    facilities: details.map((d) => d.facility),
    changes: {
      baselineAt: previous?.observedAt ?? null,
      added: details.filter((d) => !old.has(d.facility.id)).map((d) => d.facility.id),
      updated: details
        .filter((d) => old.has(d.facility.id) && old.get(d.facility.id) !== d.facility.recordHash)
        .map((d) => d.facility.id),
      outsideDiscovery: details.filter((d) => d.facility.retained).map((d) => d.facility.id),
    },
  });
  if (previous?.observedAt === input.observedAt) {
    if (
      hash(previous.facilities) !== hash(data.facilities) ||
      hash(previous.discoveries) !== hash(data.discoveries)
    )
      throw new Error('EPA evidence changed at same capture');
    data.changes = previous.changes;
  }
  return { data, details };
}
async function download(url: string, workspace: string, fetcher: typeof fetch): Promise<Source> {
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(60000) });
  if (response.status !== 200 || !response.body)
    throw new Error(`EPA download failed: ${response.status}`);
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 20_000_000) throw new Error('EPA response exceeds 20 MB');
      chunks.push(value);
    }
  } catch (e) {
    await reader.cancel();
    throw e;
  }
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
    source = { url, raw, hash: hash(raw), fetchedAt: new Date().toISOString() };
  await writeAtomic(join(workspace, 'raw', `${source.hash}.json`), source);
  return source;
}
export async function acquireEcho(
  plan: EchoPlan,
  workspace: string,
  previous: EchoData | null = null,
  fetcher: typeof fetch = fetch,
): Promise<Input> {
  const input: Input = {
    formatVersion: 1,
    plan,
    observedAt: new Date().toISOString(),
    retainedIds: previous?.facilities.map((f) => f.id) ?? [],
    discoveries: [],
    reports: [],
  };
  for (let index = 0; index < plan.queries.length; index++) {
    const query = plan.queries[index],
      start = await download(echoSearchUrl(query), workspace, fetcher),
      result = decoded(start, echoSearchUrl(query)),
      total = integer(result.QueryRows);
    if (total === null || total > plan.maxFacilities)
      throw new Error('EPA query exceeds collection limit; narrow the explicit scope');
    const pages: Source[] = [];
    for (let page = 1; page <= Math.ceil(total / 1000); page++)
      pages.push(await download(echoPageUrl(String(result.QueryID), page), workspace, fetcher));
    input.discoveries.push({ query: index, start, pages });
  }
  const ids = [
    ...new Set([...discoveryRecords(input).members.keys(), ...input.retainedIds]),
  ].sort();
  if (ids.length > plan.maxFacilities) throw new Error('EPA combined collection exceeds limit');
  let cursor = 0;
  let failed = false;
  const workers = await Promise.allSettled(
    Array.from({ length: 2 }, async () => {
      try {
        while (!failed && cursor < ids.length) {
          const id = ids[cursor++],
            source = await download(echoReportUrl(id), workspace, fetcher);
          input.reports.push({ id, source });
        }
      } catch (error) {
        failed = true;
        throw error;
      }
    }),
  );
  // Keep the workspace lock until every in-flight archive write has settled.
  const rejected = workers.find((worker) => worker.status === 'rejected');
  if (rejected?.status === 'rejected') throw rejected.reason;
  input.reports.sort((a, b) => a.id.localeCompare(b.id));
  await writeAtomic(join(workspace, 'acquisition.json'), input);
  return input;
}
export async function runEcho(options: {
  input?: unknown;
  plan?: unknown;
  workspace: string;
  output: string;
  offline?: boolean;
  fetcher?: typeof fetch;
}) {
  return withLock(options.workspace, async () => {
    let previous: EchoData | null = null,
      expected: string | null = null;
    try {
      const manifest = JSON.parse(await readFile(join(options.output, 'manifest.json'), 'utf8'));
      if (!/^ep-[a-f0-9]{24}$/.test(manifest.release)) throw new Error('Invalid EPA release');
      expected = manifest.release;
      const raw = JSON.parse(
        await readFile(join(options.output, 'releases', manifest.release, 'data.json'), 'utf8'),
      );
      if (hash(raw) !== manifest.dataHash || expected !== `ep-${hash(raw).slice(0, 24)}`)
        throw new Error('EPA prior release hash mismatch');
      previous = echoDataSchema.parse(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || expected) throw e;
    }
    let input = options.input;
    if (input === undefined) {
      const plan = echoPlanSchema.parse(options.plan);
      if (options.offline) {
        input = JSON.parse(await readFile(join(options.workspace, 'acquisition.json'), 'utf8'));
        if (hash(echoInputSchema.parse(input).plan) !== hash(plan))
          throw new Error('Offline EPA plan mismatch');
      } else input = await acquireEcho(plan, options.workspace, previous, options.fetcher);
    }
    const { data, details } = buildEcho(input, previous);
    await writeAtomic(join(options.workspace, 'input.json'), input);
    const manifest = await publishSnapshot(
      data,
      options.output,
      'ep',
      expected,
      Object.fromEntries(details.map((d) => [`facilities/${d.facility.id.toLowerCase()}.json`, d])),
    );
    return {
      release: manifest.release,
      dataHash: manifest.dataHash,
      facilities: data.facilities.length,
      discoveryRows: data.discoveries.map((d) => d.rows),
      events: details.reduce((n, d) => n + d.events.length, 0),
      quarters: details.reduce((n, d) => n + d.quarters.length, 0),
      outsideDiscovery: data.changes.outsideDiscovery,
    };
  });
}
