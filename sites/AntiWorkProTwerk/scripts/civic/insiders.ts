import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from '../said-did/engine';
import { writeAtomic, withLock } from '../said-did/pipeline';
import { publishSnapshot } from './snapshots';
import { scanZipCsv } from './zip-csv';
import { acquireInsiderFile, insiderArchiveUrl, insiderIssuerUrl } from './insider-source';
import {
  insiderPlanSchema,
  insiderSourceSchema,
  insiderRowSchema,
  insiderDataSchema,
  insiderDetailSchema,
  insiderIssuerSchema,
  secCik,
  insiderQuarter,
  explainInsiderCode,
  type InsiderPlan,
  type InsiderData,
  type InsiderDetail,
  type InsiderRow,
  type InsiderEntry,
} from '../../src/lib/civic/insiders';

export const insiderTables = [
  'SUBMISSION',
  'REPORTINGOWNER',
  'NONDERIV_TRANS',
  'DERIV_TRANS',
  'NONDERIV_HOLDING',
  'DERIV_HOLDING',
  'FOOTNOTES',
] as const;
type Table = (typeof insiderTables)[number];
export const insiderOwnerFields = [
  'ACCESSION_NUMBER',
  'RPTOWNERCIK',
  'RPTOWNERNAME',
  'RPTOWNER_RELATIONSHIP',
  'RPTOWNER_TITLE',
  'RPTOWNER_TXT',
];
const required: Record<Table, string[]> = {
  SUBMISSION: [
    'ACCESSION_NUMBER',
    'FILING_DATE',
    'PERIOD_OF_REPORT',
    'DATE_OF_ORIG_SUB',
    'DOCUMENT_TYPE',
    'ISSUERCIK',
    'ISSUERNAME',
    'ISSUERTRADINGSYMBOL',
    'REMARKS',
  ],
  REPORTINGOWNER: insiderOwnerFields,
  NONDERIV_TRANS: [
    'ACCESSION_NUMBER',
    'NONDERIV_TRANS_SK',
    'SECURITY_TITLE',
    'TRANS_CODE',
    'TRANS_DATE',
    'TRANS_SHARES',
    'TRANS_PRICEPERSHARE',
    'TRANS_ACQUIRED_DISP_CD',
  ],
  DERIV_TRANS: [
    'ACCESSION_NUMBER',
    'DERIV_TRANS_SK',
    'SECURITY_TITLE',
    'TRANS_CODE',
    'TRANS_DATE',
    'TRANS_SHARES',
    'TRANS_PRICEPERSHARE',
    'TRANS_ACQUIRED_DISP_CD',
  ],
  NONDERIV_HOLDING: [
    'ACCESSION_NUMBER',
    'NONDERIV_HOLDING_SK',
    'SECURITY_TITLE',
    'SHRS_OWND_FOLWNG_TRANS',
  ],
  DERIV_HOLDING: [
    'ACCESSION_NUMBER',
    'DERIV_HOLDING_SK',
    'SECURITY_TITLE',
    'SHRS_OWND_FOLWNG_TRANS',
  ],
  FOOTNOTES: ['ACCESSION_NUMBER', 'FOOTNOTE_ID', 'FOOTNOTE_TXT'],
};
const tableSchema = z.object({
  member: z.string(),
  rows: z.number().int().nonnegative(),
  selected: z.number().int().nonnegative(),
  headers: z.array(z.string()),
});
const selectedSchema = z.object(
  Object.fromEntries(insiderTables.map((t) => [t, z.array(insiderRowSchema)])) as Record<
    Table,
    z.ZodArray<typeof insiderRowSchema>
  >,
);
const archiveSchema = z.object({
  quarter: insiderQuarter,
  source: insiderSourceSchema,
  tables: z.array(tableSchema),
  selected: selectedSchema,
});
export const insiderInputSchema = z.object({
  formatVersion: z.literal(1),
  plan: insiderPlanSchema,
  archives: z.array(archiveSchema),
  issuers: z.array(insiderIssuerSchema),
});
export type InsiderInput = z.infer<typeof insiderInputSchema>;
const clean = (v: string | undefined) => v?.trim() || null;
const cik = (v: string | number) => secCik.parse(String(v).padStart(10, '0'));
export const capturedInsiderRow = (fields: Record<string, string>, row: number): InsiderRow => ({
  row,
  fields,
  hash: hash(fields),
});
export function insiderDate(value: string | undefined) {
  if (!clean(value)) return null;
  const m = /^(\d{2})-([A-Z]{3})-(\d{4})$/.exec(value!);
  const months = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];
  if (!m || !months.includes(m[2])) throw new Error(`Invalid SEC date: ${value}`);
  return z
    .string()
    .date()
    .parse(`${m[3]}-${String(months.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1]}`);
}
export function insiderBoolean(value: string | undefined) {
  const v = clean(value)?.toLowerCase();
  if (!v) return null;
  if (['1', 'true'].includes(v)) return true;
  if (['0', 'false'].includes(v)) return false;
  throw new Error('Unknown SEC checkbox value');
}
function assertScope(plan: InsiderPlan, previous: InsiderData | null) {
  for (const q of plan.quarters) insiderArchiveUrl(q.quarter, q.url);
  if (
    previous &&
    (previous.plan.id !== plan.id ||
      previous.plan.issuers.some((id) => !plan.issuers.includes(id)) ||
      previous.plan.quarters.some(
        (q) => !plan.quarters.some((next) => next.quarter === q.quarter && next.url === q.url),
      ))
  )
    throw new Error(
      'Insider refresh must retain earlier issuers and quarter archives; use isolated output for a different scope',
    );
}
const usStates = new Set(
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(
    ' ',
  ),
);
export async function acquireInsiders(
  plan: InsiderPlan,
  workspace: string,
  offline = false,
  previous: InsiderData | null = null,
  fetcher: typeof fetch = fetch,
): Promise<InsiderInput> {
  assertScope(plan, previous);
  const input: InsiderInput = { formatVersion: 1, plan, archives: [], issuers: [] };
  let totalFilings = 0;
  for (const quarter of [...plan.quarters].sort((a, b) => a.quarter.localeCompare(b.quarter))) {
    const { source, path } = await acquireInsiderFile(workspace, quarter, offline, fetcher);
    const archive = {
      quarter: quarter.quarter,
      source,
      tables: [] as z.infer<typeof tableSchema>[],
      selected: Object.fromEntries(
        insiderTables.map((t) => [t, []]),
      ) as unknown as InsiderInput['archives'][number]['selected'],
    };
    const selected = new Set<string>();
    for (const table of insiderTables) {
      console.log(`Scanning SEC ${quarter.quarter} ${table}…`);
      const receipt = await scanZipCsv(
        path,
        `${table}.tsv`,
        (fields, row) => {
          if (table === 'SUBMISSION') {
            if (!plan.issuers.includes(cik(fields.ISSUERCIK))) return;
            selected.add(fields.ACCESSION_NUMBER);
            if (++totalFilings > plan.maxFilings)
              throw new Error('Insider filing limit exceeded; narrow explicit scope');
          } else if (!selected.has(fields.ACCESSION_NUMBER)) return;
          const projection =
            table === 'REPORTINGOWNER'
              ? Object.fromEntries(insiderOwnerFields.map((k) => [k, fields[k] ?? '']))
              : fields;
          archive.selected[table].push(capturedInsiderRow(projection, row));
          if (archive.selected[table].length > 500000)
            throw new Error('Insider selected row cap exceeded');
        },
        500_000_000,
        undefined,
        { delimiter: '\t', quote: false, allowEmpty: true },
      );
      if (required[table].some((k) => !receipt.headers.includes(k)))
        throw new Error(`Missing SEC ${table} columns`);
      archive.tables.push({ ...receipt, selected: archive.selected[table].length });
    }
    input.archives.push(archive);
  }
  for (const id of [...plan.issuers].sort()) {
    const { source, path } = await acquireInsiderFile(workspace, { cik: id }, offline, fetcher);
    const raw = JSON.parse(await readFile(path, 'utf8'));
    if (cik(raw.cik) !== id || typeof raw.name !== 'string' || !Array.isArray(raw.tickers))
      throw new Error('SEC issuer identity mismatch');
    const business = raw.addresses?.business;
    input.issuers.push(
      insiderIssuerSchema.parse({
        cik: id,
        name: raw.name,
        tickers: raw.tickers,
        city: clean(business?.city),
        state: usStates.has(business?.stateOrCountry) ? business.stateOrCountry : null,
        stateDescription: clean(business?.stateOrCountryDescription),
        source,
      }),
    );
  }
  await writeAtomic(join(workspace, 'acquisition.json'), input);
  return input;
}
export function buildInsiders(value: unknown, previous: InsiderData | null = null) {
  const input = insiderInputSchema.parse(value),
    { plan } = input;
  assertScope(plan, previous);
  if (
    input.archives.length !== plan.quarters.length ||
    new Set(input.archives.map((a) => a.quarter)).size !== input.archives.length ||
    input.issuers.length !== plan.issuers.length ||
    new Set(input.issuers.map((i) => i.cik)).size !== input.issuers.length ||
    plan.issuers.some((id) => !input.issuers.some((i) => i.cik === id))
  )
    throw new Error('Incomplete SEC archive/issuer coverage');
  for (const issuer of input.issuers) {
    if (
      issuer.source.url !== insiderIssuerUrl(issuer.cik) ||
      (issuer.state && !usStates.has(issuer.state))
    )
      throw new Error('Invalid SEC issuer source/geography');
    const old = previous?.issuers.find((i) => i.cik === issuer.cik);
    if (
      old &&
      (old.source.observedAt > issuer.source.observedAt ||
        (old.source.observedAt === issuer.source.observedAt && hash(old) !== hash(issuer)))
    )
      throw new Error('Stale or changed SEC issuer capture');
  }
  const details: InsiderDetail[] = [],
    accessions = new Set<string>();
  for (const archive of [...input.archives].sort((a, b) => a.quarter.localeCompare(b.quarter))) {
    const scope = plan.quarters.find((q) => q.quarter === archive.quarter);
    if (!scope || scope.url !== archive.source.url) throw new Error('SEC quarter source mismatch');
    const old = previous?.archives.find((a) => a.quarter === archive.quarter);
    if (
      old &&
      (old.source.observedAt > archive.source.observedAt ||
        (old.source.observedAt === archive.source.observedAt &&
          hash(old.source) !== hash(archive.source)))
    )
      throw new Error('Stale or changed SEC archive capture');
    if (archive.tables.length !== insiderTables.length)
      throw new Error('Unexpected SEC table coverage');
    for (const table of insiderTables) {
      const receipts = archive.tables.filter((t) => t.member === `${table}.tsv`),
        rows = archive.selected[table];
      if (
        receipts.length !== 1 ||
        receipts[0].selected !== rows.length ||
        new Set(rows.map((r) => r.row)).size !== rows.length ||
        new Set(receipts[0].headers).size !== receipts[0].headers.length ||
        required[table].some((k) => !receipts[0].headers.includes(k))
      )
        throw new Error(`SEC ${table} coverage mismatch`);
      for (const row of rows) {
        if (
          row.row > receipts[0].rows ||
          hash(row.fields) !== row.hash ||
          required[table].some((k) => !(k in row.fields)) ||
          Object.keys(row.fields).some((k) => !receipts[0].headers.includes(k))
        )
          throw new Error(`SEC ${table} row integrity failure`);
        if (
          table === 'REPORTINGOWNER' &&
          Object.keys(row.fields).some((k) => !insiderOwnerFields.includes(k))
        )
          throw new Error('Unprojected reporting-owner address/contact field');
      }
    }
    const submissions = new Map<string, InsiderRow>();
    for (const row of archive.selected.SUBMISSION) {
      const id = row.fields.ACCESSION_NUMBER;
      if (accessions.has(id) || !plan.issuers.includes(cik(row.fields.ISSUERCIK)))
        throw new Error('Duplicate or out-of-scope SEC submission');
      accessions.add(id);
      submissions.set(id, row);
    }
    const grouped = new Map<string, Record<Exclude<Table, 'SUBMISSION'>, InsiderRow[]>>();
    for (const id of submissions.keys())
      grouped.set(id, {
        REPORTINGOWNER: [],
        NONDERIV_TRANS: [],
        DERIV_TRANS: [],
        NONDERIV_HOLDING: [],
        DERIV_HOLDING: [],
        FOOTNOTES: [],
      });
    for (const table of insiderTables)
      if (table !== 'SUBMISSION')
        for (const row of archive.selected[table]) {
          const group = grouped.get(row.fields.ACCESSION_NUMBER);
          if (!group) throw new Error('Foreign SEC child row');
          group[table].push(row);
        }
    for (const [accession, submission] of submissions) {
      const f = submission.fields,
        group = grouped.get(accession)!;
      const owners = group.REPORTINGOWNER.sort((a, b) => a.row - b.row).map((r) => ({
        cik: cik(r.fields.RPTOWNERCIK),
        name: r.fields.RPTOWNERNAME,
        relationship: r.fields.RPTOWNER_RELATIONSHIP,
        title: clean(r.fields.RPTOWNER_TITLE),
        other: clean(r.fields.RPTOWNER_TXT),
      }));
      if (new Set(owners.map((o) => o.cik)).size !== owners.length)
        throw new Error('Duplicate reporting-owner identity');
      const notes = new Map<string, string>();
      for (const r of group.FOOTNOTES.sort((a, b) => a.row - b.row)) {
        const id = r.fields.FOOTNOTE_ID;
        if (!id || notes.has(id)) throw new Error('Duplicate or missing SEC footnote ID');
        notes.set(id, r.fields.FOOTNOTE_TXT);
      }
      const entries: InsiderEntry[] = [];
      for (const table of [
        'NONDERIV_TRANS',
        'DERIV_TRANS',
        'NONDERIV_HOLDING',
        'DERIV_HOLDING',
      ] as const) {
        const seen = new Set<string>();
        for (const row of group[table].sort((a, b) => a.row - b.row)) {
          const r = row.fields,
            id = r[`${table}_SK`],
            transaction = table.endsWith('_TRANS'),
            code = transaction ? clean(r.TRANS_CODE) : null;
          if (seen.has(id)) throw new Error('Duplicate SEC table row identity');
          seen.add(id);
          // Numeric values remain exact strings. No assumed currency, aggregation or precision loss.
          for (const key of [
            'TRANS_SHARES',
            'TRANS_PRICEPERSHARE',
            'TRANS_TOTAL_VALUE',
            'SHRS_OWND_FOLWNG_TRANS',
            'VALU_OWND_FOLWNG_TRANS',
            'CONV_EXERCISE_PRICE',
            'UNDLYNG_SEC_SHARES',
            'UNDLYNG_SEC_VALUE',
          ])
            if (clean(r[key]) && !/^-?\d+(?:\.\d+)?$/.test(r[key]))
              throw new Error(`Invalid SEC numeric field ${key}`);
          entries.push({
            id,
            table,
            security: r.SECURITY_TITLE,
            code,
            date: transaction ? insiderDate(r.TRANS_DATE) : null,
            kind: transaction ? explainInsiderCode(code).kind : null,
            fields: row,
            footnotes: Object.entries(r)
              .filter(([key, value]) => key.endsWith('_FN') && clean(value))
              .flatMap(([field, value]) =>
                [...new Set(value.trim().split(/[,\s]+/))].map((id) => ({
                  field: field.slice(0, -3),
                  id,
                  text: notes.get(id) ?? null,
                })),
              ),
          });
        }
      }
      const filing = {
        accession,
        quarter: archive.quarter,
        issuerCik: cik(f.ISSUERCIK),
        issuerName: f.ISSUERNAME,
        symbol: clean(f.ISSUERTRADINGSYMBOL),
        filed: insiderDate(f.FILING_DATE),
        period: insiderDate(f.PERIOD_OF_REPORT),
        originalFiled: insiderDate(f.DATE_OF_ORIG_SUB),
        form: f.DOCUMENT_TYPE,
        tradingPlan: insiderBoolean(f.AFF10B5ONE),
        owners,
        codes: [...new Set(entries.filter((e) => e.kind).map((e) => e.code ?? ''))].sort(),
        transactions: {
          nonDerivative: group.NONDERIV_TRANS.length,
          derivative: group.DERIV_TRANS.length,
        },
        holdings: {
          nonDerivative: group.NONDERIV_HOLDING.length,
          derivative: group.DERIV_HOLDING.length,
        },
        recordHash: hash({ submission, group }),
      };
      details.push(
        insiderDetailSchema.parse({
          filing,
          submission,
          owners: group.REPORTINGOWNER,
          entries,
          footnotes: group.FOOTNOTES,
        }),
      );
    }
  }
  details.sort(
    (a, b) =>
      b.filing.filed.localeCompare(a.filing.filed) ||
      a.filing.accession.localeCompare(b.filing.accession),
  );
  if (previous?.filings.some((f) => !accessions.has(f.accession)))
    throw new Error('Previously collected SEC filing disappeared');
  const observedAt = [
    ...input.archives.map((a) => a.source.observedAt),
    ...input.issuers.map((i) => i.source.observedAt),
  ]
    .sort()
    .at(-1)!;
  const old = new Map(previous?.filings.map((f) => [f.accession, f.recordHash]) ?? []);
  const data = insiderDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'insiders-v1',
    plan,
    observedAt,
    archives: input.archives.map(({ quarter, source, tables }) => ({ quarter, source, tables })),
    issuers: input.issuers,
    filings: details.map((d) => d.filing),
    changes: {
      baselineAt: previous?.observedAt ?? null,
      added: details.filter((d) => !old.has(d.filing.accession)).map((d) => d.filing.accession),
      updated: details
        .filter(
          (d) => old.has(d.filing.accession) && old.get(d.filing.accession) !== d.filing.recordHash,
        )
        .map((d) => d.filing.accession),
    },
  });
  if (previous?.observedAt === observedAt) {
    if (hash({ ...data, changes: undefined }) !== hash({ ...previous, changes: undefined }))
      throw new Error('SEC evidence changed at same capture');
    data.changes = previous.changes;
  }
  return { data, details };
}
export async function runInsiders(options: {
  plan?: unknown;
  input?: unknown;
  workspace: string;
  output: string;
  offline?: boolean;
}) {
  return withLock(options.workspace, async () => {
    let previous: InsiderData | null = null,
      expected: string | null = null;
    try {
      const manifest = JSON.parse(await readFile(join(options.output, 'manifest.json'), 'utf8'));
      if (!/^it-[a-f0-9]{24}$/.test(manifest.release)) throw new Error('Invalid insider release');
      expected = manifest.release;
      const raw = JSON.parse(
        await readFile(join(options.output, 'releases', expected!, 'data.json'), 'utf8'),
      );
      if (hash(raw) !== manifest.dataHash || expected !== `it-${hash(raw).slice(0, 24)}`)
        throw new Error('Insider prior hash mismatch');
      previous = insiderDataSchema.parse(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || expected) throw e;
    }
    const input =
      options.input ??
      (await acquireInsiders(
        insiderPlanSchema.parse(options.plan),
        options.workspace,
        options.offline,
        previous,
      ));
    const { data, details } = buildInsiders(input, previous);
    await writeAtomic(join(options.workspace, 'input.json'), input);
    const manifest = await publishSnapshot(
      data,
      options.output,
      'it',
      expected,
      Object.fromEntries(details.map((d) => [`filings/${d.filing.accession}.json`, d])),
    );
    return {
      release: manifest.release,
      dataHash: manifest.dataHash,
      filings: data.filings.length,
      issuers: data.issuers.length,
      nonDerivativeTransactions: details.reduce(
        (n, d) => n + d.filing.transactions.nonDerivative,
        0,
      ),
      derivativeTransactions: details.reduce((n, d) => n + d.filing.transactions.derivative, 0),
      forms: Object.fromEntries(
        [...new Set(data.filings.map((f) => f.form))].map((form) => [
          form,
          data.filings.filter((f) => f.form === form).length,
        ]),
      ),
    };
  });
}
