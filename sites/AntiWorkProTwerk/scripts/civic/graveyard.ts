import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { z } from 'zod';
import { hash } from '../said-did/engine';
import { withLock, writeAtomic } from '../said-did/pipeline';
import { publishSnapshot } from './snapshots';
import {
  billId,
  billKeySchema,
  statusUrl,
  plannedBills,
  graveyardPlanSchema,
  graveyardDataSchema,
  billDetailSchema,
  type BillKey,
  type BillDetail,
  type StatusAction,
  type GraveyardData,
  type GraveyardPlan,
  type Milestone,
} from '../../src/lib/civic/graveyard';

export const graveyardInputSchema = z.object({
  formatVersion: z.literal(1),
  plan: graveyardPlanSchema,
  observedAt: z.string().datetime(),
  documents: z.array(
    z.object({
      key: billKeySchema,
      url: z.string().url(),
      capturedAt: z.string().datetime(),
      status: z.union([z.literal(200), z.literal(404)]),
      raw: z.string().max(40_000_000),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
});
type Input = z.infer<typeof graveyardInputSchema>;
const list = (v: any): any[] =>
  v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : [v];
const str = (v: any): string => (v === undefined || v === null ? '' : z.string().parse(v));
function actions(v: any): StatusAction[] {
  const container = v?.actions ?? v;
  const rows = list(container?.item).map((a): StatusAction => ({
    date: str(a.actionDate),
    text: str(a.text),
    type: str(a.type),
    code: str(a.actionCode),
    sourceCode: str(a.sourceSystem?.code),
    sourceName: str(a.sourceSystem?.name),
    time: str(a.actionTime),
    votes: list(a.recordedVotes?.recordedVote).map((r) => ({
      chamber: str(r.chamber),
      congress: Number(r.congress),
      session: str(r.sessionNumber),
      roll: str(r.rollNumber),
      url: str(r.url),
    })),
  }));
  if (v?.count !== undefined && Number(v.count) !== rows.length)
    throw new Error('Incomplete action list');
  return rows; // Source order retained for same-day events; no guessed time ordering.
}
function latest(v: any) {
  return v?.actionDate ? { date: str(v.actionDate), text: str(v.text) } : null;
}
function billRecord(raw: string, key: BillKey) {
  // Government XML needs neither DTD expansion nor entities from an external resource.
  if (/<!DOCTYPE|<!ENTITY/i.test(raw) || XMLValidator.validate(raw) !== true)
    throw new Error('Invalid or unsafe bill-status XML');
  const root = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
  }).parse(raw);
  const b = root.billStatus?.bill;
  if (
    !b ||
    Number(b.congress) !== key.congress ||
    b.type !== key.type ||
    Number(b.number) !== key.number
  )
    throw new Error('Source bill identity mismatch');
  return b;
}
export function parseBillStatus(raw: string, key: BillKey): BillDetail {
  const b = billRecord(raw, key);
  const history = actions(b.actions),
    last = latest(b.latestAction);
  if (!last || !history.some((a) => a.date === last.date && a.text === last.text))
    throw new Error('Latest action is absent from history');
  if (history.some((a) => a.date > last.date || a.date < b.introducedDate))
    throw new Error('Action chronology mismatch');
  const milestones: BillDetail['bill']['milestones'] = {
    introduced: str(b.introducedDate),
    committee: null,
    floor: null,
    house: null,
    senate: null,
    president: null,
    law: null,
  };
  const mark = (k: Milestone, date: string) => {
    if (!milestones[k] || date < milestones[k]!) milestones[k] = date;
  };
  for (const a of history) {
    // LOC milestone codes are interpreted only in their source-system namespace.
    if (a.sourceCode === '9') {
      if (['5000', '13100', '13200', '14000', '14500', '14900'].includes(a.code))
        mark('committee', a.date);
      if (a.code === '8000') mark('house', a.date);
      if (a.code === '17000') mark('senate', a.date);
      if (a.code === '28000') mark('president', a.date);
      if (a.code === '36000') mark('law', a.date);
    }
    if (
      a.sourceCode === '2' &&
      a.type === 'Committee' &&
      ['H12100', 'H12200', 'H12300'].includes(a.code)
    )
      mark('committee', a.date);
    if (a.type === 'Committee' || a.sourceCode === '1') mark('committee', a.date);
    if (a.type === 'Floor') mark('floor', a.date);
    if (a.code === 'E20000' && ['2', '9'].includes(a.sourceCode)) mark('president', a.date);
  }
  const laws = list(b.laws?.item).map((l) => ({ type: str(l.type), number: str(l.number) }));
  if (laws.length && !milestones.law) {
    const a = history.find((a) => a.type === 'BecameLaw');
    if (!a) throw new Error('Law citation without a dated law action');
    mark('law', a.date);
  }
  const related = list(b.relatedBills?.item).map((r) => ({
    congress: Number(r.congress),
    type: str(r.type),
    number: Number(r.number),
    id: `${r.congress}-${str(r.type).toLowerCase()}-${r.number}`,
    title: str(r.title),
    relationships: list(r.relationshipDetails?.item).map((d) => ({
      type: str(d.type),
      identifiedBy: str(d.identifiedBy),
    })),
    latest: latest(r.latestAction),
  }));
  const amendments = list(b.amendments?.amendment).map((a) => {
    const h = actions(a.actions),
      l = latest(a.latestAction);
    return {
      id: `${a.congress}-${str(a.type).toLowerCase()}-${a.number}`,
      congress: Number(a.congress),
      type: str(a.type),
      number: Number(a.number),
      description: str(a.description),
      purpose: str(a.purpose),
      parentAmendment: a.amendedAmendment
        ? `${a.amendedAmendment.congress}-${str(a.amendedAmendment.type).toLowerCase()}-${a.amendedAmendment.number}`
        : null,
      actions: h,
      latest: l,
    };
  });
  const result = billDetailSchema.parse({
    bill: {
      ...key,
      id: billId(key),
      title: str(b.title),
      introduced: str(b.introducedDate),
      updated: str(b.updateDate),
      policy: str(b.policyArea?.name ?? b.subjects?.policyArea?.name) || 'Not assigned',
      subjects: list(b.subjects?.legislativeSubjects?.item).map((s) => str(s.name)),
      sponsors: list(b.sponsors?.item).map((s) => ({
        id: str(s.bioguideId),
        name: str(s.fullName),
        state: str(s.state),
        party: str(s.party),
        byRequest: str(s.isByRequest),
      })),
      latest: last,
      milestones,
      actionCount: history.length,
      amendmentCount: amendments.length,
      sourceHash: hash(raw),
      relatedLaw: related.flatMap((r) =>
        r.relationships
          .filter((d) => d.type.toLowerCase() === 'contained in public law')
          .map((d) => ({ id: r.id, relationship: d.type, title: r.title })),
      ),
    },
    actions: history,
    amendments,
    related,
    laws,
    committees: list(b.committees?.item).map((c) => ({
      id: str(c.systemCode),
      name: str(c.name),
      chamber: str(c.chamber),
      activities: list(c.activities?.item).map((a) => ({ date: str(a.date), name: str(a.name) })),
    })),
  });
  return result;
}
export function buildGraveyard(value: unknown, previous: GraveyardData | null = null) {
  const input = graveyardInputSchema.parse(value),
    expected = new Set(plannedBills(input.plan).map(billId));
  if (
    previous &&
    (hash(previous.plan) !== hash(input.plan) || previous.observedAt > input.observedAt)
  )
    throw new Error('Changed scope or stale bill capture');
  const details: BillDetail[] = [],
    missing: GraveyardData['missing'] = [];
  for (const d of input.documents) {
    if (!expected.delete(billId(d.key))) throw new Error('Unexpected or duplicate bill document');
    if (d.url !== statusUrl(d.key) || d.hash !== hash(d.raw) || d.capturedAt > input.observedAt)
      throw new Error('Invalid bill source provenance');
    if (d.status === 404) {
      missing.push({
        id: billId(d.key),
        url: d.url,
        status: 404,
        reason: 'Source returned HTTP 404; no bill outcome inferred.',
        sourceHash: d.hash,
      });
      continue;
    }
    const rawBill = billRecord(d.raw, d.key);
    if (
      rawBill.title === 'Reserved for the Speaker.' &&
      !rawBill.actions &&
      !rawBill.latestAction
    ) {
      missing.push({
        id: billId(d.key),
        url: d.url,
        status: 200,
        reason: rawBill.title,
        sourceHash: d.hash,
      });
      continue;
    }
    const detail = parseBillStatus(d.raw, d.key);
    if (detail.bill.latest.date > d.capturedAt.slice(0, 10))
      throw new Error('Future action in captured record');
    details.push(detail);
  }
  if (expected.size) throw new Error('Incomplete planned bill collection');
  details.sort((a, b) => a.bill.id.localeCompare(b.bill.id));
  missing.sort((a, b) => a.id.localeCompare(b.id));
  const bills = details.map((d) => d.bill),
    old = new Map(previous?.bills.map((b) => [b.id, b.sourceHash]) ?? []),
    ids = new Set(bills.map((b) => b.id));
  let changes: GraveyardData['changes'] = previous
    ? {
        baselineAt: previous.observedAt,
        added: bills.filter((b) => !old.has(b.id)).map((b) => b.id),
        updated: bills
          .filter((b) => old.has(b.id) && old.get(b.id) !== b.sourceHash)
          .map((b) => b.id),
        notReturned: [...old.keys()].filter((id) => !ids.has(id)),
      }
    : { baselineAt: null, added: [], updated: [], notReturned: [] };
  if (previous?.observedAt === input.observedAt) {
    if (hash(previous.bills) !== hash(bills) || hash(previous.missing) !== hash(missing))
      throw new Error('Evidence changed at same capture time');
    changes = previous.changes;
  }
  const data = graveyardDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'bill-status-v1',
    plan: input.plan,
    observedAt: input.observedAt,
    bills,
    missing,
    changes,
  });
  return { data, details };
}
export async function acquireGraveyard(
  plan: GraveyardPlan,
  workspace: string,
  fetcher: typeof fetch = fetch,
): Promise<Input> {
  const documents: Input['documents'] = [];
  for (const key of plannedBills(plan)) {
    const url = statusUrl(key),
      response = await fetcher(url, { signal: AbortSignal.timeout(90000), redirect: 'error' });
    if (response.status !== 404 && response.status !== 200)
      throw new Error(
        `Bill status ${response.status}: ${url}. No partial publication; retry later.`,
      );
    if (Number(response.headers.get('content-length') ?? 0) > 40_000_000)
      throw new Error('Bill source exceeds size limit');
    const raw = await response.text();
    if (raw.length > 40_000_000) throw new Error('Bill source exceeds size limit');
    const d = {
      key,
      url,
      capturedAt: new Date().toISOString(),
      status: response.status === 404 ? (404 as const) : (200 as const),
      raw,
      hash: hash(raw),
    };
    documents.push(d);
    await writeAtomic(join(workspace, 'raw', `${billId(key)}-${d.hash}.json`), d);
  }
  const input: Input = { formatVersion: 1, plan, observedAt: new Date().toISOString(), documents };
  await writeAtomic(join(workspace, 'attempts', `${hash(input)}.json`), input);
  // Validate completeness and XML before replacing the replayable acquisition.
  buildGraveyard(input);
  await writeAtomic(join(workspace, 'acquisition.json'), input);
  return input;
}
export async function runGraveyard(options: {
  input?: unknown;
  plan?: unknown;
  workspace: string;
  output: string;
  offline?: boolean;
  fetcher?: typeof fetch;
}) {
  return withLock(options.workspace, async () => {
    let previous: GraveyardData | null = null,
      expected: string | null = null;
    try {
      const manifest = JSON.parse(await readFile(join(options.output, 'manifest.json'), 'utf8'));
      if (!/^bg-[a-f0-9]{24}$/.test(manifest.release))
        throw new Error('Invalid prior bill release');
      expected = manifest.release;
      const raw = JSON.parse(
        await readFile(join(options.output, 'releases', manifest.release, 'data.json'), 'utf8'),
      );
      if (hash(raw) !== manifest.dataHash || expected !== `bg-${hash(raw).slice(0, 24)}`)
        throw new Error('Prior bill release integrity failure');
      previous = graveyardDataSchema.parse(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || expected) throw e;
    }
    let input = options.input;
    if (input === undefined) {
      const plan = graveyardPlanSchema.parse(options.plan);
      if (options.offline) {
        input = JSON.parse(await readFile(join(options.workspace, 'acquisition.json'), 'utf8'));
        if (hash(graveyardInputSchema.parse(input).plan) !== hash(plan))
          throw new Error('Offline bill plan mismatch');
      } else input = await acquireGraveyard(plan, options.workspace, options.fetcher);
    }
    const { data, details } = buildGraveyard(input, previous);
    await writeAtomic(join(options.workspace, 'input.json'), input);
    const attachments = Object.fromEntries(details.map((d) => [`bills/${d.bill.id}.json`, d]));
    const manifest = await publishSnapshot(data, options.output, 'bg', expected, attachments);
    return {
      release: manifest.release,
      dataHash: manifest.dataHash,
      bills: data.bills.length,
      missing: data.missing,
      actions: details.reduce((n, d) => n + d.actions.length, 0),
      amendments: details.reduce((n, d) => n + d.amendments.length, 0),
    };
  });
}
