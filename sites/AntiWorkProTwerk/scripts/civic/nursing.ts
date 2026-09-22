import { z } from 'zod';
import { parse } from 'csv-parse';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { hash } from '../said-did/engine';
import { withLock, writeAtomic } from '../said-did/pipeline';
import { publishSnapshot } from './snapshots';
import { nursingAttachments } from '../../src/lib/civic/nursing-index';
import {
  nursingPlanSchema,
  nursingSourceSchema,
  nursingSourceKinds,
  nursingDataSchema,
  nursingDetailSchema,
  ownershipRole,
  type NursingPlan,
  type NursingSource,
  type NursingData,
  type NursingDetail,
  type NursingParty,
} from '../../src/lib/civic/nursing';

const catalogUrl = 'https://data.cms.gov/data.json';
const pdc = { providers: '4pq5-n9py', intervals: 'qmdc-9999', penalties: 'g6vv-u9sr' } as const;
const titles = {
  owners: 'Skilled Nursing Facility All Owners',
  enrollments: 'Skilled Nursing Facility Enrollments',
} as const;
export const nursingMetadataUrls = [
  catalogUrl,
  ...Object.values(pdc).map(
    (id) => `https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items/${id}`,
  ),
];
const record = z.object({
  url: z.string().url(),
  raw: z.string(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const nursingInputSchema = z.object({
  formatVersion: z.literal(1),
  plan: nursingPlanSchema,
  observedAt: z.string().datetime(),
  metadata: z.array(record).length(4),
  files: z
    .array(
      z.object({
        url: z.string().url(),
        bytesBase64: z.string(),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
        encoding: z.enum(['utf-8', 'windows-1252']),
        kind: z.enum(nursingSourceKinds),
      }),
    )
    .length(5),
});
type Input = z.infer<typeof nursingInputSchema>;
type Row = Record<string, string>;
export function cmsFixedId(text: string, length: number, letters = false) {
  if (new RegExp(`^[0-9]{1,${length}}$`).test(text)) return text.padStart(length, '0');
  if (letters && new RegExp(`^[A-Z0-9]{${length}}$`).test(text)) return text;
  throw new Error(`Invalid fixed-width CMS identifier: ${text}`);
}
function officialFile(url: string) {
  const u = new URL(url);
  if (
    u.protocol !== 'https:' ||
    u.hostname !== 'data.cms.gov' ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    (!u.pathname.startsWith('/sites/default/files/') &&
      !u.pathname.startsWith('/provider-data/sites/default/files/')) ||
    !u.pathname.endsWith('.csv')
  )
    throw new Error('Invalid CMS CSV URL');
  return url;
}
export function nursingResources(metadata: Input['metadata']) {
  const docs = new Map<string, any>();
  for (const m of metadata) {
    if (!nursingMetadataUrls.includes(m.url) || docs.has(m.url) || hash(m.raw) !== m.hash)
      throw new Error('Invalid CMS metadata provenance');
    docs.set(m.url, JSON.parse(m.raw));
  }
  if (docs.size !== 4) throw new Error('Incomplete CMS metadata');
  const resources: Omit<NursingSource, 'hash' | 'bytes' | 'rows'>[] = [];
  for (const kind of ['enrollments', 'owners'] as const) {
    const matches = docs.get(catalogUrl).dataset.filter((d: any) => d.title === titles[kind]);
    if (matches.length !== 1) throw new Error('Ambiguous CMS catalog dataset');
    const rows = matches[0].distribution
      .filter((d: any) => d.mediaType === 'text/csv' && d.downloadURL && d.temporal)
      .sort((a: any, b: any) => b.temporal.localeCompare(a.temporal));
    if (!rows.length || rows[1]?.temporal === rows[0].temporal)
      throw new Error('Ambiguous latest CMS release');
    const d = rows[0];
    resources.push({
      kind,
      url: officialFile(d.downloadURL),
      metadataUrl: catalogUrl,
      title: d.title,
      modified: d.modified,
      period: d.temporal,
      released: d.modified,
    });
  }
  if (resources[0].period !== resources[1].period)
    throw new Error('Enrollment and owner releases have different source periods');
  for (const kind of ['providers', 'intervals', 'penalties'] as const) {
    const metadataUrl = `https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items/${pdc[kind]}`,
      d = docs.get(metadataUrl);
    if (d.identifier !== pdc[kind]) throw new Error('Provider catalog identity mismatch');
    const choices = d.distribution.filter((r: any) => r.mediaType === 'text/csv');
    if (choices.length !== 1) throw new Error('Ambiguous provider CSV');
    resources.push({
      kind,
      url: officialFile(choices[0].downloadURL),
      metadataUrl,
      title: d.title,
      modified: d.modified,
      period: d.modified,
      released: d.released,
    });
  }
  if (
    new Set(
      resources
        .filter((r) => r.kind !== 'owners' && r.kind !== 'enrollments')
        .map((r) => r.modified),
    ).size !== 1
  )
    throw new Error('Provider, penalty and measurement-period releases do not align');
  return resources;
}
function value(row: Row, field: string) {
  if (!(field in row)) throw new Error(`Missing CMS column: ${field}`);
  return row[field];
}
function number(row: Row, field: string) {
  const text = value(row, field).trim();
  if (text === '') return null;
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`Invalid numeric value in ${field}: ${text}`);
  const n = Number(text);
  if (!Number.isFinite(n)) throw new Error('Nonfinite CMS number');
  return n;
}
function money(row: Row, field: string) {
  const text = value(row, field).trim();
  if (!text) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Invalid CMS currency');
  const [whole, fraction = ''] = text.split('.'),
    cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error('Unsafe CMS currency');
  return cents;
}
function date(text: string) {
  if (!text.trim()) return null;
  let normalized = text;
  if (/^\d{8}$/.test(text)) normalized = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}`;
  else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
    const [month, day, year] = text.split('/');
    normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  if (!z.string().date().safeParse(normalized).success)
    throw new Error(`Invalid CMS date: ${text}`);
  return normalized;
}
function sourceEncoding(bytes: Uint8Array): 'utf-8' | 'windows-1252' {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return 'utf-8';
  } catch {
    return 'windows-1252';
  }
}
async function csv(raw: string, visit: (row: Row, n: number) => void) {
  let n = 0;
  const parser = Readable.from([raw]).pipe(
    parse({
      bom: true,
      columns: (headers: string[]) => {
        if (new Set(headers).size !== headers.length) throw new Error('Duplicate CMS CSV headers');
        return headers;
      },
      skip_empty_lines: true,
    }),
  );
  for await (const row of parser) {
    n++;
    visit(row, n);
  }
  if (!n) throw new Error('Empty CMS CSV');
  return n;
}
export async function buildNursing(valueInput: unknown, previous: NursingData | null = null) {
  const input = nursingInputSchema.parse(valueInput),
    resources = nursingResources(input.metadata),
    files = new Map(input.files.map((f) => [f.kind, f]));
  if (files.size !== 5) throw new Error('Duplicate or missing CMS files');
  if (
    previous &&
    (hash(previous.plan) !== hash(input.plan) || previous.observedAt > input.observedAt)
  )
    throw new Error('Changed nursing scope or stale capture');
  const sources: NursingSource[] = resources.map((r) => {
    const f = files.get(r.kind)!;
    const bytes = Buffer.from(f.bytesBase64, 'base64');
    if (
      f.url !== r.url ||
      f.hash !== createHash('sha256').update(bytes).digest('hex') ||
      bytes.toString('base64') !== f.bytesBase64
    )
      throw new Error('CMS source hash or URL mismatch');
    if (f.encoding !== sourceEncoding(bytes)) throw new Error('CMS source encoding mismatch');
    return nursingSourceSchema.parse({ ...r, hash: f.hash, bytes: bytes.length, rows: 0 });
  });
  async function rows(kind: NursingSource['kind'], fn: (r: Row, n: number) => void) {
    const f = files.get(kind)!;
    const raw = new TextDecoder(f.encoding, { fatal: true, ignoreBOM: true }).decode(
      Buffer.from(f.bytesBase64, 'base64'),
    );
    sources.find((s) => s.kind === kind)!.rows = await csv(raw, fn);
  }
  const facilities = new Map<string, NursingDetail>(),
    seenProviders = new Set<string>();
  await rows('providers', (r, n) => {
    const id = cmsFixedId(value(r, 'CMS Certification Number (CCN)'), 6, true);
    if (seenProviders.has(id)) throw new Error('Duplicate CMS facility CCN');
    seenProviders.add(id);
    if (!input.plan.states.includes(value(r, 'State'))) return;
    const lat = numberCoordinate(value(r, 'Latitude')),
      lon = numberCoordinate(value(r, 'Longitude'));
    const footnotes = Object.fromEntries(Object.entries(r).filter(([k]) => /Footnote$/i.test(k)));
    const item: NursingDetail = {
      facility: {
        id,
        name: value(r, 'Provider Name'),
        legalName: value(r, 'Legal Business Name'),
        state: r.State,
        city: value(r, 'City/Town'),
        lat: lat === null || lon === null || (lat === 0 && lon === 0) ? null : lat,
        lon: lat === null || lon === null || (lat === 0 && lon === 0) ? null : lon,
        overall: number(r, 'Overall Rating'),
        health: number(r, 'Health Inspection Rating'),
        staffing: number(r, 'Staffing Rating'),
        beds: number(r, 'Number of Certified Beds'),
        rnHours: number(r, 'Reported RN Staffing Hours per Resident per Day'),
        totalHours: number(r, 'Reported Total Nurse Staffing Hours per Resident per Day'),
        deficiencies: number(r, 'Rating Cycle 1 Total Number of Health Deficiencies'),
        finesCents: money(r, 'Total Amount of Fines in Dollars'),
        penalties: number(r, 'Total Number of Penalties'),
        ownerCount: 0,
        enrollmentCount: 0,
        recordHash: hash(r),
      },
      providerRow: n,
      providerRowHash: hash(r),
      processingDate: date(value(r, 'Processing Date'))!,
      address: value(r, 'Provider Address'),
      zip: value(r, 'ZIP Code'),
      changedOwnership: value(r, 'Provider Changed Ownership in Last 12 Months'),
      geocodingFootnote: value(r, 'Geocoding Footnote'),
      footnotes,
      surveyDate: date(value(r, 'Rating Cycle 1 Standard Survey Health Date')),
      priorSurveyDate: date(value(r, 'Rating Cycle 2 Standard Health Survey Date')),
      priorDeficiencies: number(r, 'Rating Cycle 2/3 Total Number of Health Deficiencies'),
      enrollments: [],
      associations: [],
      penalties: [],
    };
    if (item.processingDate !== resources.find((s) => s.kind === 'providers')!.modified)
      throw new Error('Provider row belongs to a different release');
    facilities.set(id, item);
  });
  if (!facilities.size || facilities.size > input.plan.maxFacilities)
    throw new Error('Empty or oversized nursing collection');
  const enrollments = new Map<string, { ccn: string; associate: string }>(),
    unjoined = new Set<string>();
  const unresolvedEnrollments: NursingData['coverage']['unresolvedEnrollments'] = [];
  let selectedEnrollments = 0,
    selectedAssociations = 0,
    ownerRowsWithoutEnrollment = 0;
  await rows('enrollments', (r, n) => {
    const id = value(r, 'ENROLLMENT ID'),
      associate = cmsFixedId(value(r, 'ASSOCIATE ID'), 10);
    let ccn = '';
    try {
      ccn = cmsFixedId(value(r, 'CCN'), 6, true);
    } catch {
      unresolvedEnrollments.push({
        id,
        ccn: value(r, 'CCN'),
        reason: 'Not a supported six-character CCN; no facility join attempted.',
      });
    }
    if (enrollments.has(id)) throw new Error('Duplicate enrollment ID');
    enrollments.set(id, { ccn, associate });
    const f = facilities.get(ccn);
    if (!f) {
      if (input.plan.states.includes(value(r, 'STATE'))) unjoined.add(ccn || value(r, 'CCN'));
      return;
    }
    selectedEnrollments++;
    f.enrollments.push({
      id,
      ccn,
      associateId: associate,
      legalName: value(r, 'ORGANIZATION NAME'),
      sourceRow: n,
      rowHash: hash(r),
    });
  });
  const parties = new Map<string, NursingParty>();
  await rows('owners', (r, n) => {
    const enrollmentId = value(r, 'ENROLLMENT ID'),
      enrollment = enrollments.get(enrollmentId);
    if (!enrollment) {
      ownerRowsWithoutEnrollment++;
      return;
    }
    if (enrollment.associate !== cmsFixedId(value(r, 'ASSOCIATE ID'), 10))
      throw new Error('Owner enrollment/provider PAC mismatch');
    const f = facilities.get(enrollment.ccn);
    if (!f) return;
    const ownerId = cmsFixedId(value(r, 'ASSOCIATE ID - OWNER'), 10),
      type = z.enum(['I', 'O', '']).parse(value(r, 'TYPE - OWNER'));
    const name =
      type === 'I'
        ? [
            value(r, 'FIRST NAME - OWNER'),
            value(r, 'MIDDLE NAME - OWNER'),
            value(r, 'LAST NAME - OWNER'),
          ]
            .filter(Boolean)
            .join(' ')
        : value(r, 'ORGANIZATION NAME - OWNER');
    const role = cmsFixedId(value(r, 'ROLE CODE - OWNER'), 2);
    const association = {
      ownerId,
      name,
      type,
      enrollmentId,
      role,
      roleText: value(r, 'ROLE TEXT - OWNER'),
      associated: date(value(r, 'ASSOCIATION DATE - OWNER')),
      percentage: number(r, 'PERCENTAGE OWNERSHIP'),
      sourceRow: n,
      rowHash: hash(r),
    };
    f.associations.push(association);
    selectedAssociations++;
    const party = parties.get(ownerId) ?? { id: ownerId, type, names: [], facilitiesByRole: {} };
    if (party.type !== type) throw new Error('Conflicting party types for one PAC ID');
    if (!party.names.includes(name)) party.names.push(name);
    const ccns = party.facilitiesByRole[role] ?? [];
    if (!ccns.includes(f.facility.id)) ccns.push(f.facility.id);
    party.facilitiesByRole[role] = ccns;
    parties.set(ownerId, party);
  });
  const intervals: NursingData['intervals'] = [];
  await rows('intervals', (r) => {
    const processingDate = date(value(r, 'Processing Date'))!;
    if (processingDate !== resources.find((s) => s.kind === 'intervals')!.modified)
      throw new Error('Interval release mismatch');
    intervals.push({
      code: value(r, 'Measure Code'),
      label: value(r, 'Measure Description'),
      from: date(value(r, 'Data Collection Period From Date')),
      through: date(value(r, 'Data Collection Period Through Date')),
      range: value(r, 'Measure Date Range'),
      processingDate,
    });
  });
  if (!intervals.some((i) => i.code === 'STAFFING_LEVELS' && i.from && i.through))
    throw new Error('No documented staffing measurement interval');
  await rows('penalties', (r, n) => {
    const f = facilities.get(cmsFixedId(value(r, 'CMS Certification Number (CCN)'), 6, true));
    if (!f) return;
    if (
      date(value(r, 'Processing Date')) !== resources.find((s) => s.kind === 'penalties')!.modified
    )
      throw new Error('Penalty release mismatch');
    f.penalties.push({
      date: date(value(r, 'Penalty Date'))!,
      type: value(r, 'Penalty Type'),
      fineCents: money(r, 'Fine Amount'),
      denialStart: date(value(r, 'Payment Denial Start Date')),
      denialDays: number(r, 'Payment Denial Length in Days'),
      sourceRow: n,
      rowHash: hash(r),
    });
  });
  const details = [...facilities.values()]
    .sort((a, b) => a.facility.id.localeCompare(b.facility.id))
    .map((d) => {
      d.facility.ownerCount = new Set(
        d.associations.filter((a) => ownershipRole(a.role) === 'ownership').map((a) => a.ownerId),
      ).size;
      d.facility.enrollmentCount = d.enrollments.length;
      d.facility.recordHash = hash({
        provider: d.providerRowHash,
        enrollments: d.enrollments,
        associations: d.associations,
        penalties: d.penalties,
      });
      return nursingDetailSchema.parse(d);
    });
  const catalog = [...parties.values()].sort((a, b) => a.id.localeCompare(b.id));
  for (const p of catalog) {
    p.names.sort();
    for (const ids of Object.values(p.facilitiesByRole)) ids.sort();
  }
  const old = new Map(previous?.facilities.map((f) => [f.id, f.recordHash]) ?? []),
    ids = new Set(details.map((d) => d.facility.id));
  let changes: NursingData['changes'] = previous
    ? {
        baselineAt: previous.observedAt,
        newFacilities: details.filter((d) => !old.has(d.facility.id)).map((d) => d.facility.id),
        changedFacilities: details
          .filter((d) => old.has(d.facility.id) && old.get(d.facility.id) !== d.facility.recordHash)
          .map((d) => d.facility.id),
        notReturned: [...old.keys()].filter((id) => !ids.has(id)),
      }
    : { baselineAt: null, newFacilities: [], changedFacilities: [], notReturned: [] };
  const data = nursingDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'nursing-cms-v1',
    plan: input.plan,
    observedAt: input.observedAt,
    sources,
    intervals,
    facilities: details.map((d) => d.facility),
    parties: catalog,
    coverage: {
      selectedProviders: details.length,
      matchedProviders: details.filter((d) => d.enrollments.length).length,
      selectedEnrollments,
      selectedAssociations,
      ownerRowsWithoutEnrollment,
      selectedEnrollmentCcnsWithoutProvider: [...unjoined].sort(),
      unresolvedEnrollments,
    },
    changes,
  });
  if (previous?.observedAt === data.observedAt) {
    if (
      hash(previous.sources) !== hash(data.sources) ||
      hash(previous.facilities) !== hash(data.facilities) ||
      hash(previous.parties) !== hash(data.parties)
    )
      throw new Error('Nursing evidence changed at same capture time');
    changes = previous.changes;
    data.changes = changes;
  }
  return { data, details };
}
function numberCoordinate(text: string) {
  if (text === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error('Invalid facility coordinate');
  return Number(text);
}
async function download(url: string, fetcher: typeof fetch) {
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(120000) });
  if (response.status !== 200 || !response.body)
    throw new Error(`CMS download ${response.status}: ${url}`);
  const parts: Uint8Array[] = [],
    reader = response.body.getReader();
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 150_000_000) throw new Error('CMS file exceeds 150 MB limit');
      parts.push(value);
    }
  } catch (e) {
    await reader.cancel();
    throw e;
  }
  return Buffer.concat(parts);
}
export async function acquireNursing(
  plan: NursingPlan,
  workspace: string,
  fetcher: typeof fetch = fetch,
): Promise<Input> {
  const metadata: Input['metadata'] = [];
  for (const url of nursingMetadataUrls) {
    const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      await download(url, fetcher),
    );
    metadata.push({ url, raw, hash: hash(raw) });
  }
  const resources = nursingResources(metadata),
    files: Input['files'] = [];
  for (const resource of resources) {
    const bytes = await download(resource.url, fetcher);
    const encoding = sourceEncoding(bytes);
    const file = {
      kind: resource.kind,
      url: resource.url,
      bytesBase64: bytes.toString('base64'),
      hash: createHash('sha256').update(bytes).digest('hex'),
      encoding,
    };
    files.push(file);
    await writeAtomic(join(workspace, 'raw', `${resource.kind}-${file.hash}.json`), file);
  }
  const input: Input = {
    formatVersion: 1,
    plan,
    observedAt: new Date().toISOString(),
    metadata,
    files,
  };
  await writeAtomic(join(workspace, 'acquisition.json'), input);
  return input;
}
export async function runNursing(options: {
  input?: unknown;
  plan?: unknown;
  workspace: string;
  output: string;
  offline?: boolean;
  fetcher?: typeof fetch;
}) {
  return withLock(options.workspace, async () => {
    let previous: NursingData | null = null,
      expected: string | null = null;
    try {
      const manifest = JSON.parse(await readFile(join(options.output, 'manifest.json'), 'utf8'));
      if (!/^nh-[a-f0-9]{24}$/.test(manifest.release))
        throw new Error('Invalid prior nursing release');
      expected = manifest.release;
      const raw = JSON.parse(
        await readFile(join(options.output, 'releases', manifest.release, 'data.json'), 'utf8'),
      );
      if (hash(raw) !== manifest.dataHash || expected !== `nh-${hash(raw).slice(0, 24)}`)
        throw new Error('Prior nursing release integrity failure');
      previous = nursingDataSchema.parse(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || expected) throw e;
    }
    let input = options.input;
    if (input === undefined) {
      const plan = nursingPlanSchema.parse(options.plan);
      if (options.offline) {
        input = JSON.parse(await readFile(join(options.workspace, 'acquisition.json'), 'utf8'));
        if (hash(nursingInputSchema.parse(input).plan) !== hash(plan))
          throw new Error('Offline nursing plan mismatch');
      } else input = await acquireNursing(plan, options.workspace, options.fetcher);
    }
    const { data, details } = await buildNursing(input, previous);
    await writeAtomic(join(options.workspace, 'input.json'), input);
    const manifest = await publishSnapshot(
      data,
      options.output,
      'nh',
      expected,
      nursingAttachments(data, details, hash(data)),
    );
    return {
      release: manifest.release,
      dataHash: manifest.dataHash,
      facilities: data.facilities.length,
      parties: data.parties.length,
      coverage: {
        ...data.coverage,
        unresolvedEnrollments: data.coverage.unresolvedEnrollments.length,
      },
      sources: data.sources.map((s) => ({ kind: s.kind, rows: s.rows, period: s.period })),
    };
  });
}
