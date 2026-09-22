import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { hash } from '../said-did/engine';
import { writeAtomic, withLock } from '../said-did/pipeline';
import { publishSnapshot } from './snapshots';
import { wageAttachments } from './wage-index';
import {
  wageDataSchema,
  wagePlanSchema,
  wageCaseSchema,
  type WageCase,
  type WageData,
} from '../../src/lib/civic/wages';
import {
  acquireWageSource,
  fileHash,
  inspectWageArchive,
  scanWageCsv,
  wageArchiveUrl,
  wageMetadataUrl,
} from './wage-source';
const missing = (value: string | undefined) =>
  value === undefined || ['', 'N/A', 'NULL'].includes(value.trim());
export function wageNumber(value: string | undefined, money = false): number | null {
  if (missing(value)) return null;
  const raw = value!.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || (!money && !/^\d+$/.test(raw)))
    throw new Error(`Invalid WHD ${money ? 'currency' : 'count'}: ${raw}`);
  const [whole, fraction = ''] = raw.split('.'),
    result = Number(whole) * (money ? 100 : 1) + (money ? Number(fraction.padEnd(2, '0')) : 0);
  if (!Number.isSafeInteger(result))
    throw new Error('WHD numeric value exceeds exact integer range');
  return result;
}
export function wageDate(value: string | undefined): string | null {
  if (missing(value)) return null;
  const day = value!.slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(Date.parse(day)) ||
    new Date(day).toISOString().slice(0, 10) !== day
  )
    throw new Error('Invalid WHD source date');
  return day;
}
export function projectWageCase(
  raw: Record<string, string>,
  states: { code: string }[],
  member: string,
  row: number,
): WageCase {
  const r = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const text = (key: string) => (missing(r[key]) ? null : r[key]);
  const id = r.case_id,
    legalName = text('legal_name'),
    name = text('trade_nm') ?? legalName ?? 'Employer name not reported';
  const start = wageDate(r.findings_start_date),
    end = wageDate(r.findings_end_date),
    loaded = wageDate(r.load_dt);
  if (!end) throw new Error('Selected WHD case lacks findings end');
  const cautions: string[] = [];
  if (start && start > end)
    cautions.push(
      'Source findings start is after findings end; do not interpret this as a valid duration.',
    );
  if (!loaded)
    cautions.push('Source load date is missing; violation-count collection regime is unknown.');
  else if (loaded >= '2025-10-01')
    cautions.push(
      'Loaded after the October 2025 collection change; violation counts are not directly comparable with earlier-loaded cases.',
    );
  const summaryFields = new Set([
    'case_violtn_cnt',
    'cmp_assd',
    'ee_violtd_cnt',
    'bw_atp_amt',
    'ee_atp_cnt',
  ]);
  // Preserve source-reported nonzero statute fields without adding overlapping components.
  const facts = Object.entries(r)
    .filter(
      ([key, value]) =>
        !summaryFields.has(key) &&
        /(?:_cnt|_amt|_bw_amt)$/.test(key) &&
        !missing(value) &&
        Number(value) !== 0,
    )
    .map(([field, value]) => ({ field, value }));
  for (const fact of facts) wageNumber(fact.value, fact.field.endsWith('_amt'));
  return wageCaseSchema.parse({
    id,
    name,
    legalName,
    employerKey: `we-${hash(legalName === null ? ['unidentified-case', id] : ['exact-legal-name', legalName]).slice(0, 20)}`,
    city: text('cty_nm'),
    state: states.some((s) => s.code === r.st_cd) ? r.st_cd : null,
    reportedState: text('st_cd'),
    industry: text('naic_cd'),
    industryDescription: text('naics_code_description'),
    start,
    end,
    loaded,
    backWages: wageNumber(r.bw_atp_amt, true),
    penalties: wageNumber(r.cmp_assd, true),
    employeesAgreed: wageNumber(r.ee_atp_cnt),
    employeesViolation: wageNumber(r.ee_violtd_cnt),
    violations: wageNumber(r.case_violtn_cnt),
    repeatCode: text('flsa_repeat_violator'),
    source: { member, row, hash: hash(raw) },
    facts,
    cautions,
  });
}
export function finalizeWages(value: unknown, previous: WageData | null = null) {
  const data = wageDataSchema.parse(value);
  if (
    data.records.length !== data.coverage.selectedRows ||
    data.records.length > data.plan.maxRecords ||
    new Set(data.records.map((r) => r.id)).size !== data.records.length
  )
    throw new Error('WHD selected count or duplicate identity failure');
  if (
    data.coverage.members.reduce((n, m) => n + m.rows, 0) !== data.coverage.scannedRows ||
    new Set(data.coverage.members.map((m) => m.name)).size !== data.coverage.members.length
  )
    throw new Error('WHD member coverage mismatch');
  for (const record of data.records) {
    if (
      record.end < data.plan.from ||
      record.end > data.plan.through ||
      (data.plan.states.length && !data.plan.states.includes(record.reportedState ?? '')) ||
      (data.plan.industryPrefixes.length &&
        !data.plan.industryPrefixes.some((p) => record.industry?.startsWith(p)))
    )
      throw new Error('WHD record outside configured scope');
    const member = data.coverage.members.find((m) => m.name === record.source.member);
    if (!member || record.source.row > member.rows)
      throw new Error('WHD source row outside archive member');
  }
  if (previous) {
    if (hash(previous.plan) !== hash(data.plan) || previous.observedAt > data.observedAt)
      throw new Error('WHD scope changed or capture is stale');
    data.trackingStartedAt = previous.trackingStartedAt;
    const before = new Map(previous.records.map((r) => [r.id, r]));
    data.changes = [];
    for (const record of data.records) {
      const old = before.get(record.id);
      if (!old)
        data.changes.push({
          id: record.id,
          kind: 'newly_observed',
          detail:
            'Newly observed in the selected collection, not necessarily a newly concluded case.',
        });
      else if (
        hash({ ...old, source: { ...old.source, member: '', row: 0 } }) !==
        hash({ ...record, source: { ...record.source, member: '', row: 0 } })
      )
        data.changes.push({
          id: record.id,
          kind: 'updated',
          detail:
            'Source fields changed since the previous capture; this is not necessarily a new enforcement action.',
        });
      before.delete(record.id);
    }
    for (const id of before.keys())
      data.changes.push({
        id,
        kind: 'not_returned',
        detail:
          'Not in the current selected bulk records. Removal, reclassification or date changes are not resolved by this observation.',
      });
    if (previous.observedAt === data.observedAt && previous.source.hash === data.source.hash)
      data.changes = previous.changes;
    if (previous.observedAt === data.observedAt && hash(previous) !== hash(data))
      throw new Error('Conflicting same-time WHD capture');
  }
  return wageDataSchema.parse(data);
}
const sourceSchema = z.object({
  url: z.literal(wageArchiveUrl),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive().max(350000000),
  observedAt: z.string().datetime(),
  lastModified: z.string().nullable(),
  metadata: z.object({
    url: z.literal(wageMetadataUrl),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    raw: z.string().max(1000000),
  }),
});
export async function runWages(options: {
  plan?: unknown;
  input?: unknown;
  archiveDirectory?: string;
  workspace: string;
  output: string;
  states: { code: string }[];
  offline?: boolean;
}) {
  return withLock(options.workspace, async () => {
    const imported =
      options.input === undefined
        ? null
        : z
            .object({ formatVersion: z.literal(1), plan: wagePlanSchema, source: sourceSchema })
            .parse(options.input);
    const plan = wagePlanSchema.parse(imported?.plan ?? options.plan);
    const acquired = imported
      ? {
          ...imported.source,
          path: join(
            options.archiveDirectory ?? options.workspace,
            'raw',
            `${imported.source.hash}.zip`,
          ),
        }
      : await acquireWageSource(options.workspace, options.offline);
    const source = sourceSchema.parse(acquired);
    if ((await stat(acquired.path)).size !== source.bytes)
      throw new Error('WHD archive size differs from source receipt');
    if (
      (await fileHash(acquired.path)) !== source.hash ||
      hash(source.metadata.raw) !== source.metadata.hash
    )
      throw new Error('WHD imported source integrity failure');
    const meta = JSON.parse(source.metadata.raw).dataset;
    if (meta.id !== 10362 || meta.api_url !== 'enforcement' || meta.agency?.abbr !== 'WHD')
      throw new Error('WHD metadata identity mismatch');
    const dictionary = z
      .array(
        z.object({
          column_name: z.string(),
          column_desc: z.string(),
          intended_datatype: z.string(),
        }),
      )
      .parse(meta.dataset_metadatum)
      .map((d) => ({
        field: d.column_name,
        description: d.column_desc,
        type: d.intended_datatype,
      }));
    const penalty = dictionary.find((d) => d.field === 'cmp_assd');
    if (penalty?.type !== 'currency') throw new Error('WHD total penalty field semantics changed');
    const entries = await inspectWageArchive(acquired.path);
    if (
      !entries.length ||
      entries.length > 100 ||
      entries.some((e) => !/^LOAD[^/\\]+_chunk_\d+\.csv$/.test(e.name)) ||
      new Set(entries.map((e) => e.name)).size !== entries.length
    )
      throw new Error('Unexpected WHD archive layout');
    const records: WageCase[] = [],
      members: { name: string; rows: number }[] = [],
      ids = new Set<string>();
    let scannedRows = 0,
      missingFindingsEnd = 0,
      futureFindingsEnd = 0;
    for (const entry of entries) {
      const result = await scanWageCsv(acquired.path, entry.name, (raw, row) => {
        scannedRows++;
        if (scannedRows > 1000000) throw new Error('WHD archive exceeds one million records');
        const r = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]));
        if (!/^\d{1,10}$/.test(r.case_id) || ids.has(r.case_id))
          throw new Error('Duplicate or invalid WHD source ID');
        ids.add(r.case_id);
        const end = wageDate(r.findings_end_date);
        if (!end) {
          missingFindingsEnd++;
          return;
        }
        if (end > source.observedAt.slice(0, 10)) futureFindingsEnd++;
        if (
          end < plan.from ||
          end > plan.through ||
          (plan.states.length && !plan.states.includes(r.st_cd)) ||
          (plan.industryPrefixes.length &&
            !plan.industryPrefixes.some((p) => r.naic_cd.startsWith(p)))
        )
          return;
        records.push(projectWageCase(raw, options.states, entry.name, row));
        if (records.length > plan.maxRecords)
          throw new Error(
            'WHD selection exceeds explicit cap; narrow scope or raise cap. No partial output published.',
          );
      });
      if (hash(result.headers.map((h) => h.toLowerCase())) !== hash(dictionary.map((d) => d.field)))
        throw new Error('WHD CSV columns differ from source metadata');
      members.push({ name: entry.name, rows: result.rows });
    }
    let previous: WageData | null = null,
      expected: string | null = null;
    try {
      const manifest = JSON.parse(await readFile(join(options.output, 'manifest.json'), 'utf8'));
      if (!/^wl-[a-f0-9]{24}$/.test(manifest.release))
        throw new Error('Invalid WHD previous release');
      expected = manifest.release;
      const raw = JSON.parse(
        await readFile(join(options.output, 'releases', manifest.release, 'data.json'), 'utf8'),
      );
      if (hash(raw) !== manifest.dataHash || expected !== `wl-${hash(raw).slice(0, 24)}`)
        throw new Error('Previous WHD snapshot integrity failure');
      previous = wageDataSchema.parse(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || expected) throw e;
    }
    const data = finalizeWages(
      {
        formatVersion: 1,
        pipelineVersion: 'wage-ledger-v1',
        plan,
        observedAt: source.observedAt,
        trackingStartedAt: source.observedAt,
        source: {
          url: source.url,
          hash: source.hash,
          bytes: source.bytes,
          lastModified: source.lastModified,
          metadataHash: source.metadata.hash,
          metadataUrl: source.metadata.url,
        },
        dictionary,
        coverage: {
          scannedRows,
          selectedRows: records.length,
          missingFindingsEnd,
          futureFindingsEnd,
          members,
          completeArchive: true,
        },
        records: records.sort((a, b) => a.end.localeCompare(b.end) || Number(a.id) - Number(b.id)),
        changes: [],
      },
      previous,
    );
    await writeAtomic(join(options.workspace, 'input.json'), { formatVersion: 1, plan, source });
    const manifest = await publishSnapshot(
      data,
      options.output,
      'wl',
      expected,
      wageAttachments(data),
    );
    return {
      ...manifest,
      records: records.length,
      scannedRows,
      states: new Set(records.map((r) => r.state).filter(Boolean)).size,
    };
  });
}
