import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from '../said-did/engine';
import { writeAtomic, withLock } from '../said-did/pipeline';
import { acquireSecFile } from './sec-source';
import { scanZipCsv } from './zip-csv';
import { publishSnapshot } from './snapshots';
import { insiderDate, capturedInsiderRow } from './insiders';
import { insiderRowSchema, insiderSourceSchema, secCik } from '../../src/lib/civic/insiders';
import {
  holdingsPlanSchema,
  holdingsDataSchema,
  holdingsTableReceipt,
  holdingFilingSchema,
  holdingSnapshotSchema,
  holdingDetailSchema,
  amountAdd,
  amountCompare,
  valueDollars,
  holdingWeight,
  encodeHoldingPositions,
  type HoldingsPlan,
  type HoldingsData,
  type HoldingFiling,
  type HoldingSnapshot,
  type HoldingPosition,
  type HoldingDetail,
} from '../../src/lib/civic/holdings';

// Explicit whitelist. Street addresses, postcodes, signatures and phone numbers
// stay in the ignored raw archive; they are not needed for this product.
export const holdingsColumns = {
  SUBMISSION: ['ACCESSION_NUMBER', 'FILING_DATE', 'SUBMISSIONTYPE', 'CIK', 'PERIODOFREPORT'],
  COVERPAGE: [
    'ACCESSION_NUMBER',
    'REPORTCALENDARORQUARTER',
    'ISAMENDMENT',
    'AMENDMENTNO',
    'AMENDMENTTYPE',
    'CONFDENIEDEXPIRED',
    'DATEDENIEDEXPIRED',
    'DATEREPORTED',
    'REASONFORNONCONFIDENTIALITY',
    'FILINGMANAGER_NAME',
    'FILINGMANAGER_CITY',
    'FILINGMANAGER_STATEORCOUNTRY',
    'REPORTTYPE',
    'FORM13FFILENUMBER',
    'CRDNUMBER',
    'SECFILENUMBER',
    'PROVIDEINFOFORINSTRUCTION5',
    'ADDITIONALINFORMATION',
  ],
  SUMMARYPAGE: [
    'ACCESSION_NUMBER',
    'OTHERINCLUDEDMANAGERSCOUNT',
    'TABLEENTRYTOTAL',
    'TABLEVALUETOTAL',
    'ISCONFIDENTIALOMITTED',
  ],
  OTHERMANAGER: [
    'ACCESSION_NUMBER',
    'OTHERMANAGER_SK',
    'CIK',
    'FORM13FFILENUMBER',
    'CRDNUMBER',
    'SECFILENUMBER',
    'NAME',
  ],
  OTHERMANAGER2: [
    'ACCESSION_NUMBER',
    'SEQUENCENUMBER',
    'CIK',
    'FORM13FFILENUMBER',
    'CRDNUMBER',
    'SECFILENUMBER',
    'NAME',
  ],
  INFOTABLE: [
    'ACCESSION_NUMBER',
    'INFOTABLE_SK',
    'NAMEOFISSUER',
    'TITLEOFCLASS',
    'CUSIP',
    'FIGI',
    'VALUE',
    'SSHPRNAMT',
    'SSHPRNAMTTYPE',
    'PUTCALL',
    'INVESTMENTDISCRETION',
    'OTHERMANAGER',
    'VOTING_AUTH_SOLE',
    'VOTING_AUTH_SHARED',
    'VOTING_AUTH_NONE',
  ],
} as const;
export type HoldingsTable = keyof typeof holdingsColumns;
export const holdingsTables = Object.keys(holdingsColumns) as HoldingsTable[];
const selectedSchema = z.object(
  Object.fromEntries(holdingsTables.map((t) => [t, z.array(insiderRowSchema)])) as Record<
    HoldingsTable,
    z.ZodArray<typeof insiderRowSchema>
  >,
);
export const holdingsInputSchema = z.object({
  formatVersion: z.literal(1),
  plan: holdingsPlanSchema,
  archives: z.array(
    z.object({
      id: z.string(),
      source: insiderSourceSchema,
      tables: z.array(holdingsTableReceipt),
      selected: selectedSchema,
    }),
  ),
});
export type HoldingsInput = z.infer<typeof holdingsInputSchema>;
type Row = z.infer<typeof insiderRowSchema>;
const clean = (s: string | undefined) => s?.trim() || null;
const cik = (s: string) => secCik.parse(s.padStart(10, '0'));
const states = new Set(
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(
    ' ',
  ),
);
export function holdingsBoolean(s: string | undefined) {
  if (!clean(s)) return null;
  if (['Y', 'TRUE', '1'].includes(s!.toUpperCase())) return true;
  if (['N', 'FALSE', '0'].includes(s!.toUpperCase())) return false;
  throw new Error('Unknown SEC 13F checkbox');
}
function count(s: string | undefined) {
  if (!clean(s)) return null;
  if (!/^\d+$/.test(s!)) throw new Error('Invalid SEC 13F integer');
  return z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(Number(s));
}
export function holdingsArchiveUrl(id: string, url: string) {
  const p = new URL(url);
  if (
    !['https://www.sec.gov', 'https://dcm.sec.gov'].includes(p.origin) ||
    p.search ||
    p.hash ||
    p.username ||
    p.password ||
    !/^(?:\d{2}[a-z]{3}\d{4}-\d{2}[a-z]{3}\d{4}|20\d{2}q[1-4])$/.test(id) ||
    !new RegExp(
      `^/files/(?:structureddata/data|datastandardsinnovation/data|datastandardsinnovation)/form-13f-data-sets/${id}_form13f\\.zip$`,
    ).test(p.pathname)
  )
    throw new Error('Holdings archive must be the exact official SEC publication-window URL');
  return url;
}
function scope(plan: HoldingsPlan, previous: HoldingsData | null) {
  for (const a of plan.archives) holdingsArchiveUrl(a.id, a.url);
  if (
    previous &&
    (previous.plan.id !== plan.id ||
      previous.plan.managers.some((c) => !plan.managers.includes(c)) ||
      previous.plan.archives.some(
        (a) => !plan.archives.some((b) => a.id === b.id && a.url === b.url),
      ))
  )
    throw new Error(
      'Holdings refresh must retain collected managers and archives; isolate a different scope',
    );
}
export async function acquireHoldings(
  plan: HoldingsPlan,
  workspace: string,
  offline = false,
  previous: HoldingsData | null = null,
  fetcher: typeof fetch = fetch,
): Promise<HoldingsInput> {
  plan = holdingsPlanSchema.parse(plan);
  scope(plan, previous);
  const input: HoldingsInput = { formatVersion: 1, plan, archives: [] };
  let filings = 0,
    rows = 0;
  for (const a of [...plan.archives].sort((a, b) => a.id.localeCompare(b.id))) {
    const { path, source } = await acquireSecFile(
      workspace,
      { url: a.url, key: a.id, extension: 'zip', cap: 250_000_000 },
      offline,
      fetcher,
    );
    const archive: HoldingsInput['archives'][number] = {
      id: a.id,
      source,
      tables: [],
      selected: Object.fromEntries(
        holdingsTables.map((t) => [t, []]),
      ) as unknown as HoldingsInput['archives'][number]['selected'],
    };
    const accessions = new Set<string>();
    for (const table of holdingsTables) {
      console.log(`Scanning SEC 13F ${a.id} ${table}…`);
      const receipt = await scanZipCsv(
        path,
        `${table}.tsv`,
        (fields, row) => {
          if (table === 'SUBMISSION') {
            if (!plan.managers.includes(cik(fields.CIK))) return;
            if (accessions.has(fields.ACCESSION_NUMBER))
              throw new Error('Duplicate SEC submission');
            accessions.add(fields.ACCESSION_NUMBER);
            if (++filings > plan.maxFilings)
              throw new Error('Holdings filing cap exceeded; no truncated publication');
          } else if (!accessions.has(fields.ACCESSION_NUMBER)) return;
          if (++rows > plan.maxRows)
            throw new Error('Holdings row cap exceeded; no truncated publication');
          archive.selected[table].push(
            capturedInsiderRow(
              Object.fromEntries(holdingsColumns[table].map((k) => [k, fields[k] ?? ''])),
              row,
            ),
          );
        },
        1_500_000_000,
        (n) => console.log(`  ${n.toLocaleString()} ${table} rows scanned`),
        { delimiter: '\t', quote: false, allowEmpty: true },
      );
      if (holdingsColumns[table].some((k) => !receipt.headers.includes(k)))
        throw new Error(`Missing SEC 13F ${table} columns`);
      archive.tables.push({ ...receipt, selected: archive.selected[table].length });
    }
    input.archives.push(archive);
  }
  await writeAtomic(join(workspace, 'acquisition.json'), input);
  return input;
}

export function assembleHoldingSnapshot(filings: HoldingFiling[], rows: Map<string, Row[]>) {
  if (!filings.length) throw new Error('Empty snapshot');
  const ordered = [...filings].sort(
    (a, b) =>
      a.filed.localeCompare(b.filed) ||
      (a.amendmentNo ?? 0) - (b.amendmentNo ?? 0) ||
      a.accession.localeCompare(b.accession),
  );
  const first = ordered[0],
    latest = ordered.at(-1)!;
  if (ordered.some((f) => f.cik !== first.cik || f.period !== first.period))
    throw new Error('Snapshot identity mismatch');
  const issues: string[] = [],
    cautions: string[] = [];
  const originals = ordered.filter((f) => f.amendment === 'original');
  const amendments = ordered.filter((f) => f.amendment !== 'original');
  if (amendments.some((f) => f.amendment === 'unknown' || !f.amendmentNo))
    issues.push('Unknown amendment type or missing amendment number.');
  const nums = amendments.map((f) => f.amendmentNo);
  if (new Set(nums).size !== nums.length) issues.push('Duplicate amendment numbers.');
  if (amendments.some((f, i) => i > 0 && f.amendmentNo! < amendments[i - 1].amendmentNo!))
    issues.push('Amendment numbering conflicts with filing chronology.');
  const restatement = amendments.filter((f) => f.amendment === 'restatement').at(-1);
  let active: HoldingFiling[] = [];
  if (restatement) {
    active = [restatement];
    if (originals.length !== 1)
      cautions.push(
        'A complete restatement is available; the original filing history is incomplete or ambiguous in these archives.',
      );
  } else if (originals.length === 1) active = [originals[0]];
  else
    issues.push(
      originals.length
        ? 'Multiple originals without a resolving restatement.'
        : 'Original holdings report is absent from collected archives.',
    );
  let number = restatement?.amendmentNo ?? 0;
  for (const f of amendments.filter(
    (f) => !restatement || f.amendmentNo! > restatement.amendmentNo!,
  )) {
    if (f.amendmentNo !== number + 1)
      issues.push('Missing amendment in the active amendment chain.');
    if (f.amendment === 'addition') active.push(f);
    number = f.amendmentNo ?? number;
  }
  if (active.some((f) => f.filed < active[0].filed))
    issues.push('Amendment predates its base report.');
  for (const f of active) issues.push(...f.issues.map((i) => `${f.accession}: ${i}`));
  const notice = active.some((f) => f.form.startsWith('13F-NT') || f.reportType === '13F NOTICE');
  if (notice)
    cautions.push(
      'Notice: holdings are reported by another manager. Absence here is not an empty portfolio.',
    );
  if (active.some((f) => f.reportType === '13F COMBINATION REPORT'))
    cautions.push('Combination report: only this manager’s reported portion is included.');
  if (active.some((f) => f.confidential === true))
    cautions.push(
      'Confidential holdings were omitted in at least one active filing; later releases may not resolve all omissions.',
    );
  if (active.some((f) => f.confidential === null) && !notice)
    cautions.push('Confidential-omission status is unspecified in an active filing.');
  if (active.some((f) => f.confidentialRelease === true))
    cautions.push(
      'Includes a later disclosure of previously confidential holdings, not a new trade on the filing date.',
    );
  const status: HoldingSnapshot['status'] = issues.length
    ? 'unresolved'
    : notice
      ? 'notice'
      : 'reported';
  const grouped = new Map<string, HoldingPosition>();
  // Unresolved raw filings remain inspectable, but do not acquire a fabricated combined portfolio.
  if (status === 'reported')
    for (const f of active)
      for (const [index, row] of (rows.get(f.accession) ?? []).entries()) {
        const r = row.fields,
          unit = r.SSHPRNAMTTYPE as 'SH' | 'PRN',
          option = r.PUTCALL as '' | 'Put' | 'Call';
        const key = `${r.CUSIP}|${unit}|${option}`;
        const p = grouped.get(key) ?? {
          key,
          cusip: r.CUSIP,
          unit,
          option,
          names: [],
          classes: [],
          quantity: '0',
          value: '0',
          refs: [],
        };
        if (!p.names.includes(r.NAMEOFISSUER)) p.names.push(r.NAMEOFISSUER);
        if (!p.classes.includes(r.TITLEOFCLASS)) p.classes.push(r.TITLEOFCLASS);
        p.quantity = amountAdd(p.quantity, r.SSHPRNAMT);
        p.value = amountAdd(p.value, valueDollars(r.VALUE, f.filed));
        p.refs.push({ accession: f.accession, index });
        grouped.set(key, p);
      }
  const positions = [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key));
  const value = positions.reduce((sum, p) => amountAdd(sum, p.value), '0');
  if (positions.some((p) => p.classes.length > 1))
    cautions.push(
      'Some identical CUSIP/unit/option keys have different as-filed class descriptions; inspect the original rows.',
    );
  if (positions.some((p) => amountCompare(p.value, '0') < 0))
    cautions.push('Negative as-filed values make concentration percentages unavailable.');
  const top = positions
    .slice()
    .sort((a, b) => amountCompare(b.value, a.value))
    .slice(0, 10)
    .reduce((sum, p) => amountAdd(sum, p.value), '0');
  const id = `${first.cik}-${first.period}`;
  const snapshot = holdingSnapshotSchema.parse({
    id,
    cik: first.cik,
    period: first.period,
    name: latest.name,
    city: latest.city,
    state: latest.state,
    filedThrough: latest.filed,
    filings: ordered.map((f) => f.accession),
    activeFilings: active.map((f) => f.accession),
    status,
    issues: [...new Set(issues)],
    cautions,
    positions: positions.length,
    rows: status === 'reported' ? active.reduce((s, f) => s + f.rows, 0) : 0,
    value,
    topTenWeight:
      status === 'reported' && !positions.some((p) => amountCompare(p.value, '0') < 0)
        ? holdingWeight(top, value)
        : null,
    positionsHash: hash(encodeHoldingPositions(id, positions)),
  });
  return { snapshot, positions };
}

export function buildHoldings(value: unknown, previous: HoldingsData | null = null) {
  const input = holdingsInputSchema.parse(value),
    { plan } = input;
  scope(plan, previous);
  if (
    input.archives.length !== plan.archives.length ||
    new Set(input.archives.map((a) => a.id)).size !== input.archives.length
  )
    throw new Error('Incomplete SEC 13F archive coverage');
  const filings: HoldingFiling[] = [],
    details: HoldingDetail[] = [],
    allRows = new Map<string, Row[]>(),
    attachments: Record<string, unknown> = {};
  let rowCount = 0;
  for (const archive of [...input.archives].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!plan.archives.some((a) => a.id === archive.id && a.url === archive.source.url))
      throw new Error('SEC 13F archive source mismatch');
    const old = previous?.archives.find((a) => a.id === archive.id);
    if (
      old &&
      (old.source.observedAt > archive.source.observedAt ||
        (old.source.observedAt === archive.source.observedAt &&
          hash(old.source) !== hash(archive.source)))
    )
      throw new Error('Stale or changed SEC capture');
    if (archive.tables.length !== holdingsTables.length)
      throw new Error('Incomplete SEC 13F table coverage');
    for (const t of holdingsTables) {
      const receipts = archive.tables.filter((r) => r.member === `${t}.tsv`),
        selected = archive.selected[t];
      if (
        receipts.length !== 1 ||
        receipts[0].selected !== selected.length ||
        new Set(selected.map((r) => r.row)).size !== selected.length ||
        holdingsColumns[t].some((k) => !receipts[0].headers.includes(k)) ||
        new Set(receipts[0].headers).size !== receipts[0].headers.length
      )
        throw new Error('SEC 13F table coverage mismatch');
      for (const r of selected) {
        if (++rowCount > plan.maxRows) throw new Error('Holdings row cap exceeded');
        if (
          r.row > receipts[0].rows ||
          hash(r.fields) !== r.hash ||
          Object.keys(r.fields).length !== holdingsColumns[t].length ||
          holdingsColumns[t].some((k) => !(k in r.fields))
        )
          throw new Error('SEC 13F row integrity / privacy projection failure');
      }
    }
    const children = new Map<string, Record<HoldingsTable, Row[]>>();
    for (const row of archive.selected.SUBMISSION) {
      const id = row.fields.ACCESSION_NUMBER;
      if (children.has(id) || allRows.has(id) || !plan.managers.includes(cik(row.fields.CIK)))
        throw new Error('Duplicate or out-of-scope 13F submission');
      children.set(
        id,
        Object.fromEntries(holdingsTables.map((t) => [t, []])) as unknown as Record<
          HoldingsTable,
          Row[]
        >,
      );
    }
    for (const t of holdingsTables)
      for (const row of archive.selected[t]) {
        const group = children.get(row.fields.ACCESSION_NUMBER);
        if (!group) throw new Error('Foreign SEC 13F child row');
        group[t].push(row);
      }
    for (const [accession, g] of children) {
      if (filings.length >= plan.maxFilings) throw new Error('Holdings filing cap exceeded');
      if (g.COVERPAGE.length !== 1 || g.SUMMARYPAGE.length > 1)
        throw new Error('Missing/duplicate SEC cover or summary');
      for (const [t, key] of [
        ['INFOTABLE', 'INFOTABLE_SK'],
        ['OTHERMANAGER', 'OTHERMANAGER_SK'],
        ['OTHERMANAGER2', 'SEQUENCENUMBER'],
      ] as const)
        if (new Set(g[t].map((r) => r.fields[key])).size !== g[t].length)
          throw new Error('Duplicate SEC 13F child key');
      const sub = g.SUBMISSION[0],
        cover = g.COVERPAGE[0],
        summary = g.SUMMARYPAGE[0] ?? null,
        s = sub.fields,
        c = cover.fields;
      const filed = insiderDate(s.FILING_DATE)!,
        period = insiderDate(s.PERIODOFREPORT)!,
        issues: string[] = [];
      if (insiderDate(c.REPORTCALENDARORQUARTER) !== period)
        issues.push('Cover and submission report dates disagree.');
      if (filed < period) issues.push('Filing date precedes report date.');
      const amendment: HoldingFiling['amendment'] = !s.SUBMISSIONTYPE.endsWith('/A')
        ? 'original'
        : c.AMENDMENTTYPE === 'RESTATEMENT'
          ? 'restatement'
          : c.AMENDMENTTYPE === 'NEW HOLDINGS'
            ? 'addition'
            : 'unknown';
      if (
        (holdingsBoolean(c.ISAMENDMENT) === true && amendment === 'original') ||
        (holdingsBoolean(c.ISAMENDMENT) === false && amendment !== 'original')
      )
        issues.push('Form and amendment checkbox disagree.');
      if (!['13F HOLDINGS REPORT', '13F COMBINATION REPORT', '13F NOTICE'].includes(c.REPORTTYPE))
        issues.push('Unknown report type.');
      if (s.SUBMISSIONTYPE.startsWith('13F-NT') !== (c.REPORTTYPE === '13F NOTICE'))
        issues.push('Form and report type disagree.');
      const amendmentNo = count(c.AMENDMENTNO);
      if (amendment === 'original' && (amendmentNo !== null || clean(c.AMENDMENTTYPE)))
        issues.push('Original form contains amendment metadata.');
      let reportedValue = '0';
      const rows = g.INFOTABLE.sort((a, b) => a.row - b.row);
      for (const row of rows) {
        const r = row.fields;
        if (
          !/^[A-Za-z0-9*@#]{9}$/.test(r.CUSIP) ||
          !['SH', 'PRN'].includes(r.SSHPRNAMTTYPE) ||
          !['', 'Put', 'Call'].includes(r.PUTCALL)
        )
          issues.push('Unrecognized security key, quantity unit or option type.');
        // Validate exact arithmetic without assuming an invalid row is zero.
        amountAdd(r.SSHPRNAMT, '0');
        reportedValue = amountAdd(reportedValue, valueDollars(r.VALUE, filed));
        for (const key of ['VOTING_AUTH_SOLE', 'VOTING_AUTH_SHARED', 'VOTING_AUTH_NONE'])
          amountAdd(r[key], '0');
        if (amountCompare(r.SSHPRNAMT, '0') < 0) issues.push('Negative reported quantity.');
        for (const ref of r.OTHERMANAGER.split(/[,;\s]+/).filter(Boolean))
          if (!g.OTHERMANAGER2.some((m) => m.fields.SEQUENCENUMBER === ref))
            issues.push('Unresolved included-manager reference.');
      }
      const declaredRows = count(summary?.fields.TABLEENTRYTOTAL),
        declaredValue = clean(summary?.fields.TABLEVALUETOTAL)
          ? valueDollars(summary!.fields.TABLEVALUETOTAL, filed)
          : null;
      if (
        !s.SUBMISSIONTYPE.startsWith('13F-NT') &&
        (declaredRows === null || declaredValue === null)
      )
        issues.push('Missing information-table summary totals.');
      if (declaredRows !== null && declaredRows !== rows.length)
        issues.push('Information-table row count does not reconcile with summary.');
      if (declaredValue !== null && amountCompare(declaredValue, reportedValue) !== 0)
        issues.push('Information-table value does not reconcile with summary.');
      if (s.SUBMISSIONTYPE.startsWith('13F-NT') && rows.length)
        issues.push('Notice unexpectedly contains information-table rows.');
      const included = count(summary?.fields.OTHERINCLUDEDMANAGERSCOUNT);
      if (included !== null && included !== g.OTHERMANAGER2.length)
        issues.push('Included-manager count does not reconcile with summary.');
      const filing = holdingFilingSchema.parse({
        accession,
        archive: archive.id,
        cik: cik(s.CIK),
        name: c.FILINGMANAGER_NAME,
        filed,
        period,
        form: s.SUBMISSIONTYPE,
        reportType: c.REPORTTYPE,
        city: clean(c.FILINGMANAGER_CITY),
        state: states.has(c.FILINGMANAGER_STATEORCOUNTRY) ? c.FILINGMANAGER_STATEORCOUNTRY : null,
        amendment,
        amendmentNo,
        confidential: holdingsBoolean(summary?.fields.ISCONFIDENTIALOMITTED),
        confidentialRelease: holdingsBoolean(c.CONFDENIEDEXPIRED),
        declaredRows,
        rows: rows.length,
        declaredValue,
        reportedValue,
        issues: [...new Set(issues)],
        recordHash: hash(g),
      });
      const rowPages: HoldingDetail['rowPages'] = [];
      for (let i = 0; i < rows.length; i += 500) {
        const page = i / 500,
          file = `rows/${accession}-${page}.json`,
          payload = { accession, page, rows: rows.slice(i, i + 500) };
        attachments[file] = payload;
        rowPages.push({ file, hash: hash(payload), count: payload.rows.length });
      }
      const detail = holdingDetailSchema.parse({
        filing,
        submission: sub,
        cover,
        summary,
        reportingFor: g.OTHERMANAGER,
        includedManagers: g.OTHERMANAGER2,
        rowPages,
      });
      details.push(detail);
      filings.push(filing);
      allRows.set(accession, rows);
      attachments[`filings/${accession}.json`] = detail;
    }
  }
  if (previous?.filings.some((f) => !allRows.has(f.accession)))
    throw new Error('Previously collected 13F filing disappeared');
  filings.sort(
    (a, b) =>
      a.cik.localeCompare(b.cik) ||
      a.period.localeCompare(b.period) ||
      a.filed.localeCompare(b.filed) ||
      a.accession.localeCompare(b.accession),
  );
  const groups = new Map<string, HoldingFiling[]>();
  for (const f of filings) {
    const k = `${f.cik}-${f.period}`;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  const snapshots: HoldingSnapshot[] = [];
  for (const group of groups.values()) {
    const { snapshot, positions } = assembleHoldingSnapshot(group, allRows);
    snapshots.push(snapshot);
    attachments[`positions/${snapshot.id}.json`] = encodeHoldingPositions(snapshot.id, positions);
  }
  const observedAt = input.archives
    .map((a) => a.source.observedAt)
    .sort()
    .at(-1)!;
  const old = new Map(previous?.filings.map((f) => [f.accession, f.recordHash]) ?? []);
  const data = holdingsDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'holdings-v2',
    plan,
    observedAt,
    archives: input.archives.map(({ id, source, tables }) => ({ id, source, tables })),
    filings,
    snapshots,
    changes: {
      baselineAt: previous?.observedAt ?? null,
      added: filings.filter((f) => !old.has(f.accession)).map((f) => f.accession),
      updated: filings
        .filter((f) => old.has(f.accession) && old.get(f.accession) !== f.recordHash)
        .map((f) => f.accession),
    },
  });
  if (previous?.observedAt === observedAt) {
    const sameVersion = previous.pipelineVersion === data.pipelineVersion;
    const comparable = (d: HoldingsData) =>
      sameVersion
        ? { ...d, changes: undefined }
        : { plan: d.plan, archives: d.archives, filings: d.filings };
    if (hash(comparable(data)) !== hash(comparable(previous)))
      throw new Error('SEC 13F evidence changed at same capture');
    data.changes = previous.changes;
  }
  return { data, details, attachments };
}
export async function runHoldings(options: {
  plan?: unknown;
  input?: unknown;
  workspace: string;
  output: string;
  offline?: boolean;
}) {
  return withLock(options.workspace, async () => {
    let previous: HoldingsData | null = null,
      expected: string | null = null;
    try {
      const manifest = JSON.parse(await readFile(join(options.output, 'manifest.json'), 'utf8'));
      if (!/^hf-[a-f0-9]{24}$/.test(manifest.release)) throw new Error('Invalid holdings release');
      expected = manifest.release;
      const raw = JSON.parse(
        await readFile(join(options.output, 'releases', expected!, 'data.json'), 'utf8'),
      );
      if (hash(raw) !== manifest.dataHash || expected !== `hf-${hash(raw).slice(0, 24)}`)
        throw new Error('Holdings prior hash mismatch');
      previous = holdingsDataSchema.parse(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || expected) throw e;
    }
    const input =
      options.input ??
      (await acquireHoldings(
        holdingsPlanSchema.parse(options.plan),
        options.workspace,
        options.offline,
        previous,
      ));
    await writeAtomic(join(options.workspace, 'input.json'), input);
    const { data, attachments } = buildHoldings(input, previous);
    const manifest = await publishSnapshot(data, options.output, 'hf', expected, attachments);
    await writeAtomic(join(options.workspace, 'last-run.json'), {
      release: manifest.release,
      observedAt: data.observedAt,
      filings: data.filings.length,
      snapshots: data.snapshots.length,
    });
    return {
      release: manifest.release,
      filings: data.filings.length,
      snapshots: data.snapshots.map((s) => ({
        manager: s.name,
        period: s.period,
        status: s.status,
        positions: s.positions,
        issues: s.issues,
      })),
    };
  });
}
