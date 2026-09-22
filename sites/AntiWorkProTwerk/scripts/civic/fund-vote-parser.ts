import { z } from 'zod';
import { createHash } from 'node:crypto';
import { XMLValidator } from 'fast-xml-parser';
import { hash } from '../said-did/engine';
import { parseXml, decodeEntities } from '../said-did/sources';
import { amountAdd, amountCompare } from '../../src/lib/civic/holdings';
import {
  fundVoteCoverSchema,
  fundVoteRecordSchema,
  fundVoteSecurity,
  type FundVoteCover,
  type FundVoteRecord,
} from '../../src/lib/civic/fund-votes';
import type { SecCapture, SecSubmissionRow } from './sec-submissions';

const array = (v: any): any[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const clean = (v: unknown) =>
  typeof v === 'string' ? decodeEntities(v).replace(/\s+/g, ' ').trim() : '';
function local(v: any): any {
  if (Array.isArray(v)) return v.map(local);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (k.startsWith('@_') || k === '#text') continue;
      const name = k.split(':').at(-1)!;
      if (Object.hasOwn(out, name)) throw new Error('Ambiguous XML namespace');
      out[name] = local(x);
    }
    return out;
  }
  return v;
}
function flag(v: unknown) {
  const s = clean(v).toUpperCase();
  if (!s) return null;
  if (['Y', 'TRUE', '1'].includes(s)) return true;
  if (['N', 'FALSE', '0'].includes(s)) return false;
  throw new Error('Unknown N-PX checkbox');
}
export function fundMeetingDate(raw: string) {
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = z.string().date().safeParse(`${m[3]}-${m[1]}-${m[2]}`);
  return d.success ? d.data : null;
}
function decimal(v: unknown): string | null {
  const raw = clean(v);
  if (!raw) return null;
  if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return null;
  return amountAdd(raw.replace(/^\+/, '').replace(/^\./, '0.').replace(/\.$/, ''), '0');
}
export function parseFundVoteCover(row: SecSubmissionRow, c: SecCapture): FundVoteCover {
  const parsed = local(parseXml(c.body)).edgarSubmission;
  if (!parsed) throw new Error('N-PX cover root missing');
  const header = parsed.headerData,
    fd = parsed.formData,
    cover = fd?.coverPage;
  if (!header || !cover) throw new Error('N-PX cover fields missing');
  const form = clean(header.submissionType),
    amendment = cover.amendmentInfo,
    period = fundMeetingDate(clean(header.filerInfo?.periodOfReport));
  if (form !== row.form || !period) throw new Error('N-PX form or period mismatch');
  if (
    form.endsWith('/A') !== Boolean(amendment) ||
    (amendment && flag(amendment.isAmendment) === false)
  )
    throw new Error('N-PX amendment flags disagree');
  const series = array(fd.seriesPage?.seriesDetails?.seriesReports).map((s) => ({
    id: clean(s.idOfSeries).toUpperCase(),
    name: clean(s.nameOfSeries),
    lei: clean(s.leiOfSeries) || null,
  }));
  if (
    Number(clean(fd.seriesPage?.seriesCount) || '0') !== series.length ||
    new Set(series.map((s) => s.id)).size !== series.length
  )
    throw new Error('N-PX series count or identity mismatch');
  const managers = array(fd.summaryPage?.otherManagers2?.investmentManagers).map((m) => ({
    number: clean(m.serialNo),
    name: clean(m.name),
    file13f: clean(m.form13FFileNumber) || null,
  }));
  if (
    Number(clean(fd.summaryPage?.otherIncludedManagersCount) || '0') !== managers.length ||
    new Set(managers.map((m) => m.number)).size !== managers.length
  )
    throw new Error('N-PX manager count or identity mismatch');
  const state = clean(cover.reportingPerson?.address?.stateOrCountry),
    states =
      'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(
        ' ',
      );
  return fundVoteCoverSchema.parse({
    accession: row.accessionNumber,
    cik: clean(header.filerInfo?.filer?.issuerCredentials?.cik).padStart(10, '0'),
    filed: row.filingDate,
    accepted: row.acceptanceDateTime,
    form,
    period,
    duration: clean(cover.yearOrQuarter),
    reportType: clean(cover.reportInfo?.reportType),
    name: clean(cover.reportingPerson?.name),
    state: states.includes(state) ? state : null,
    amendment: amendment ? clean(amendment.amendmentType) : null,
    amendmentNo:
      amendment && clean(amendment.amendmentNo) ? Number(clean(amendment.amendmentNo)) : null,
    confidential: flag(cover.reportInfo?.confidentialTreatment),
    noticeExplanation: clean(cover.reportInfo?.noticeExplanation),
    explanation:
      typeof cover.explanatoryInformation?.explanatoryNotes === 'string'
        ? decodeEntities(cover.explanatoryInformation.explanatoryNotes).trim()
        : '',
    series,
    managers,
    reportedBy: array(cover.otherManagersInfo?.otherManager).map((m) => ({
      name: clean(m.managerName),
      file: clean(m.icaOr13FFileNumber) || null,
      lei: clean(m.leiNumberOM) || null,
    })),
    source: c.source,
  });
}
export function* proxyXmlRows(body: string, maxBytes: number) {
  if (Buffer.byteLength(body) > maxBytes || /<!DOCTYPE|<!ENTITY/i.test(body))
    throw new Error('N-PX XML size or entity declaration rejected');
  const valid = XMLValidator.validate(body);
  if (valid !== true) throw new Error('Malformed N-PX voting XML');
  const open = body.match(/<(?:[\w.-]+:)?proxyVoteTable\b[^>]*>/),
    close = body.match(/<\/(?:[\w.-]+:)?proxyVoteTable\s*>\s*$/);
  if (!open || !close || open.index === undefined || close.index === undefined)
    throw new Error('N-PX vote table root missing');
  const inner = body.slice(open.index + open[0].length, close.index);
  let cursor = 0,
    ordinal = 0;
  const whitespace = (s: string) => !s.replace(/<!--[\s\S]*?-->/g, '').trim();
  for (const m of inner.matchAll(
    /<(?:[\w.-]+:)?proxyTable\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?proxyTable\s*>/g,
  )) {
    if (!whitespace(inner.slice(cursor, m.index)))
      throw new Error('Unparsed N-PX vote table content');
    cursor = m.index! + m[0].length;
    ordinal++;
    if (ordinal > 500000) throw new Error('N-PX vote row cap exceeded');
    yield { ordinal, raw: m[0] };
  }
  if (!whitespace(inner.slice(cursor))) throw new Error('Unparsed N-PX trailing table content');
}
export function parseFundVoteRecord(
  raw: string,
  ordinal: number,
  file: string,
  cover: FundVoteCover,
): FundVoteRecord {
  const v = local(parseXml(raw)).proxyTable;
  if (!v) throw new Error('N-PX record root missing');
  const allowed = [
    'issuerName',
    'cusip',
    'isin',
    'figi',
    'meetingDate',
    'voteDescription',
    'voteCategories',
    'otherVoteDescription',
    'voteSource',
    'sharesVoted',
    'sharesOnLoan',
    'vote',
    'voteManager',
    'voteSeries',
    'voteOtherInfo',
  ];
  if (Object.keys(v).some((k) => !allowed.includes(k)))
    throw new Error('Unrecognized N-PX record field');
  const series = clean(v.voteSeries).toUpperCase() || null,
    meetingRaw = clean(v.meetingDate),
    meeting = fundMeetingDate(meetingRaw),
    description = clean(v.voteDescription),
    shares = decimal(v.sharesVoted),
    loaned = decimal(v.sharesOnLoan),
    issues: string[] = [];
  const votes = array(v.vote?.voteRecord).map((r) => ({
    choice: clean(r.howVoted),
    shares: decimal(r.sharesVoted),
    management: clean(r.managementRecommendation),
  }));
  const managers = array(v.voteManager?.otherManagers).flatMap((m) =>
    array(m.otherManager).map(clean),
  );
  if (!meeting) issues.push('Unresolved source meeting date; no proposal match.');
  else if (
    cover.duration === 'YEAR' &&
    (meeting > cover.period || meeting <= `${Number(cover.period.slice(0, 4)) - 1}-06-30`)
  )
    issues.push('Meeting date falls outside this annual reporting period.');
  if (!series || !cover.series.some((s) => s.id === series))
    issues.push('Record series is absent or not in this cover; no fund assignment.');
  if (shares === null || loaned === null || votes.some((v) => v.shares === null))
    issues.push('Missing or invalid numeric disclosure; not interpreted as zero.');
  if (votes.some((v) => !v.choice || !['FOR', 'AGAINST', 'NONE'].includes(v.management)))
    issues.push('Missing direction or unrecognized management recommendation.');
  if (
    managers.some((n) => !cover.managers.some((m) => m.number === n)) ||
    new Set(managers).size !== managers.length
  )
    issues.push('Unresolved or repeated reporting-manager number.');
  if (
    votes.length > 0 &&
    shares !== null &&
    votes.every((v) => v.shares !== null) &&
    amountCompare(
      votes.reduce((sum, v) => amountAdd(sum, v.shares!), '0'),
      shares,
    ) !== 0
  )
    issues.push('Detailed vote amounts do not reconcile to this row’s reported shares voted.');
  if (!votes.length && shares !== null && amountCompare(shares, '0') > 0)
    issues.push(
      'No vote directions supplied; the positive shares-voted field alone is not a recorded voting choice.',
    );
  const cusip = clean(v.cusip) || null,
    isin = clean(v.isin) || null,
    figi = clean(v.figi) || null;
  const security = fundVoteSecurity({ cusip, isin, figi });
  if (!security)
    issues.push('No usable security identifier; names are not used to guess a proposal match.');
  const source = clean(v.voteSource) || null;
  const resolvedSource = source === 'ISSUER' || source === 'SECURITY HOLDER';
  if (!resolvedSource)
    issues.push('Proposal source is missing or unrecognized; no proposal match.');
  const proposal =
    security &&
    meeting &&
    description &&
    resolvedSource &&
    !issues.some((i) => i.includes('period'))
      ? `pv-${hash({ security, meeting, description, source }).slice(0, 24)}`
      : null;
  return fundVoteRecordSchema.parse({
    id: `vr-${hash({ accession: cover.accession, file, ordinal }).slice(0, 24)}`,
    accession: cover.accession,
    file,
    ordinal,
    rawHash: createHash('sha256').update(raw).digest('hex'),
    series,
    issuer: clean(v.issuerName),
    cusip,
    isin,
    figi,
    meetingRaw,
    meeting,
    description,
    categories: array(v.voteCategories?.voteCategory).map((c) => clean(c.categoryType)),
    otherCategory: clean(v.otherVoteDescription),
    source,
    shares,
    loaned,
    votes,
    managers,
    notes: clean(v.voteOtherInfo),
    issues,
    proposal,
  });
}
