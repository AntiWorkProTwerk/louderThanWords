import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from '../said-did/engine';
import { writeAtomic, withLock } from '../said-did/pipeline';
import { publishSnapshot } from './snapshots';
import { scanZipCsv } from './zip-csv';
import {
  acquireWaterSource,
  waterSourceSchema,
  waterArchiveUrl,
  waterSearchUrl,
} from './water-source';
import {
  waterPlanSchema,
  waterRowSchema,
  waterId,
  waterDataSchema,
  waterDetailSchema,
  waterKind,
  type WaterPlan,
  type WaterData,
  type WaterDetail,
  type WaterViolation,
  type WaterRow,
} from '../../src/lib/civic/water';
import { echoDate } from './echo';

// The bulk export uses an arrow for some missing/open-ended date cells.
// Preserve the original field in sourceRows; do not infer a date or resolution.
export function waterDate(value: string | null) {
  return value === '--->' ? null : echoDate(value);
}

export const waterMembers = {
  geography: 'SDWA_GEOGRAPHIC_AREAS.csv',
  inventory: 'SDWA_PUB_WATER_SYSTEMS.csv',
  codes: 'SDWA_REF_CODE_VALUES.csv',
  violations: 'SDWA_VIOLATIONS_ENFORCEMENT.csv',
  search: 'SDWA_SYSTEM_SEARCH.csv',
} as const;
type Table = keyof typeof waterMembers;
const tableKeys = Object.keys(waterMembers) as Table[];
const selectedSchema = z.object({
  geography: z.array(waterRowSchema),
  inventory: z.array(waterRowSchema),
  codes: z.array(waterRowSchema),
  violations: z.array(waterRowSchema),
  search: z.array(waterRowSchema),
});
const tableSchema = z.object({
  member: z.string(),
  rows: z.number().int().nonnegative(),
  selected: z.number().int().nonnegative(),
  headers: z.array(z.string()),
});
export const waterInputSchema = z.object({
  formatVersion: z.literal(1),
  plan: waterPlanSchema,
  quarter: z.string().regex(/^\d{4}Q[1-4]$/),
  sources: z.object({ records: waterSourceSchema, search: waterSourceSchema }),
  retainedIds: z.array(waterId),
  discoveredIds: z.array(waterId),
  tables: z.array(tableSchema),
  selected: selectedSchema,
});
export type WaterInput = z.infer<typeof waterInputSchema>;
export const waterInventoryFields = [
  'SUBMISSIONYEARQUARTER',
  'PWSID',
  'PWS_NAME',
  'PRIMACY_AGENCY_CODE',
  'EPA_REGION',
  'PWS_ACTIVITY_CODE',
  'PWS_TYPE_CODE',
  'PRIMARY_SOURCE_CODE',
  'POPULATION_SERVED_COUNT',
  'SERVICE_CONNECTIONS_COUNT',
  'SUBMISSION_STATUS_CODE',
  'FIRST_REPORTED_DATE',
  'LAST_REPORTED_DATE',
  'IS_WHOLESALER_IND',
  'OWNER_TYPE_CODE',
];
export const waterSearchFields = [
  'PWSID',
  'PWS_NAME',
  'REGISTRY_ID',
  'STATE_CODE',
  'CITIES_SERVED',
  'COUNTIES_SERVED',
  'FIPS_CODES',
];
const required: Record<Table, string[]> = {
  geography: ['SUBMISSIONYEARQUARTER', 'PWSID', 'GEO_ID', 'COUNTY_SERVED', 'STATE_SERVED'],
  inventory: waterInventoryFields,
  codes: ['VALUE_TYPE', 'VALUE_CODE', 'VALUE_DESCRIPTION'],
  violations: [
    'SUBMISSIONYEARQUARTER',
    'PWSID',
    'VIOLATION_ID',
    'VIOLATION_CATEGORY_CODE',
    'VIOLATION_CODE',
    'NON_COMPL_PER_BEGIN_DATE',
    'NON_COMPL_PER_END_DATE',
    'VIOLATION_STATUS',
    'ENFORCEMENT_ID',
    'ENFORCEMENT_DATE',
    'ENFORCEMENT_ACTION_TYPE_CODE',
  ],
  search: waterSearchFields,
};
const clean = (s: string | undefined) => s?.trim() || null;
const requiredValue = (row: Record<string, string>, key: string) => {
  const value = clean(row[key]);
  if (!value) throw new Error(`Missing SDWA ${key}`);
  return value;
};
export const capturedWaterRow = (fields: Record<string, string>, row: number): WaterRow => ({
  row,
  fields,
  hash: hash(fields),
});
const pick = (row: Record<string, string>, fields: string[]) =>
  Object.fromEntries(fields.map((key) => [key, row[key] ?? '']));
const sortRows = (rows: WaterRow[]) => rows.sort((a, b) => a.row - b.row);
export function waterCountyMatches(plan: WaterPlan, row: Record<string, string>) {
  return plan.counties.some(
    (c) =>
      c.county.toLowerCase() === row.COUNTY_SERVED?.trim().toLowerCase() &&
      c.state === (clean(row.STATE_SERVED) ?? row.PWSID?.slice(0, 2)),
  );
}
function eligible(plan: WaterPlan, row: Record<string, string>) {
  return (
    plan.types.includes(row.PWS_TYPE_CODE as never) &&
    (plan.active === 'all' || row.PWS_ACTIVITY_CODE === plan.active)
  );
}
export function waterOverlaps(plan: WaterPlan, row: Record<string, string>) {
  const from = waterDate(clean(row.NON_COMPL_PER_BEGIN_DATE)),
    through = waterDate(clean(row.NON_COMPL_PER_END_DATE));
  if (from && through && from > through) return true; // Uncertain scope: retain and explicitly flag.
  return (!from || from <= plan.through) && (!through || through >= plan.from);
}

export async function acquireWater(
  plan: WaterPlan,
  workspace: string,
  offline = false,
  previous: WaterData | null = null,
  fetcher: typeof fetch = fetch,
) {
  const records = await acquireWaterSource(workspace, offline, fetcher),
    search = await acquireWaterSource(workspace, offline, fetcher, true);
  const input: WaterInput = {
    formatVersion: 1,
    plan,
    quarter: '2000Q1',
    sources: { records, search },
    retainedIds: previous?.systems.map((s) => s.id) ?? [],
    discoveredIds: [],
    tables: [],
    selected: { geography: [], inventory: [], codes: [], violations: [], search: [] },
  };
  const countyIds = new Set<string>(),
    retained = new Set(input.retainedIds),
    selected = new Set<string>(),
    quarters = new Set<string>();
  async function scan(
    table: Table,
    select: (r: Record<string, string>, n: number) => Record<string, string> | null,
  ) {
    console.log(`Scanning ${waterMembers[table]}…`);
    const result = await scanZipCsv(
      table === 'search' ? search.path : records.path,
      waterMembers[table],
      (r, n) => {
        if (table !== 'codes' && table !== 'search') {
          if (!/^\d{4}Q[1-4]$/.test(r.SUBMISSIONYEARQUARTER))
            throw new Error('Invalid SDWA quarter');
          quarters.add(r.SUBMISSIONYEARQUARTER);
          if (quarters.size > 1) throw new Error('Mixed SDWA snapshot quarters');
        }
        const fields = select(r, n);
        if (fields) {
          input.selected[table].push(capturedWaterRow(fields, n));
          if (input.selected[table].length > 500000)
            throw new Error('Selected SDWA rows exceed cap; narrow scope');
        }
      },
      5_000_000_000,
      (rows) => console.log(`${waterMembers[table]}: ${rows.toLocaleString()} rows validated…`),
    );
    if (required[table].some((h) => !result.headers.includes(h)))
      throw new Error(`Missing SDWA ${table} columns`);
    input.tables.push({ ...result, selected: input.selected[table].length });
  }
  await scan('geography', (r) => {
    if (waterCountyMatches(plan, r)) {
      countyIds.add(r.PWSID);
      return r;
    }
    return null;
  });
  await scan('inventory', (r) => {
    if (countyIds.has(r.PWSID) && eligible(plan, r)) input.discoveredIds.push(r.PWSID);
    if ((countyIds.has(r.PWSID) && eligible(plan, r)) || retained.has(r.PWSID)) {
      selected.add(r.PWSID);
      if (selected.size > plan.maxSystems)
        throw new Error('SDWA system limit exceeded; narrow explicit scope');
      return pick(r, waterInventoryFields);
    }
    return null;
  });
  input.selected.geography = input.selected.geography.filter((r) => selected.has(r.fields.PWSID));
  input.tables.find((t) => t.member === waterMembers.geography)!.selected =
    input.selected.geography.length;
  await scan('codes', (r) => r);
  await scan('search', (r) => (selected.has(r.PWSID) ? pick(r, waterSearchFields) : null));
  await scan('violations', (r) => (selected.has(r.PWSID) && waterOverlaps(plan, r) ? r : null));
  input.quarter = [...quarters][0];
  input.discoveredIds.sort();
  await writeAtomic(join(workspace, 'acquisition.json'), input);
  return input;
}

export function buildWater(value: unknown, previous: WaterData | null = null) {
  const input = waterInputSchema.parse(value),
    { plan } = input;
  if (input.sources.records.url !== waterArchiveUrl || input.sources.search.url !== waterSearchUrl)
    throw new Error('SDWA archive roles mismatched');
  const observedAt = [input.sources.records.observedAt, input.sources.search.observedAt]
    .sort()
    .at(-1)!;
  if (
    previous &&
    (hash(previous.plan) !== hash(plan) ||
      previous.observedAt > observedAt ||
      previous.quarter > input.quarter)
  )
    throw new Error('SDWA stale capture or changed scope');
  for (const table of tableKeys) {
    const receipts = input.tables.filter((t) => t.member === waterMembers[table]),
      rows = input.selected[table];
    if (
      receipts.length !== 1 ||
      receipts[0].selected !== rows.length ||
      required[table].some((k) => !receipts[0].headers.includes(k)) ||
      new Set(rows.map((r) => r.row)).size !== rows.length
    )
      throw new Error(`SDWA ${table} table coverage mismatch`);
    for (const r of rows)
      if (
        r.row > receipts[0].rows ||
        hash(r.fields) !== r.hash ||
        required[table].some((k) => !(k in r.fields)) ||
        (table !== 'codes' &&
          table !== 'search' &&
          r.fields.SUBMISSIONYEARQUARTER !== input.quarter)
      )
        throw new Error(`SDWA ${table} row integrity/quarter mismatch`);
  }
  if (input.tables.length !== tableKeys.length) throw new Error('Unexpected SDWA table');
  const codes = new Map<string, string>();
  for (const r of input.selected.codes) {
    const k = `${r.fields.VALUE_TYPE}/${r.fields.VALUE_CODE}`,
      value = requiredValue(r.fields, 'VALUE_DESCRIPTION');
    if (codes.has(k)) throw new Error('Duplicate SDWA reference code');
    codes.set(k, value);
  }
  const describe = (type: string, code: string | undefined) => ({
    code: code ?? '',
    label: codes.get(`${type}/${code}`) ?? null,
  });
  const systems = new Map<string, WaterRow>();
  for (const r of input.selected.inventory) {
    const id = waterId.parse(r.fields.PWSID);
    if (systems.has(id)) throw new Error('Duplicate SDWA system');
    if (Object.keys(r.fields).some((k) => !waterInventoryFields.includes(k)))
      throw new Error('Unprojected SDWA inventory/contact field');
    systems.set(id, r);
  }
  const ids = new Set([...input.discoveredIds, ...input.retainedIds]);
  if (
    ids.size !== systems.size ||
    ids.size > plan.maxSystems ||
    [...ids].some((id) => !systems.has(id)) ||
    new Set(input.discoveredIds).size !== input.discoveredIds.length ||
    new Set(input.retainedIds).size !== input.retainedIds.length ||
    previous?.systems.some((s) => !ids.has(s.id))
  )
    throw new Error('SDWA system coverage mismatch');
  for (const id of input.discoveredIds)
    if (
      !eligible(plan, systems.get(id)!.fields) ||
      !input.selected.geography.some(
        (r) => r.fields.PWSID === id && waterCountyMatches(plan, r.fields),
      )
    )
      throw new Error('SDWA discovered system outside scope');
  const geos = new Map<string, WaterRow[]>(),
    searchRows = new Map<string, WaterRow>();
  for (const r of input.selected.geography) {
    const id = r.fields.PWSID;
    if (!ids.has(id)) throw new Error('Foreign SDWA geography');
    geos.set(id, [...(geos.get(id) ?? []), r]);
  }
  for (const r of input.selected.search) {
    const id = r.fields.PWSID;
    if (
      !ids.has(id) ||
      searchRows.has(id) ||
      Object.keys(r.fields).some((k) => !waterSearchFields.includes(k))
    )
      throw new Error('Duplicate/foreign SDWA search row');
    searchRows.set(id, r);
  }
  const groups = new Map<string, WaterRow[]>();
  const standaloneRows = new Map<string, WaterRow[]>();
  for (const r of input.selected.violations) {
    const id = r.fields.PWSID;
    if (!ids.has(id) || !waterOverlaps(plan, r.fields))
      throw new Error('SDWA violation outside scope');
    if (!clean(r.fields.VIOLATION_ID)) {
      if (
        !clean(r.fields.ENFORCEMENT_ID) ||
        clean(r.fields.VIOLATION_CODE) ||
        clean(r.fields.VIOLATION_STATUS)
      )
        throw new Error('Unidentified SDWA violation/action');
      standaloneRows.set(id, [...(standaloneRows.get(id) ?? []), r]);
      continue;
    }
    const key = `${id}/${requiredValue(r.fields, 'VIOLATION_ID')}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const violationsBySystem = new Map<string, WaterViolation[]>();
  for (const rows of groups.values()) {
    sortRows(rows);
    const f = rows[0].fields,
      core = (r: Record<string, string>) =>
        Object.fromEntries(
          Object.entries(r).filter(([k]) => !k.startsWith('ENF_') && !k.startsWith('ENFORCEMENT_')),
        );
    if (rows.some((r) => hash(core(r.fields)) !== hash(core(f))))
      throw new Error(`Conflicting SDWA violation ${f.PWSID}/${f.VIOLATION_ID}`);
    const actions = new Map<string, WaterViolation['actions'][number]>();
    for (const r of rows) {
      const a = r.fields,
        id = clean(a.ENFORCEMENT_ID);
      if (!id) {
        if (clean(a.ENFORCEMENT_DATE) || clean(a.ENFORCEMENT_ACTION_TYPE_CODE))
          throw new Error('SDWA action missing ID');
        continue;
      }
      const action = {
        id,
        date: waterDate(clean(a.ENFORCEMENT_DATE)),
        code: describe('ENFORCEMENT_ACTION_TYPE_CODE', a.ENFORCEMENT_ACTION_TYPE_CODE),
        category: clean(a.ENF_ACTION_CATEGORY),
        firstReported: waterDate(clean(a.ENF_FIRST_REPORTED_DATE)),
        lastReported: waterDate(clean(a.ENF_LAST_REPORTED_DATE)),
        sourceRows: [] as number[],
      };
      const old = actions.get(id);
      if (old && hash({ ...old, sourceRows: [] }) !== hash(action))
        throw new Error('Conflicting SDWA action identity');
      if (old) old.sourceRows.push(r.row);
      else actions.set(id, { ...action, sourceRows: [r.row] });
    }
    const flag = clean(f.IS_HEALTH_BASED_IND);
    if (flag && !['Y', 'N'].includes(flag)) throw new Error('Unknown SDWA health flag');
    const v: WaterViolation = {
      intervalIssue:
        waterDate(clean(f.NON_COMPL_PER_BEGIN_DATE)) &&
        waterDate(clean(f.NON_COMPL_PER_END_DATE)) &&
        waterDate(clean(f.NON_COMPL_PER_BEGIN_DATE))! > waterDate(clean(f.NON_COMPL_PER_END_DATE))!
          ? 'reversed'
          : null,
      id: f.VIOLATION_ID,
      from: waterDate(clean(f.NON_COMPL_PER_BEGIN_DATE)),
      through: waterDate(clean(f.NON_COMPL_PER_END_DATE)),
      returned: waterDate(clean(f.CALCULATED_RTC_DATE)),
      status: clean(f.VIOLATION_STATUS),
      code: describe('VIOLATION_CODE', f.VIOLATION_CODE),
      category: f.VIOLATION_CATEGORY_CODE,
      kind: waterKind(f.VIOLATION_CATEGORY_CODE),
      healthBased: flag === 'Y' ? true : flag === 'N' ? false : null,
      contaminant: describe('CONTAMINANT_CODE', f.CONTAMINANT_CODE),
      rule: describe('RULE_CODE', f.RULE_CODE),
      measure: clean(f.VIOL_MEASURE),
      units: clean(f.UNIT_OF_MEASURE),
      federalLimit: clean(f.FEDERAL_MCL),
      stateLimit: clean(f.STATE_MCL),
      firstReported: waterDate(clean(f.VIOL_FIRST_REPORTED_DATE)),
      lastReported: waterDate(clean(f.VIOL_LAST_REPORTED_DATE)),
      actions: [...actions.values()].sort(
        (a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id),
      ),
      sourceRows: rows,
    };
    violationsBySystem.set(f.PWSID, [...(violationsBySystem.get(f.PWSID) ?? []), v]);
  }
  const details: WaterDetail[] = [];
  for (const [id, inventory] of systems) {
    const f = inventory.fields,
      geography = sortRows(geos.get(id) ?? []),
      search = searchRows.get(id) ?? null,
      violations = (violationsBySystem.get(id) ?? []).sort(
        (a, b) => (b.from ?? '').localeCompare(a.from ?? '') || a.id.localeCompare(b.id),
      ),
      population = clean(f.POPULATION_SERVED_COUNT);
    const standalone = new Map<string, WaterDetail['standaloneActions'][number]>();
    let outsideWindowActionRows = 0;
    for (const r of standaloneRows.get(id) ?? []) {
      const a = r.fields,
        date = waterDate(clean(a.ENFORCEMENT_DATE));
      if (date && (date < plan.from || date > plan.through)) {
        outsideWindowActionRows++;
        continue;
      }
      const action = {
        id: requiredValue(a, 'ENFORCEMENT_ID'),
        date,
        code: describe('ENFORCEMENT_ACTION_TYPE_CODE', a.ENFORCEMENT_ACTION_TYPE_CODE),
        category: clean(a.ENF_ACTION_CATEGORY),
        firstReported: waterDate(clean(a.ENF_FIRST_REPORTED_DATE)),
        lastReported: waterDate(clean(a.ENF_LAST_REPORTED_DATE)),
        sourceRows: [] as number[],
      };
      const old = standalone.get(action.id);
      if (old) {
        if (hash({ ...old.action, sourceRows: [] }) !== hash(action))
          throw new Error('Conflicting standalone SDWA action');
        old.rows.push(r);
        old.action.sourceRows.push(r.row);
      } else standalone.set(action.id, { action: { ...action, sourceRows: [r.row] }, rows: [r] });
    }
    const standaloneActions = [...standalone.values()].sort(
      (a, b) =>
        (b.action.date ?? '').localeCompare(a.action.date ?? '') ||
        a.action.id.localeCompare(b.action.id),
    );
    if (population && !/^\d+$/.test(population)) throw new Error('Invalid SDWA population');
    const kinds = { contaminant: 0, treatment: 0, monitoring: 0, reporting: 0, other: 0 };
    for (const v of violations) kinds[v.kind]++;
    const system = {
      id,
      name: requiredValue(f, 'PWS_NAME'),
      state: id.slice(0, 2),
      counties: [...new Set(geography.map((r) => r.fields.COUNTY_SERVED).filter(Boolean))].sort(),
      type: describe('PWS_TYPE_CODE', f.PWS_TYPE_CODE),
      activity: describe('ACTIVITY_CODE', f.PWS_ACTIVITY_CODE),
      sourceType: describe('PRIMARY_SOURCE_CODE', f.PRIMARY_SOURCE_CODE),
      population: population === null ? null : Number(population),
      retained: !input.discoveredIds.includes(id),
      frs: clean(search?.fields.REGISTRY_ID),
      kinds,
      violations: violations.length,
      recordHash: hash({
        inventory,
        geography,
        search,
        violations,
        standaloneActions,
        outsideWindowActionRows,
      }),
    };
    details.push(
      waterDetailSchema.parse({
        system,
        quarter: input.quarter,
        inventory,
        geography,
        search,
        violations,
        standaloneActions,
        outsideWindowActionRows,
      }),
    );
  }
  details.sort(
    (a, b) => a.system.name.localeCompare(b.system.name) || a.system.id.localeCompare(b.system.id),
  );
  const old = new Map(previous?.systems.map((s) => [s.id, s.recordHash]) ?? []);
  const data = waterDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'sdwa-v1',
    plan,
    observedAt,
    quarter: input.quarter,
    sources: input.sources,
    tables: input.tables,
    systems: details.map((d) => d.system),
    changes: {
      baselineAt: previous?.observedAt ?? null,
      added: details.filter((d) => !old.has(d.system.id)).map((d) => d.system.id),
      updated: details
        .filter((d) => old.has(d.system.id) && old.get(d.system.id) !== d.system.recordHash)
        .map((d) => d.system.id),
      outsideDiscovery: details.filter((d) => d.system.retained).map((d) => d.system.id),
    },
  });
  if (previous?.observedAt === observedAt) {
    if (
      hash(previous.systems) !== hash(data.systems) ||
      hash(previous.sources) !== hash(data.sources)
    )
      throw new Error('SDWA evidence changed at same capture');
    data.changes = previous.changes;
  }
  return { data, details };
}

export async function runWater(options: {
  plan?: unknown;
  input?: unknown;
  workspace: string;
  output: string;
  offline?: boolean;
}) {
  return withLock(options.workspace, async () => {
    let previous: WaterData | null = null,
      expected: string | null = null;
    try {
      const manifest = JSON.parse(await readFile(join(options.output, 'manifest.json'), 'utf8'));
      if (!/^sw-[a-f0-9]{24}$/.test(manifest.release)) throw new Error('Invalid SDWA release');
      expected = manifest.release;
      const raw = JSON.parse(
        await readFile(join(options.output, 'releases', expected!, 'data.json'), 'utf8'),
      );
      if (hash(raw) !== manifest.dataHash || expected !== `sw-${hash(raw).slice(0, 24)}`)
        throw new Error('SDWA prior hash mismatch');
      previous = waterDataSchema.parse(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || expected) throw e;
    }
    let input = options.input;
    if (input === undefined) {
      const plan = waterPlanSchema.parse(options.plan);
      input = await acquireWater(plan, options.workspace, options.offline, previous);
    }
    const { data, details } = buildWater(input, previous);
    await writeAtomic(join(options.workspace, 'input.json'), input);
    const manifest = await publishSnapshot(
      data,
      options.output,
      'sw',
      expected,
      Object.fromEntries(details.map((d) => [`systems/${d.system.id.toLowerCase()}.json`, d])),
    );
    return {
      release: manifest.release,
      dataHash: manifest.dataHash,
      quarter: data.quarter,
      systems: details.length,
      violations: details.reduce((n, d) => n + d.violations.length, 0),
      sourceRows: details.reduce(
        (n, d) => n + d.violations.reduce((m, v) => m + v.sourceRows.length, 0),
        0,
      ),
      byState: Object.fromEntries(
        [...new Set(data.systems.map((s) => s.state))].map((state) => [
          state,
          data.systems.filter((s) => s.state === state).length,
        ]),
      ),
    };
  });
}
