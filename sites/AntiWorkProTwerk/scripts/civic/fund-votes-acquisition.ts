import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acquireSecFile } from './sec-source';
import {
  captureSecSubmissions,
  secCaptureSchema,
  secHistoryFileSchema,
  secSubmissionRows,
  secSubmissionsUrl,
  validateSecCapture,
  type SecCapture,
  type SecSubmissionRow,
} from './sec-submissions';
import { secDirectory, secDocumentUrl, secXmlDocuments } from './sec-filing-index';
import { parseFundVoteCover, parseFundVoteRecord, proxyXmlRows } from './fund-vote-parser';
import {
  fundVotePlanSchema,
  type FundVotePlan,
  type FundVoteCover,
  type FundVoteEvidence,
} from '../../src/lib/civic/fund-votes';
import { hash } from '../said-did/engine';

export const fundVoteInputSchema = z.object({
  formatVersion: z.literal(1),
  plan: fundVotePlanSchema,
  captures: z.array(secCaptureSchema.extend({ body: z.string().max(100000000) })).max(10000),
});
export type FundVoteInput = z.infer<typeof fundVoteInputSchema>;
const profileSchema = z.object({
  cik: z.union([z.string(), z.number()]),
  name: z.string(),
  filings: z.object({ recent: z.unknown(), files: z.array(secHistoryFileSchema) }),
});
type Candidate = { cik: string; row: SecSubmissionRow };
const coverName = (r: SecSubmissionRow) => {
  const m = r.primaryDocument.match(/^(?:xslN-PX_X\d+\/)?([A-Za-z0-9][A-Za-z0-9_.-]*\.xml)$/);
  if (!m) throw new Error('N-PX primary document is not supported structured XML');
  return m[1];
};
const coverKey = (c: Candidate) => 'cover-' + c.row.accessionNumber;
const directoryKey = (c: Candidate) => 'directory-' + c.row.accessionNumber;
const indexKey = (c: Candidate) => 'index-' + c.row.accessionNumber;
const voteKey = (c: Candidate, name: string) =>
  'votes-' + c.row.accessionNumber + '-' + hash(name).slice(0, 12);
function fundIndexes(plan: FundVotePlan, captures: SecCapture[], requireAll: boolean) {
  if (new Set(captures.map((c) => c.key)).size !== captures.length)
    throw new Error('Duplicate N-PX capture');
  const used = new Set<string>(),
    missing: { cik: string; file: string }[] = [],
    candidates: Candidate[] = [],
    indexes: { cik: string; key: string; rows: number; source: SecCapture['source'] }[] = [];
  const get = (key: string, url: string) => {
    const c = captures.find((c) => c.key === key);
    if (!c) throw new Error('Missing N-PX index capture');
    used.add(key);
    return validateSecCapture(c, url);
  };
  for (const cik of [...new Set(plan.funds.map((f) => f.cik))].sort()) {
    const capture = get('issuer-' + cik, secSubmissionsUrl(cik)),
      p = profileSchema.parse(JSON.parse(capture.body));
    if (String(p.cik).padStart(10, '0') !== cik)
      throw new Error('N-PX registrant profile identity mismatch');
    if (new Set(p.filings.files.map((f) => f.name)).size !== p.filings.files.length)
      throw new Error('Duplicate N-PX historical index descriptor');
    const rows = secSubmissionRows(p.filings.recent);
    indexes.push({ cik, key: capture.key, rows: rows.length, source: capture.source });
    for (const f of p.filings.files) {
      const url = secSubmissionsUrl(cik, f.name);
      if (f.filingFrom > plan.filedThrough || f.filingTo < plan.period) continue;
      const key = f.name.replace(/\.json$/, '').toLowerCase();
      if (!captures.some((c) => c.key === key)) {
        missing.push({ cik, file: f.name });
        continue;
      }
      const c = get(key, url),
        history = secSubmissionRows(JSON.parse(c.body));
      if (
        history.length !== f.filingCount ||
        history.some((r) => r.filingDate < f.filingFrom || r.filingDate > f.filingTo)
      )
        throw new Error('N-PX historical index count or coverage mismatch');
      rows.push(...history);
      indexes.push({ cik, key, rows: history.length, source: c.source });
    }
    if (new Set(rows.map((r) => r.accessionNumber)).size !== rows.length)
      throw new Error('Overlapping N-PX index pages');
    candidates.push(
      ...rows
        .filter(
          (r) =>
            ['N-PX', 'N-PX/A'].includes(r.form) &&
            r.filingDate >= plan.period &&
            r.filingDate <= plan.filedThrough,
        )
        .map((row) => ({ cik, row })),
    );
  }
  if (new Set(candidates.map((c) => c.row.accessionNumber)).size !== candidates.length)
    throw new Error(
      'Same N-PX accession indexed by multiple selected registrants; resolve identity',
    );
  if (candidates.length > plan.maxFilings || indexes.length + missing.length > plan.maxIndexPages)
    throw new Error('N-PX explicit collection cap exceeded; no truncation');
  if (requireAll && missing.length) throw new Error('Incomplete N-PX historical coverage');
  return {
    used,
    missing,
    candidates: candidates.sort((a, b) =>
      a.row.accessionNumber.localeCompare(b.row.accessionNumber),
    ),
    indexes,
  };
}
function selectedCover(plan: FundVotePlan, candidate: Candidate, cover: FundVoteCover) {
  if (cover.cik !== candidate.cik)
    throw new Error('N-PX cover registrant disagrees with submissions index');
  return (
    cover.period === plan.period &&
    cover.duration === 'YEAR' &&
    plan.funds.some((f) => f.cik === cover.cik && cover.series.some((s) => s.id === f.series))
  );
}
export async function acquireFundVotes(
  value: unknown,
  workspace: string,
  offline = false,
  fetcher: typeof fetch = fetch,
): Promise<FundVoteInput> {
  const plan = fundVotePlanSchema.parse(value),
    captures: SecCapture[] = [],
    directory = join(workspace, 'sources');
  const get = async (key: string, url: string, extension: 'xml' | 'json' | 'html', cap: number) => {
    const r = await acquireSecFile(directory, { key, url, extension, cap }, offline, fetcher),
      c = { key, source: r.source, body: await readFile(r.path, 'utf8') };
    captures.push(c);
    return c;
  };
  for (const cik of [...new Set(plan.funds.map((f) => f.cik))].sort())
    captures.push(await captureSecSubmissions(directory, cik, undefined, offline, fetcher));
  for (const m of fundIndexes(plan, captures, false).missing)
    captures.push(await captureSecSubmissions(directory, m.cik, m.file, offline, fetcher));
  const discovery = fundIndexes(plan, captures, true);
  for (const candidate of discovery.candidates) {
    const { cik, row } = candidate,
      c = await get(
        coverKey(candidate),
        secDocumentUrl(cik, row.accessionNumber, coverName(row)),
        'xml',
        2000000,
      ),
      cover = parseFundVoteCover(row, c);
    if (!selectedCover(plan, candidate, cover)) continue;
    const listing = secDirectory(
      cik,
      row.accessionNumber,
      await get(
        directoryKey(candidate),
        secDocumentUrl(cik, row.accessionNumber, 'index.json'),
        'json',
        2000000,
      ),
    );
    const index = await get(
        indexKey(candidate),
        secDocumentUrl(cik, row.accessionNumber, listing.index),
        'html',
        3000000,
      ),
      documents = secXmlDocuments(cik, row.accessionNumber, index.body, listing.files);
    const primary = documents.find((d) => d.role !== 'PROXY VOTING RECORD')!;
    if (primary.name !== coverName(row) || primary.role !== row.form)
      throw new Error('N-PX primary role mismatch');
    for (const document of documents.filter((d) => d.role === 'PROXY VOTING RECORD'))
      await get(
        voteKey(candidate, document.name),
        secDocumentUrl(cik, row.accessionNumber, document.name),
        'xml',
        plan.maxFileBytes,
      );
  }
  return fundVoteInputSchema.parse({ formatVersion: 1, plan, captures });
}
export function normalizeFundVotes(value: unknown) {
  const input = fundVoteInputSchema.parse(value),
    { plan } = input,
    discovery = fundIndexes(plan, input.captures, true),
    covers: FundVoteCover[] = [],
    evidence: FundVoteEvidence[] = [],
    excluded: { accession: string; reason: string; source: SecCapture['source'] }[] = [],
    tables: { accession: string; file: string; rows: number; source: SecCapture['source'] }[] = [],
    documents: {
      accession: string;
      directory: SecCapture['source'];
      index: SecCapture['source'];
    }[] = [];
  const get = (key: string, url: string) => {
    const c = input.captures.find((c) => c.key === key);
    if (!c) throw new Error('Missing discovered N-PX document');
    discovery.used.add(key);
    return validateSecCapture(c, url);
  };
  let scanned = 0,
    unselectedRows = 0;
  for (const c of discovery.candidates) {
    const { cik, row } = c,
      cover = parseFundVoteCover(
        row,
        get(coverKey(c), secDocumentUrl(cik, row.accessionNumber, coverName(row))),
      );
    if (!selectedCover(plan, c, cover)) {
      excluded.push({
        accession: row.accessionNumber,
        reason: 'Different reporting period, duration or fund series',
        source: cover.source,
      });
      continue;
    }
    if (!['FUND VOTING REPORT', 'FUND NOTICE REPORT'].includes(cover.reportType))
      throw new Error('Expected a fund report, not an institutional-manager-only report');
    covers.push(cover);
    const dir = get(directoryKey(c), secDocumentUrl(cik, row.accessionNumber, 'index.json')),
      listing = secDirectory(cik, row.accessionNumber, dir),
      index = get(indexKey(c), secDocumentUrl(cik, row.accessionNumber, listing.index)),
      files = secXmlDocuments(cik, row.accessionNumber, index.body, listing.files);
    documents.push({ accession: row.accessionNumber, directory: dir.source, index: index.source });
    const primary = files.find((d) => d.role !== 'PROXY VOTING RECORD')!;
    if (primary.name !== coverName(row) || primary.role !== row.form)
      throw new Error('N-PX primary document mismatch');
    const votes = files.filter((d) => d.role === 'PROXY VOTING RECORD');
    if (cover.reportType === 'FUND NOTICE REPORT' && votes.length)
      throw new Error('N-PX fund notice unexpectedly contains voting tables');
    if (cover.reportType === 'FUND VOTING REPORT' && !votes.length)
      throw new Error('N-PX fund voting report is missing its voting table');
    for (const file of votes) {
      const capture = get(
        voteKey(c, file.name),
        secDocumentUrl(cik, row.accessionNumber, file.name),
      );
      let count = 0;
      for (const { raw, ordinal } of proxyXmlRows(capture.body, plan.maxFileBytes)) {
        if (++scanned > plan.maxVotes)
          throw new Error('N-PX vote-row collection cap exceeded; no truncation');
        const record = parseFundVoteRecord(raw, ordinal, file.name, cover);
        count++;
        if (
          record.series &&
          plan.funds.some((f) => f.cik === cover.cik && f.series === record.series)
        )
          evidence.push({ record, source: capture.source, raw });
        else if (!record.series || !cover.series.some((s) => s.id === record.series))
          evidence.push({ record, source: capture.source, raw });
        else unselectedRows++;
      }
      tables.push({
        accession: row.accessionNumber,
        file: file.name,
        rows: count,
        source: capture.source,
      });
    }
  }
  if (discovery.used.size !== input.captures.length)
    throw new Error('Unexpected unscoped N-PX capture');
  if (new Set(evidence.map((e) => e.record.id)).size !== evidence.length)
    throw new Error('Duplicate N-PX row identity');
  return {
    formatVersion: 1 as const,
    pipelineVersion: 'fund-votes-v1' as const,
    plan,
    observedAt: input.captures
      .map((c) => c.source.observedAt)
      .sort()
      .at(-1)!,
    indexes: discovery.indexes,
    covers,
    documents,
    tables,
    excluded,
    evidence,
    scanned,
    unselectedRows,
  };
}
