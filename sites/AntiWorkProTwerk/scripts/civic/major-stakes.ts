import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from '../said-did/engine';
import { parseXml, decodeEntities } from '../said-did/sources';
import { withLock, writeAtomic } from '../said-did/pipeline';
import { acquireSecFile } from './sec-source';
import {
  secCaptureSchema,
  secSubmissionRows,
  secHistoryFileSchema,
  captureSecSubmissions,
  secSubmissionsUrl,
  validateSecCapture,
  type SecCapture,
  type SecSubmissionRow,
} from './sec-submissions';
import { publishSnapshot } from './snapshots';
import { secCik, insiderAccession } from '../../src/lib/civic/insiders';
import { amountAdd, amountCompare } from '../../src/lib/civic/holdings';
import {
  stakePlanSchema,
  stakeFormSchema,
  stakeFilingSchema,
  stakeDetailSchema,
  stakeDataSchema,
  type StakePlan,
  type StakeDetail,
  type StakeData,
  type StakeFiling,
  type StakeReporter,
  type StakeSeries,
} from '../../src/lib/civic/major-stakes';

export const stakeInputSchema = z.object({
  formatVersion: z.literal(1),
  plan: stakePlanSchema,
  captures: z.array(secCaptureSchema).max(11000),
});
export type StakeInput = z.infer<typeof stakeInputSchema>;
const profileSchema = z.object({
  cik: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  tickers: z.array(z.string()),
  addresses: z.object({ business: z.object({ stateOrCountry: z.string().nullable() }) }),
  filings: z.object({ recent: z.unknown(), files: z.array(secHistoryFileSchema) }),
});
const states = new Set(
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(
    ' ',
  ),
);
const clean = (value: unknown) =>
  typeof value === 'string' ? decodeEntities(value).replace(/\s+/g, ' ').trim() : '';
const array = (value: unknown): any[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const normalizedForm = (value: string) => value.replace(/^SC /, 'SCHEDULE ');
export function stakeDocumentUrl(cik: string, accession: string, primary: string) {
  secCik.parse(cik);
  insiderAccession.parse(accession);
  const m = primary.match(/^(?:xslSCHEDULE_13[DG]_X\d+\/)?([A-Za-z0-9_-]+\.xml)$/);
  if (!m) throw new Error('Expected structured SEC Schedule XML primary document');
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll('-', '')}/${m[1]}`;
}
type Candidate = { row: SecSubmissionRow; indexedBy: string[] };
function discover(plan: StakePlan, captures: SecCapture[], requireAll: boolean) {
  if (new Set(captures.map((c) => c.key)).size !== captures.length)
    throw new Error('Duplicate stake capture');
  const used = new Set<string>(),
    missing: { cik: string; file: string }[] = [],
    issuers: StakeData['issuers'] = [],
    indexes: StakeData['indexes'] = [],
    candidates = new Map<string, Candidate>();
  const get = (key: string, url: string) => {
    const c = captures.find((c) => c.key === key);
    if (!c) throw new Error('Missing SEC issuer capture');
    used.add(key);
    return validateSecCapture(c, url);
  };
  for (const cik of plan.issuers) {
    const capture = get('issuer-' + cik, secSubmissionsUrl(cik)),
      p = profileSchema.parse(JSON.parse(capture.body));
    if (String(p.cik).padStart(10, '0') !== cik)
      throw new Error('Submissions profile CIK mismatch');
    if (new Set(p.filings.files.map((f) => f.name)).size !== p.filings.files.length)
      throw new Error('Duplicate history filename');
    const rows = secSubmissionRows(p.filings.recent);
    let historyPages = 0;
    indexes.push({ cik, key: capture.key, source: capture.source, rows: rows.length });
    for (const f of p.filings.files) {
      const url = secSubmissionsUrl(cik, f.name);
      if (f.filingFrom > plan.through || f.filingTo < plan.from) continue;
      const key = f.name.replace(/\.json$/, '').toLowerCase(),
        c = captures.find((c) => c.key === key);
      if (!c) {
        missing.push({ cik, file: f.name });
        continue;
      }
      used.add(key);
      validateSecCapture(c, url);
      const history = secSubmissionRows(JSON.parse(c.body));
      if (
        history.length !== f.filingCount ||
        history.some((r) => r.filingDate < f.filingFrom || r.filingDate > f.filingTo)
      )
        throw new Error('SEC history count or date coverage mismatch');
      rows.push(...history);
      historyPages++;
      indexes.push({ cik, key, source: c.source, rows: history.length });
    }
    if (new Set(rows.map((r) => r.accessionNumber)).size !== rows.length)
      throw new Error('Overlapping SEC index pages require a fresh capture');
    issuers.push({
      cik,
      name: p.name,
      tickers: p.tickers,
      state: states.has(p.addresses.business.stateOrCountry ?? '')
        ? p.addresses.business.stateOrCountry
        : null,
      source: capture.source,
      indexRows: rows.length,
      historyPages,
    });
    for (const row of rows)
      if (
        row.filingDate >= plan.from &&
        row.filingDate <= plan.through &&
        /^(?:SCHEDULE|SC) 13[DG](?:\/A)?$/.test(row.form)
      ) {
        stakeDocumentUrl(cik, row.accessionNumber, row.primaryDocument);
        const old = candidates.get(row.accessionNumber);
        if (old && hash(old.row) !== hash(row))
          throw new Error('SEC issuer indexes disagree about the same filing');
        if (old) old.indexedBy.push(cik);
        else candidates.set(row.accessionNumber, { row, indexedBy: [cik] });
      }
  }
  if (indexes.length + missing.length > plan.maxIndexPages || candidates.size > plan.maxFilings)
    throw new Error('Stake collection exceeds explicit cap; no truncation');
  if (requireAll && missing.length) throw new Error('Incomplete SEC historical index coverage');
  return {
    used,
    missing,
    issuers,
    indexes,
    candidates: [...candidates.values()].sort((a, b) =>
      a.row.accessionNumber.localeCompare(b.row.accessionNumber),
    ),
  };
}
export async function acquireStakes(
  planInput: unknown,
  workspace: string,
  offline = false,
  fetcher: typeof fetch = fetch,
) {
  const plan = stakePlanSchema.parse(planInput),
    captures: SecCapture[] = [],
    directory = join(workspace, 'sources');
  for (const cik of plan.issuers)
    captures.push(await captureSecSubmissions(directory, cik, undefined, offline, fetcher));
  const first = discover(plan, captures, false);
  for (const m of first.missing)
    captures.push(await captureSecSubmissions(directory, m.cik, m.file, offline, fetcher));
  const discovery = discover(plan, captures, true);
  for (const c of discovery.candidates) {
    const key = 'filing-' + c.row.accessionNumber,
      url = stakeDocumentUrl(
        [...c.indexedBy].sort()[0],
        c.row.accessionNumber,
        c.row.primaryDocument,
      );
    const r = await acquireSecFile(
      directory,
      { key, url, extension: 'xml', cap: 2_000_000 },
      offline,
      fetcher,
    );
    captures.push({ key, source: r.source, body: await readFile(r.path, 'utf8') });
  }
  return stakeInputSchema.parse({ formatVersion: 1, plan, captures });
}
function namespaces(value: any): any {
  if (Array.isArray(value)) return value.map(namespaces);
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (key.startsWith('@_')) continue;
      const name = key.split(':').at(-1)!;
      if (Object.hasOwn(result, name)) throw new Error('Ambiguous namespace-local XML element');
      result[name] = namespaces(v);
    }
    return result;
  }
  return value;
}
function date(value: unknown) {
  const m = clean(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new Error('Invalid stake event date');
  return z.string().date().parse(`${m[3]}-${m[1]}-${m[2]}`);
}
function numeric(value: unknown, percent = false): string | null {
  const raw = clean(value);
  if (!raw) return null;
  if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw))
    throw new Error('Invalid nonnegative stake amount');
  const normalized = raw.replace(/^\+/, '').replace(/^\./, '0.').replace(/\.$/, '');
  const n = amountAdd(normalized, '0');
  if (percent && amountCompare(n, '100') > 0)
    throw new Error('Reported percentage exceeds 100; source review required');
  return n;
}
function checkbox(value: unknown): boolean | null {
  const s = clean(value).toUpperCase();
  if (!s) return null;
  if (['Y', 'TRUE', '1'].includes(s)) return true;
  if (['N', 'FALSE', '0'].includes(s)) return false;
  throw new Error('Unknown SEC checkbox value');
}
export function parseStakeFiling(row: SecSubmissionRow, capture: SecCapture): StakeDetail {
  const parsed = parseXml(capture.body),
    rootKey = Object.keys(parsed).find((k) => k.split(':').at(-1) === 'edgarSubmission');
  if (!rootKey) throw new Error('Schedule XML root missing');
  const root = namespaces(parsed[rootKey]),
    form = stakeFormSchema.parse(clean(root.headerData?.submissionType));
  if (form !== normalizedForm(row.form))
    throw new Error('Schedule form disagrees with SEC submissions index');
  const isD = form.includes('13D'),
    fd = root.formData,
    cover = fd?.coverPageHeader,
    issuer = cover?.issuerInfo;
  const issuerCik = secCik.parse(
    clean(isD ? issuer?.issuerCIK : issuer?.issuerCik).padStart(10, '0'),
  );
  const filerCik = secCik.parse(
    clean(root.headerData?.filerInfo?.filer?.filerCredentials?.cik).padStart(10, '0'),
  );
  if (Number(issuerCik) === 0 || Number(filerCik) === 0)
    throw new Error('Missing Schedule issuer/filer identity');
  const fields: StakeDetail['fields'] = [];
  function field(path: string, label: string, value: unknown) {
    if (value === undefined) return;
    if (typeof value !== 'string') throw new Error('Unexpected complex Schedule field');
    fields.push({
      path,
      label,
      raw: value,
      text: decodeEntities(value).replace(/\r\n?/g, '\n').trim(),
    });
  }
  const cusips = array(
    issuer?.issuerCusips?.issuerCusipNumber ?? (isD ? issuer?.issuerCUSIP : issuer?.issuerCusip),
  )
    .map(clean)
    .filter(Boolean)
    .sort();
  // Older 13D uses issuerCUSIP, older 13G issuerCusip; X02 uses issuerCusips.
  if (new Set(cusips).size !== cusips.length || cusips.some((c) => !/^[A-Z0-9]{9}$/.test(c)))
    throw new Error('Invalid or repeated Schedule CUSIP');
  const persons = array(
    isD ? fd.reportingPersons?.reportingPersonInfo : fd.coverPageHeaderReportingPersonDetails,
  );
  const reporters: StakeReporter[] = persons.map((p, index) => {
    const prefix = isD
      ? `formData.reportingPersons.reportingPersonInfo[${index + 1}]`
      : `formData.coverPageHeaderReportingPersonDetails[${index + 1}]`;
    const name = clean(p.reportingPersonName),
      cikValue = clean(isD ? p.reportingPersonCIK : p.reportingCik),
      cik = cikValue ? secCik.parse(cikValue.padStart(10, '0')) : null;
    if (
      cik &&
      checkbox(isD ? p.reportingPersonNoCIK : p.reportingCikNotPresentInEdgarFlag) === true
    )
      throw new Error('Conflicting reporting-person CIK flags');
    const id = cik ? `cik-${cik}` : `name-${hash({ filerCik, name }).slice(0, 24)}`;
    const power = isD ? p : (p.reportingPersonBeneficiallyOwnedNumberOfShares ?? {});
    for (const k of isD
      ? [
          'reportingPersonCIK',
          'reportingPersonNoCIK',
          'reportingPersonName',
          'memberOfGroup',
          'fundType',
          'aggregateAmountOwned',
          'percentOfClass',
          'soleVotingPower',
          'sharedVotingPower',
          'soleDispositivePower',
          'sharedDispositivePower',
          'isAggregateExcludeShares',
          'typeOfReportingPerson',
          'commentContent',
        ]
      : [
          'reportingCik',
          'reportingCikNotPresentInEdgarFlag',
          'reportingPersonName',
          'memberGroup',
          'reportingPersonBeneficiallyOwnedAggregateNumberOfShares',
          'classPercent',
          'aggregateAmountExcludesCertainSharesFlag',
          'typeOfReportingPerson',
          'comments',
        ]) {
      if (Array.isArray(p[k]))
        p[k].forEach((v: unknown, i: number) =>
          field(`${prefix}.${k}[${i + 1}]`, `${name} · ${k}`, v),
        );
      else field(`${prefix}.${k}`, `${name} · ${k}`, p[k]);
    }
    if (!isD)
      for (const k of [
        'soleVotingPower',
        'sharedVotingPower',
        'soleDispositivePower',
        'sharedDispositivePower',
      ])
        field(
          `${prefix}.reportingPersonBeneficiallyOwnedNumberOfShares.${k}`,
          `${name} · ${k}`,
          power[k],
        );
    return {
      id,
      cik,
      name,
      identity: cik ? 'explicit-cik' : 'filer-scoped-name',
      quantity: numeric(
        isD ? p.aggregateAmountOwned : p.reportingPersonBeneficiallyOwnedAggregateNumberOfShares,
      ),
      percent: numeric(isD ? p.percentOfClass : p.classPercent, true),
      soleVoting: numeric(power.soleVotingPower),
      sharedVoting: numeric(power.sharedVotingPower),
      soleDispositive: numeric(power.soleDispositivePower),
      sharedDispositive: numeric(power.sharedDispositivePower),
      group: clean(isD ? p.memberOfGroup : p.memberGroup) || null,
      excludesShares: checkbox(
        isD ? p.isAggregateExcludeShares : p.aggregateAmountExcludesCertainSharesFlag,
      ),
      types: array(p.typeOfReportingPerson).map(clean),
      fundTypes: isD ? array(p.fundType).map(clean) : [],
    } as StakeReporter;
  });
  if (new Set(reporters.map((p) => p.id)).size !== reporters.length)
    throw new Error('Duplicate/ambiguous reporter identity within one filing');
  const items = isD ? fd.items1To7 : fd.items;
  const itemPaths = isD
    ? [
        ['item1', 'commentText', 'Amendment context'],
        ['item3', 'fundsSource', 'Source of funds'],
        ['item4', 'transactionPurpose', 'Item 4 · Purpose of transaction'],
        ['item5', 'percentageOfClassSecurities', 'Ownership percentage explanation'],
        ['item5', 'numberOfShares', 'Ownership and voting explanation'],
        ['item5', 'transactionDesc', 'Reported transactions'],
        ['item5', 'listOfShareholders', 'Rights held by other persons'],
        ['item5', 'date5PercentOwnership', 'Five-percent status explanation'],
        ['item6', 'contractDescription', 'Contracts and arrangements'],
        ['item7', 'filedExhibits', 'Exhibit references'],
      ]
    : [
        ['item3', 'otherTypeOfPersonFiling', 'Other filing category'],
        ['item4', 'amountBeneficiallyOwned', 'Ownership explanation'],
        ['item4', 'classPercent', 'Percentage explanation'],
        ['item5', 'classOwnership5PercentOrLess', 'Five-percent-or-less checkbox'],
        [
          'item6',
          'ownershipMoreThan5PercentOnBehalfOfAnotherPerson',
          'Rights on behalf of another person',
        ],
        ['item7', 'subsidiaryIdentificationAndClassification', 'Subsidiaries'],
        ['item8', 'identificationAndClassificationOfGroupMembers', 'Group members'],
        ['item9', 'groupDissolutionNotice', 'Group dissolution notice'],
        ['item10', 'certifications', 'Item 10 · Certification'],
      ];
  for (const [item, key, label] of itemPaths)
    field(`formData.${isD ? 'items1To7' : 'items'}.${item}.${key}`, label, items?.[item]?.[key]);
  if (!isD)
    for (const k of [
      'solePowerOrDirectToVote',
      'sharedPowerOrDirectToVote',
      'solePowerOrDirectToDispose',
      'sharedPowerOrDirectToDispose',
    ])
      field(
        `formData.items.item4.numberOfSharesPersonHas.${k}`,
        `Ownership explanation · ${k}`,
        items?.item4?.numberOfSharesPersonHas?.[k],
      );
  const purposeText = clean(isD ? items?.item4?.transactionPurpose : items?.item10?.certifications),
    amendment = clean(cover.amendmentNo);
  const issues: string[] = [];
  if (!cusips.length)
    issues.push('No CUSIP supplied; class identity is unresolved and amounts are not compared.');
  if (form.endsWith('/A') && !amendment) issues.push('Amendment number not supplied.');
  if (reporters.some((p) => p.identity === 'filer-scoped-name'))
    issues.push(
      'Some reporters have no explicit CIK; identical names are linked only within this filer context. Name changes are not automatically merged.',
    );
  if (!purposeText)
    issues.push(
      form.endsWith('/A')
        ? 'This amendment does not restate the purpose/certification field; consult earlier filings and incorporated exhibits.'
        : 'Purpose/certification field not supplied in this source.',
    );
  const summary = {
    accession: row.accessionNumber,
    form,
    filed: row.filingDate,
    accepted: row.acceptanceDateTime,
    event: date(isD ? cover.dateOfEvent : cover.eventDateRequiresFilingThisStatement),
    issuerCik,
    issuerName: clean(issuer.issuerName),
    filerCik,
    cusips,
    securityClass: clean(cover.securitiesClassTitle),
    amendmentNo: amendment ? z.coerce.number().int().nonnegative().parse(amendment) : null,
    previousAccession: clean(root.headerData.previousAccessionNumber) || null,
    previouslyFiledG: isD ? checkbox(cover.previouslyFiledFlag) : null,
    rules: isD
      ? []
      : array(
          cover.designateRulesPursuantThisScheduleFiled?.designateRulePursuantThisScheduleFiled,
        ).map(clean),
    reporters,
    purpose: purposeText
      ? isD
        ? '13d-purpose'
        : '13g-certification'
      : form.endsWith('/A')
        ? 'not-restated'
        : 'not-supplied',
    belowThreshold: isD ? null : checkbox(items?.item5?.classOwnership5PercentOrLess),
    issues,
    source: capture.source,
  };
  return stakeDetailSchema.parse({
    filing: {
      ...summary,
      recordHash: hash({
        ...summary,
        source: { url: capture.source.url, hash: capture.source.hash },
        fields,
      }),
    },
    fields,
  });
}
export function buildStakeSeries(filings: StakeFiling[]): StakeSeries[] {
  const groups = new Map<string, StakeFiling[]>();
  for (const f of filings) {
    const key = hash({
      issuer: f.issuerCik,
      filer: f.filerCik,
      cusips: f.cusips,
      classFallback: f.cusips.length ? null : f.securityClass,
    });
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  return [...groups]
    .map(([key, files]) => {
      files.sort(
        (a, b) =>
          Date.parse(a.accepted) - Date.parse(b.accepted) || a.accession.localeCompare(b.accession),
      );
      const first = files[0],
        issues: string[] = [];
      for (const family of ['13D', '13G']) {
        const branch = files.filter((f) => f.form.includes(family));
        if (!branch.length) continue;
        if (branch[0].form.endsWith('/A'))
          issues.push(
            `${family}: the collected history begins with an amendment, not the original schedule.`,
          );
        for (let i = 1; i < branch.length; i++) {
          const prior = branch[i - 1],
            next = branch[i];
          if (!next.form.endsWith('/A')) {
            issues.push(
              `${family}: another initial schedule appears; do not assume an uninterrupted amendment chain.`,
            );
            continue;
          }
          const a = prior.form.endsWith('/A') ? prior.amendmentNo : 0,
            b = next.amendmentNo;
          if (a === null || b === null || b !== a + 1)
            issues.push(
              `${family}: amendment sequence is incomplete or nonconsecutive at ${next.accession}.`,
            );
        }
      }
      if (files.some((f, i) => i > 0 && f.event <= files[i - 1].event))
        issues.push(
          'Some event dates are repeated or move backward; filing order is not a trade timeline.',
        );
      for (const f of files)
        if (f.previousAccession && !files.some((p) => p.accession === f.previousAccession))
          issues.push(
            `Referenced accession ${f.previousAccession} is outside this collected series.`,
          );
      return {
        id: `st-${key.slice(0, 24)}`,
        issuerCik: first.issuerCik,
        filerCik: first.filerCik,
        cusips: first.cusips,
        securityClass: files.at(-1)!.securityClass,
        filings: files.map((f) => f.accession),
        initialSchedules: files.filter((f) => !f.form.endsWith('/A')).map((f) => f.accession),
        issues: [...new Set(issues)],
      };
    })
    .sort((a, b) => a.issuerCik.localeCompare(b.issuerCik) || a.id.localeCompare(b.id));
}
export function buildStakes(value: unknown, previous: StakeData | null = null) {
  const input = stakeInputSchema.parse(value),
    { plan } = input,
    discovery = discover(plan, input.captures, true),
    details: StakeDetail[] = [],
    exclusions: StakeData['exclusions'] = [];
  for (const c of discovery.candidates) {
    const key = 'filing-' + c.row.accessionNumber,
      capture = input.captures.find((v) => v.key === key);
    if (!capture) throw new Error('Missing discovered Schedule filing');
    discovery.used.add(key);
    validateSecCapture(
      capture,
      stakeDocumentUrl([...c.indexedBy].sort()[0], c.row.accessionNumber, c.row.primaryDocument),
    );
    const detail = parseStakeFiling(c.row, capture);
    if (!plan.issuers.includes(detail.filing.issuerCik))
      exclusions.push({
        accession: c.row.accessionNumber,
        indexedBy: c.indexedBy,
        actualIssuer: detail.filing.issuerCik,
        reason: 'different-subject-issuer',
        source: capture.source,
      });
    else details.push(detail);
  }
  if (discovery.used.size !== input.captures.length)
    throw new Error('Unexpected unscoped stake capture');
  details.sort(
    (a, b) =>
      Date.parse(a.filing.accepted) - Date.parse(b.filing.accepted) ||
      a.filing.accession.localeCompare(b.filing.accession),
  );
  const filings = details.map((d) => d.filing),
    observedAt = input.captures
      .map((c) => c.source.observedAt)
      .sort()
      .at(-1)!,
    old = new Map(previous?.filings.map((f) => [f.accession, f.recordHash]) ?? []);
  const data = stakeDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'major-stakes-v1',
    plan,
    observedAt,
    issuers: discovery.issuers,
    indexes: discovery.indexes,
    exclusions,
    filings,
    series: buildStakeSeries(filings),
    changes: {
      baselineAt: previous?.observedAt ?? null,
      added: filings.filter((f) => !old.has(f.accession)).map((f) => f.accession),
      updated: filings
        .filter((f) => old.has(f.accession) && old.get(f.accession) !== f.recordHash)
        .map((f) => f.accession),
    },
  });
  if (previous) {
    if (
      plan.id !== previous.plan.id ||
      plan.from > previous.plan.from ||
      plan.through < previous.plan.through ||
      previous.plan.issuers.some((c) => !plan.issuers.includes(c)) ||
      previous.filings.some((f) => !filings.some((n) => n.accession === f.accession))
    )
      throw new Error('Stake collection scope or retained filing disappeared');
    const sources = [
      ...previous.indexes.map((i) => i.source),
      ...previous.filings.map((f) => f.source),
      ...previous.exclusions.map((e) => e.source),
    ];
    for (const old of sources) {
      const next = input.captures.find((c) => c.source.url === old.url)?.source;
      if (
        next &&
        (next.observedAt < old.observedAt ||
          (next.observedAt === old.observedAt && next.hash !== old.hash))
      )
        throw new Error('Stale or changed Schedule capture');
    }
    if (data.observedAt < previous.observedAt) throw new Error('Stale stake collection');
    if (data.observedAt === previous.observedAt) {
      if (hash({ ...data, changes: undefined }) !== hash({ ...previous, changes: undefined }))
        throw new Error('Stake evidence changed at same capture');
      data.changes = previous.changes;
    }
  }
  return {
    data,
    attachments: Object.fromEntries(details.map((d) => [`filings/${d.filing.accession}.json`, d])),
  };
}
export async function runStakes(options: {
  plan?: unknown;
  input?: unknown;
  workspace: string;
  output: string;
  offline?: boolean;
}) {
  return withLock(options.workspace, async () => {
    let expected: string | null = null,
      previous: StakeData | null = null;
    try {
      const m = JSON.parse(await readFile(join(options.output, 'manifest.json'), 'utf8'));
      if (!/^ms-[a-f0-9]{24}$/.test(m.release)) throw new Error('Invalid stake release');
      expected = m.release;
      const raw = JSON.parse(
        await readFile(join(options.output, 'releases', expected!, 'data.json'), 'utf8'),
      );
      if (hash(raw) !== m.dataHash || expected !== `ms-${hash(raw).slice(0, 24)}`)
        throw new Error('Prior stake integrity failure');
      previous = stakeDataSchema.parse(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || expected) throw e;
    }
    const input =
      options.input ?? (await acquireStakes(options.plan, options.workspace, options.offline));
    await writeAtomic(join(options.workspace, 'input.json'), input);
    const { data, attachments } = buildStakes(input, previous),
      manifest = await publishSnapshot(data, options.output, 'ms', expected, attachments);
    const result = {
      release: manifest.release,
      issuers: data.issuers.length,
      filings: data.filings.length,
      series: data.series.length,
      reporterEntries: data.filings.reduce((n, f) => n + f.reporters.length, 0),
      exclusions: data.exclusions.length,
    };
    await writeAtomic(join(options.workspace, 'last-run.json'), result);
    return result;
  });
}
