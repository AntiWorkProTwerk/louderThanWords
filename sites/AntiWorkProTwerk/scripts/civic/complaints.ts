import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from '../said-did/engine';
import { writeAtomic, withLock } from '../said-did/pipeline';
import { publishSnapshot } from './snapshots';
import { monthsBetween } from '../../src/lib/civic/economy';
import {
  complaintPlanSchema,
  complaintDataSchema,
  monthEnd,
  type ComplaintData,
} from '../../src/lib/civic/complaints';
const endpoint = 'https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/';
const sortSchema = z.tuple([z.number().int(), z.string().regex(/^\d{1,10}$/)]);
const rawComplaint = z.object({
  complaint_id: z.string().regex(/^\d{1,10}$/),
  date_received: z.string().datetime({ offset: true }),
  date_sent_to_company: z.string().datetime({ offset: true }).nullable().optional(),
  company: z.string().min(1),
  product: z.string().min(1),
  sub_product: z.string().nullable().optional(),
  issue: z.string().min(1),
  sub_issue: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  company_response: z.string().nullable().optional(),
  company_public_response: z.string().nullable().optional(),
  timely: z.string().nullable().optional(),
  submitted_via: z.string().nullable().optional(),
});
const responseSchema = z.object({
  timed_out: z.literal(false),
  _shards: z.object({ failed: z.literal(0) }),
  hits: z.object({
    total: z.object({ value: z.number().int().nonnegative(), relation: z.literal('eq') }),
    hits: z.array(
      z.object({ _id: z.string(), _source: rawComplaint.passthrough(), sort: sortSchema }),
    ),
  }),
  _meta: z.object({
    license: z.literal('CC0'),
    last_indexed: z.string(),
    is_data_stale: z.literal(false),
    has_data_issue: z.literal(false),
    break_points: z.record(z.string(), sortSchema).optional(),
  }),
});
const inputSchema = z.object({
  formatVersion: z.literal(1),
  plan: complaintPlanSchema,
  observedAt: z.string().datetime(),
  months: z.array(
    z.object({
      month: z.string(),
      pages: z
        .array(
          z.object({
            url: z.string().url(),
            raw: z.string(),
            hash: z.string().regex(/^[a-f0-9]{64}$/),
            observedAt: z.string().datetime(),
          }),
        )
        .min(1),
    }),
  ),
});
export function complaintUrl(
  plan: z.infer<typeof complaintPlanSchema>,
  month: string,
  page: number,
  cursor?: [number, string],
) {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries({
    date_received_min: `${month}-01`,
    date_received_max: monthEnd(month),
    product: plan.product,
    size: String(plan.pageSize),
    sort: 'created_date_asc',
    no_aggs: 'true',
    no_highlight: 'true',
  }))
    url.searchParams.set(key, value);
  for (const company of plan.companies) url.searchParams.append('company', company);
  if (page > 1) {
    if (!cursor) throw new Error('Missing CFPB pagination cursor');
    url.searchParams.set('page', String(page));
    url.searchParams.set('frm', String((page - 1) * plan.pageSize));
    url.searchParams.set('search_after', cursor.join('_'));
  }
  return url.href;
}
export function buildComplaints(
  value: unknown,
  states: { code: string }[],
  previous: ComplaintData | null = null,
) {
  const input = inputSchema.parse(value),
    plan = input.plan,
    months = monthsBetween(plan.from, plan.through),
    records: ComplaintData['records'] = [],
    coverage: ComplaintData['coverage'] = [],
    sources: ComplaintData['sources'] = [],
    ids = new Set<string>();
  let collectionIndex: string | undefined;
  if (previous && (hash(previous.plan) !== hash(plan) || previous.observedAt > input.observedAt))
    throw new Error('Complaint collection changed or capture is stale');
  if (
    input.months.length !== months.length ||
    new Set(input.months.map((m) => m.month)).size !== months.length
  )
    throw new Error('Incomplete or duplicate CFPB month coverage');
  for (const month of months) {
    const batch = input.months.find((m) => m.month === month);
    if (!batch) throw new Error('Missing CFPB month');
    let total: number | undefined,
      cursor: [number, string] | undefined,
      indexedAt: string | undefined,
      count = 0;
    for (const [i, page] of batch.pages.entries()) {
      if (page.url !== complaintUrl(plan, month, i + 1, cursor))
        throw new Error('CFPB query or pagination changed');
      if (hash(page.raw) !== page.hash) throw new Error('CFPB raw hash mismatch');
      if (page.observedAt > input.observedAt)
        throw new Error('Invalid CFPB observation chronology');
      const response = responseSchema.parse(JSON.parse(page.raw));
      if (collectionIndex !== undefined && collectionIndex !== response._meta.last_indexed)
        throw new Error('CFPB index refreshed during collection; rerun the capture');
      collectionIndex = response._meta.last_indexed;
      if (total !== undefined && total !== response.hits.total.value)
        throw new Error('CFPB total changed during pagination');
      total = response.hits.total.value;
      if (total > plan.maxPerMonth) throw new Error('CFPB month exceeds configured limit');
      if (indexedAt && indexedAt !== response._meta.last_indexed)
        throw new Error('CFPB index refreshed during pagination; rerun the capture');
      indexedAt = response._meta.last_indexed;
      if (
        response.hits.hits.length > plan.pageSize ||
        (!response.hits.hits.length && total > count)
      )
        throw new Error('CFPB page length or cursor stalled');
      for (const hit of response.hits.hits) {
        const r = hit._source;
        if (ids.has(r.complaint_id) || hit._id !== r.complaint_id)
          throw new Error('Duplicate or mismatched CFPB complaint ID');
        ids.add(r.complaint_id);
        if (
          r.date_received.slice(0, 7) !== month ||
          r.product !== plan.product ||
          !plan.companies.includes(r.company)
        )
          throw new Error('CFPB record outside selected scope');
        if (hit.sort[0] !== Date.parse(r.date_received) || hit.sort[1] !== r.complaint_id)
          throw new Error('CFPB sort identity mismatch');
        if (
          cursor &&
          (hit.sort[0] < cursor[0] || (hit.sort[0] === cursor[0] && hit.sort[1] <= cursor[1]))
        )
          throw new Error('CFPB pagination is not strictly increasing');
        cursor = hit.sort;
        records.push({
          id: r.complaint_id,
          received: r.date_received.slice(0, 10),
          sent: r.date_sent_to_company?.slice(0, 10) ?? null,
          company: r.company,
          product: r.product,
          subProduct: r.sub_product ?? null,
          issue: r.issue,
          subIssue: r.sub_issue ?? null,
          clusterId: `cg-${hash([r.product, r.sub_product ?? null, r.issue, r.sub_issue ?? null]).slice(0, 16)}`,
          state: states.some((s) => s.code === r.state) ? r.state! : null,
          reportedState: r.state ?? null,
          companyResponse: r.company_response ?? null,
          companyPublicResponse: r.company_public_response ?? null,
          timely: r.timely === 'Yes' ? 'yes' : r.timely === 'No' ? 'no' : 'unknown',
          submittedVia: r.submitted_via ?? null,
          source: {
            url: `https://www.consumerfinance.gov/data-research/consumer-complaints/search/detail/${r.complaint_id}`,
            hash: hash(hit._source),
          },
        });
        count++;
      }
      const next = response._meta.break_points?.[String(i + 2)];
      if (next && cursor && JSON.stringify(next) !== JSON.stringify(cursor))
        throw new Error('CFPB breakpoint does not match last record');
      sources.push({
        month,
        url: page.url,
        hash: page.hash,
        observedAt: page.observedAt,
        indexedAt,
      });
    }
    if (count !== total) throw new Error('Incomplete CFPB month; refusing trend publication');
    coverage.push({ month, total, complete: true });
  }
  const changes: ComplaintData['changes'] = [];
  if (previous) {
    const before = new Map(previous.records.map((r) => [r.id, r]));
    for (const record of records) {
      const old = before.get(record.id);
      if (!old)
        changes.push({
          id: record.id,
          kind: 'newly_observed',
          detail: 'Newly observed in this collection; not necessarily newly submitted.',
        });
      else if (hash(old) !== hash(record))
        changes.push({
          id: record.id,
          kind: 'updated',
          detail: 'Source fields changed since the previous capture.',
        });
      before.delete(record.id);
    }
    for (const id of before.keys())
      changes.push({
        id,
        kind: 'not_returned',
        detail: 'Not returned by the current complete query; reason not established.',
      });
  }
  const same =
    previous &&
    previous.observedAt === input.observedAt &&
    hash(previous.sources) === hash(complaintDataSchema.shape.sources.parse(sources));
  const data = complaintDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'consumer-radar-v1',
    plan,
    observedAt: input.observedAt,
    records: records.sort(
      (a, b) => a.received.localeCompare(b.received) || Number(a.id) - Number(b.id),
    ),
    coverage,
    sources,
    changes: same ? previous.changes : changes,
    trackingStartedAt: previous?.trackingStartedAt ?? input.observedAt,
    narratives: 'not_available_in_current_api',
  });
  if (previous && previous.observedAt === input.observedAt && hash(data) !== hash(previous))
    throw new Error('Conflicting same-time complaint snapshot');
  return data;
}
export async function runComplaints(options: {
  plan?: unknown;
  input?: unknown;
  states: { code: string }[];
  workspace: string;
  output: string;
  offline?: boolean;
  fetcher?: typeof fetch;
}) {
  return withLock(options.workspace, async () => {
    let input: unknown = options.input;
    if (input === undefined) {
      const plan = complaintPlanSchema.parse(options.plan);
      if (options.offline) {
        input = JSON.parse(await readFile(join(options.workspace, 'acquisition.json'), 'utf8'));
        if (hash(inputSchema.parse(input).plan) !== hash(plan))
          throw new Error('Offline CFPB plan mismatch');
      } else {
        const months: z.infer<typeof inputSchema>['months'] = [];
        let lastRequest = 0;
        for (const month of monthsBetween(plan.from, plan.through)) {
          const pages: z.infer<typeof inputSchema>['months'][number]['pages'] = [];
          let cursor: [number, string] | undefined,
            total = 0,
            count = 0;
          do {
            const url = complaintUrl(plan, month, pages.length + 1, cursor);
            let raw: string | undefined;
            for (let attempt = 0; attempt < 3; attempt++) {
              const wait = Math.max(0, 1100 - (Date.now() - lastRequest));
              if (wait) await new Promise((r) => setTimeout(r, wait));
              lastRequest = Date.now();
              try {
                const response = await (options.fetcher ?? fetch)(url, {
                  redirect: 'error',
                  signal: AbortSignal.timeout(30000),
                });
                if (!response.ok) {
                  const retry = response.headers.get('retry-after');
                  if (retry) {
                    const seconds = Number(retry),
                      delay = Number.isFinite(seconds)
                        ? seconds * 1000
                        : Date.parse(retry) - Date.now();
                    if (Number.isFinite(delay) && delay > 0) lastRequest = Date.now() + delay;
                  }
                  await response.body?.cancel();
                  throw new Error(`CFPB HTTP ${response.status}`);
                }
                if (!response.headers.get('content-type')?.includes('json'))
                  throw new Error('CFPB returned non-JSON content');
                const reader = response.body?.getReader();
                if (!reader) throw new Error('Empty CFPB response');
                const chunks: Uint8Array[] = [];
                let bytes = 0;
                for (;;) {
                  const part = await reader.read();
                  if (part.done) break;
                  bytes += part.value.length;
                  if (bytes > 4_000_000) {
                    await reader.cancel();
                    throw new Error('CFPB response exceeds 4 MB');
                  }
                  chunks.push(part.value);
                }
                raw = Buffer.concat(chunks).toString('utf8');
                break;
              } catch (e) {
                if (attempt === 2) throw e;
                await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
              }
            }
            const response = responseSchema.parse(JSON.parse(raw!));
            total = response.hits.total.value;
            if (total > plan.maxPerMonth)
              throw new Error(
                'CFPB query exceeds monthly cap; narrow the scope or increase the explicit cap. No partial trends published.',
              );
            const page = { url, raw: raw!, hash: hash(raw!), observedAt: new Date().toISOString() };
            pages.push(page);
            await writeAtomic(join(options.workspace, 'raw', `${page.hash}.json`), page);
            const next = response.hits.hits.at(-1)?.sort;
            if (count < total && (!next || JSON.stringify(next) === JSON.stringify(cursor)))
              throw new Error('CFPB cursor stalled');
            cursor = next;
            count += response.hits.hits.length;
            if (count > total) throw new Error('CFPB total exceeded');
          } while (count < total);
          months.push({ month, pages });
        }
        input = { formatVersion: 1, plan, observedAt: new Date().toISOString(), months };
        await writeAtomic(join(options.workspace, 'acquisition.json'), input);
      }
    }
    let previous: ComplaintData | null = null,
      expected: string | null = null;
    try {
      const manifest = JSON.parse(await readFile(join(options.output, 'manifest.json'), 'utf8'));
      if (!/^cr-[a-f0-9]{24}$/.test(manifest.release)) throw new Error('Invalid complaint release');
      expected = manifest.release;
      const raw = JSON.parse(
        await readFile(join(options.output, 'releases', manifest.release, 'data.json'), 'utf8'),
      );
      if (hash(raw) !== manifest.dataHash || expected !== `cr-${hash(raw).slice(0, 24)}`)
        throw new Error('Previous complaint integrity failure');
      previous = complaintDataSchema.parse(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || expected) throw e;
    }
    const data = buildComplaints(input, options.states, previous);
    await writeAtomic(join(options.workspace, 'input.json'), input);
    const manifest = await publishSnapshot(data, options.output, 'cr', expected);
    return {
      ...manifest,
      records: data.records.length,
      clusters: new Set(data.records.map((r) => r.clusterId)).size,
      coverage: data.coverage,
    };
  });
}
