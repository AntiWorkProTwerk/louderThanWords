import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from '../said-did/engine';
import { withLock, writeAtomic } from '../said-did/pipeline';
import { publishSnapshot } from './snapshots';
import {
  LDA_NOTICE,
  lobbyingPlanSchema,
  lobbyingDataSchema,
  type LobbyingPlan,
  type LobbyingData,
  type LobbyingFiling,
} from '../../src/lib/civic/lobbying';

const endpoint = 'https://lda.gov/api/v1/filings/';
const rawFiling = z
  .object({
    filing_uuid: z.string().uuid(),
    url: z.string().url(),
    filing_document_url: z.string().url(),
    filing_type: z.string(),
    filing_type_display: z.string(),
    filing_year: z.number().int(),
    filing_period: z.string(),
    filing_period_display: z.string(),
    dt_posted: z.string().datetime({ offset: true }),
    income: z.string().nullable(),
    expenses: z.string().nullable(),
    client: z.object({
      id: z.number().int().positive(),
      name: z.string(),
      state: z.string().nullable(),
      country: z.string().nullable(),
    }),
    registrant: z.object({ id: z.number().int().positive(), name: z.string() }),
    lobbying_activities: z.array(
      z.object({
        general_issue_code: z.string(),
        general_issue_code_display: z.string(),
        description: z.string().nullable(),
        government_entities: z.array(
          z.object({ id: z.number().int().positive(), name: z.string() }),
        ),
      }),
    ),
  })
  .passthrough();
const responseSchema = z.object({
  count: z.number().int().nonnegative(),
  next: z.string().url().nullable(),
  previous: z.string().url().nullable(),
  results: z.array(rawFiling),
});
const pageSchema = z.object({
  url: z.string().url(),
  raw: z.string().max(4_000_000),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  observedAt: z.string().datetime(),
});
export const lobbyingInputSchema = z.object({
  formatVersion: z.literal(1),
  plan: lobbyingPlanSchema,
  observedAt: z.string().datetime(),
  batches: z
    .array(
      z.object({
        clientId: z.number().int().positive(),
        year: z.number().int(),
        pages: z.array(pageSchema).min(1).max(40),
      }),
    )
    .max(120),
});
type Input = z.infer<typeof lobbyingInputSchema>;

export function lobbyingUrl(clientId: number, year: number, page = 1) {
  const url = new URL(endpoint);
  url.searchParams.set('client_id', String(clientId));
  url.searchParams.set('filing_year', String(year));
  url.searchParams.set('page_size', '25');
  if (page > 1) url.searchParams.set('page', String(page));
  return url.href;
}
function sameUrl(actual: string, expected: string) {
  const a = new URL(actual),
    b = new URL(expected);
  if (a.searchParams.get('page') === '1') a.searchParams.delete('page');
  if (b.searchParams.get('page') === '1') b.searchParams.delete('page');
  a.searchParams.sort();
  b.searchParams.sort();
  return a.href === b.href;
}
export function lobbyingCents(value: string | null) {
  if (value === null) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Invalid LDA money');
  const [whole, fraction = ''] = value.split('.'),
    cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('LDA money exceeds safe integer');
  return Number(cents);
}
const periods = ['first_quarter', 'second_quarter', 'third_quarter', 'fourth_quarter'];
export function projectLobbying(value: unknown, pageHash: string): LobbyingFiling {
  const r = rawFiling.parse(value),
    quarterly = /^(?:Q[1-4]|[1-4][AT@])Y?$/.test(r.filing_type);
  if (!quarterly && !['RR', 'RA'].includes(r.filing_type))
    throw new Error('Unsupported LDA filing type; update the adapter explicitly');
  const quarter = quarterly ? Number(r.filing_type.replace(/\D/g, '')) : null;
  if (quarter && periods[quarter - 1] !== r.filing_period)
    throw new Error('LDA quarter/type mismatch');
  if (
    r.url !== `${endpoint}${r.filing_uuid}/` ||
    r.filing_document_url !== `https://lda.gov/filings/public/filing/${r.filing_uuid}/print/`
  )
    throw new Error('LDA source identity mismatch');
  return {
    id: r.filing_uuid,
    type: r.filing_type,
    typeLabel: r.filing_type_display,
    year: r.filing_year,
    period: r.filing_period,
    periodLabel: r.filing_period_display,
    quarter,
    isAmendment: /^(?:[1-4][A@]Y?|RA)$/.test(r.filing_type),
    posted: r.dt_posted,
    client: r.client,
    registrant: r.registrant,
    incomeCents: lobbyingCents(r.income),
    expensesCents: lobbyingCents(r.expenses),
    activities: r.lobbying_activities.map((a) => ({
      code: a.general_issue_code,
      label: a.general_issue_code_display,
      description: a.description,
      governmentEntities: a.government_entities,
      billMentions: [
        ...(a.description ?? '').matchAll(
          /\b(?:H\.?\s*R\.?|S\.?|H\.?\s*J\.?\s*Res\.?|S\.?\s*J\.?\s*Res\.?)\s+\d{1,5}\b/gi,
        ),
      ].map((m) => ({ text: m[0], start: m.index!, end: m.index! + m[0].length })),
    })),
    source: { url: r.filing_document_url, apiUrl: r.url, pageHash, recordHash: hash(value) },
  };
}

export function buildLobbying(value: unknown, previous: LobbyingData | null = null): LobbyingData {
  const input = lobbyingInputSchema.parse(value),
    plan = input.plan;
  if (previous && (hash(previous.plan) !== hash(plan) || previous.observedAt > input.observedAt))
    throw new Error('Lobbying scope changed or capture is stale');
  const records: LobbyingFiling[] = [],
    sources: LobbyingData['sources'] = [],
    coverage: LobbyingData['coverage'] = [],
    ids = new Set<string>();
  if (
    input.batches.length !== plan.clientIds.length * (plan.throughYear - plan.fromYear + 1) ||
    new Set(input.batches.map((b) => `${b.clientId}:${b.year}`)).size !== input.batches.length
  )
    throw new Error('Incomplete or duplicate lobbying coverage');
  for (const clientId of plan.clientIds)
    for (let year = plan.fromYear; year <= plan.throughYear; year++) {
      const batch = input.batches.find((b) => b.clientId === clientId && b.year === year);
      if (!batch) throw new Error('Missing lobbying client/year');
      let count = 0,
        total: number | undefined;
      for (const [i, page] of batch.pages.entries()) {
        if (!sameUrl(page.url, lobbyingUrl(clientId, year, i + 1)))
          throw new Error('LDA query changed');
        if (hash(page.raw) !== page.hash) throw new Error('LDA raw hash mismatch');
        if (page.observedAt > input.observedAt) throw new Error('LDA observation chronology');
        const parsedRaw = JSON.parse(page.raw),
          response = responseSchema.parse(parsedRaw);
        if (total !== undefined && total !== response.count)
          throw new Error('LDA count changed during capture');
        total = response.count;
        if (total > plan.maxPerClientYear)
          throw new Error('LDA query exceeds explicit cap; no partial collection published');
        if (response.results.length !== Math.min(25, total - count))
          throw new Error('Incomplete LDA page');
        count += response.results.length;
        const expectedNext = count < total ? lobbyingUrl(clientId, year, i + 2) : null;
        if (
          (response.next === null) !== (expectedNext === null) ||
          (response.next && expectedNext && !sameUrl(response.next, expectedNext))
        )
          throw new Error('LDA next page does not match query');
        if (
          i === 0
            ? response.previous !== null
            : !response.previous || !sameUrl(response.previous, lobbyingUrl(clientId, year, i))
        )
          throw new Error('LDA previous page does not match query');
        if ((expectedNext === null) !== (i === batch.pages.length - 1))
          throw new Error('Incomplete LDA pagination');
        for (const raw of parsedRaw.results) {
          const r = projectLobbying(raw, page.hash);
          if (ids.has(r.id)) throw new Error('Duplicate LDA filing');
          if (r.client.id !== clientId || r.year !== year)
            throw new Error('LDA filing outside client/year scope');
          if (Date.parse(r.posted) > Date.parse(page.observedAt))
            throw new Error('LDA filing posted after capture');
          ids.add(r.id);
          records.push(r);
        }
        sources.push({ url: page.url, hash: page.hash, observedAt: page.observedAt });
      }
      if (count !== total) throw new Error('Incomplete LDA count');
      coverage.push({ clientId, year, count });
    }
  records.sort((a, b) => a.id.localeCompare(b.id));
  const old = new Map(previous?.records.map((r) => [r.id, r.source.recordHash]) ?? []);
  const changes: LobbyingData['changes'] = previous
    ? {
        baselineAt: previous.observedAt,
        added: records.filter((r) => !old.has(r.id)).map((r) => r.id),
        updated: records
          .filter((r) => old.has(r.id) && old.get(r.id) !== r.source.recordHash)
          .map((r) => r.id),
        notReturned: [...old.keys()].filter((id) => !ids.has(id)).sort(),
      }
    : { baselineAt: null, added: [], updated: [], notReturned: [] };
  // Identical offline replay must retain the original change receipt and release identity.
  if (previous && previous.observedAt === input.observedAt) {
    if (hash(previous.records) !== hash(records) || hash(previous.sources) !== hash(sources))
      throw new Error('Different LDA evidence at the same capture time');
    Object.assign(changes, previous.changes);
  }
  return lobbyingDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'lobbying-agenda-v1',
    plan,
    observedAt: input.observedAt,
    sourceNotice: LDA_NOTICE,
    coverage,
    sources,
    records,
    changes,
  });
}

export async function acquireLobbying(
  planValue: unknown,
  workspace: string,
  fetcher: typeof fetch = fetch,
): Promise<Input> {
  const plan = lobbyingPlanSchema.parse(planValue),
    batches: Input['batches'] = [];
  let lastRequest = 0;
  for (const clientId of plan.clientIds)
    for (let year = plan.fromYear; year <= plan.throughYear; year++) {
      const pages: z.infer<typeof pageSchema>[] = [];
      let next: string | null = lobbyingUrl(clientId, year),
        count = 0,
        total: number | undefined;
      while (next) {
        // Anonymous allowance is 15/minute. Sequential 4.1-second spacing stays below it.
        const wait = Math.max(0, 4100 - (Date.now() - lastRequest));
        if (wait) await new Promise((r) => setTimeout(r, wait));
        lastRequest = Date.now();
        const response = await fetcher(next, {
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
          headers: {
            Accept: 'application/json',
            'User-Agent': 'LouderThanWords-local-research/1.0',
          },
        });
        if (!response.ok) {
          const retry = response.headers.get('retry-after');
          await response.body?.cancel();
          throw new Error(
            `LDA HTTP ${response.status}${retry ? `; retry after ${retry}` : ''}. Previous publication remains intact.`,
          );
        }
        if (!response.headers.get('content-type')?.includes('json')) {
          await response.body?.cancel();
          throw new Error('LDA returned non-JSON content');
        }
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Missing LDA body');
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.length;
            if (bytes > 4_000_000) throw new Error('LDA page exceeds 4 MB');
            chunks.push(part.value);
          }
        } finally {
          await reader.cancel();
        }
        const raw = Buffer.concat(chunks).toString('utf8'),
          parsed = responseSchema.parse(JSON.parse(raw));
        if (total !== undefined && total !== parsed.count)
          throw new Error('LDA count changed during capture');
        total = parsed.count;
        if (total > plan.maxPerClientYear) throw new Error('LDA query exceeds explicit cap');
        if (parsed.results.length !== Math.min(25, total - count))
          throw new Error('Incomplete LDA page');
        count += parsed.results.length;
        const receipt = { url: next, raw, hash: hash(raw), observedAt: new Date().toISOString() };
        pages.push(receipt);
        await writeAtomic(join(workspace, 'raw', `${receipt.hash}.json`), receipt);
        const expectedNext = count < total ? lobbyingUrl(clientId, year, pages.length + 1) : null;
        if (
          (parsed.next === null) !== (expectedNext === null) ||
          (parsed.next && expectedNext && !sameUrl(parsed.next, expectedNext))
        )
          throw new Error('LDA next page does not match query');
        // Reconstruct the URL instead of following a provider-controlled arbitrary location.
        next = expectedNext;
      }
      batches.push({ clientId, year, pages });
    }
  const input = { formatVersion: 1 as const, plan, observedAt: new Date().toISOString(), batches };
  buildLobbying(input); // No incomplete/scope-invalid capture becomes the offline reference.
  await writeAtomic(join(workspace, 'acquisition.json'), input);
  return input;
}

export async function runLobbying(options: {
  plan?: unknown;
  input?: unknown;
  workspace: string;
  output: string;
  offline?: boolean;
  fetcher?: typeof fetch;
}) {
  return withLock(options.workspace, async () => {
    // Take the baseline before acquisition, then compare-and-swap at publication.
    let previous: LobbyingData | null = null,
      expected: string | null = null;
    try {
      const manifest = JSON.parse(await readFile(join(options.output, 'manifest.json'), 'utf8'));
      if (!/^la-[a-f0-9]{24}$/.test(manifest.release)) throw new Error('Invalid lobbying release');
      expected = manifest.release;
      const raw = JSON.parse(
        await readFile(join(options.output, 'releases', manifest.release, 'data.json'), 'utf8'),
      );
      if (hash(raw) !== manifest.dataHash || expected !== `la-${hash(raw).slice(0, 24)}`)
        throw new Error('Previous lobbying release integrity failure');
      previous = lobbyingDataSchema.parse(raw);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || expected) throw error;
    }
    let input = options.input;
    if (input === undefined) {
      const plan = lobbyingPlanSchema.parse(options.plan);
      if (options.offline) {
        input = JSON.parse(await readFile(join(options.workspace, 'acquisition.json'), 'utf8'));
        if (hash(lobbyingInputSchema.parse(input).plan) !== hash(plan))
          throw new Error('Offline lobbying plan mismatch');
      } else input = await acquireLobbying(plan, options.workspace, options.fetcher);
    }
    const data = buildLobbying(input, previous);
    await writeAtomic(join(options.workspace, 'input.json'), input);
    const manifest = await publishSnapshot(data, options.output, 'la', expected);
    return {
      ...manifest,
      records: data.records.length,
      coverage: data.coverage,
      changes: data.changes,
    };
  });
}
