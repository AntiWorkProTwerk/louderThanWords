import { z } from 'zod';
import { join } from 'node:path';
import { hash } from '../said-did/engine';
import { readJson, writeAtomic, withLock } from '../said-did/pipeline';
import { publishSnapshot } from './snapshots';
import { trialDataSchema, trialSchema, type TrialData } from '../../src/lib/civic/trials';

export const trialPlanSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,80}$/),
  condition: z.string().min(2).max(100),
  pageSize: z.number().int().min(1).max(100).default(50),
  maxPages: z.number().int().min(1).max(10).default(2),
  maxTracked: z.number().int().min(1).max(2000).default(1000),
});
const recordSchema = z.object({
  study: z.record(z.string(), z.unknown()),
  source: z.object({
    url: z.string().url(),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    observedAt: z.string().datetime(),
  }),
});
export const trialInputSchema = z.object({
  formatVersion: z.literal(1),
  plan: trialPlanSchema,
  observedAt: z.string().datetime(),
  totalMatches: z.number().int().nonnegative().nullable(),
  discoveryTruncated: z.boolean(),
  records: z.array(recordSchema).max(2000),
});

function registryUrl(input: string) {
  const url = new URL(input);
  if (
    url.origin !== 'https://clinicaltrials.gov' ||
    url.username ||
    url.password ||
    url.hash ||
    !/^\/api\/v2\/studies(?:\/NCT\d{8})?$/.test(url.pathname)
  )
    throw new Error('Only official registry API study URLs are accepted.');
  const allowed = new Set([
    'format',
    'query.cond',
    'query.locn',
    'filter.overallStatus',
    'filter.ids',
    'pageSize',
    'pageToken',
    'countTotal',
    'sort',
  ]);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key)))
    throw new Error(
      'Unexpected registry query parameter. Do not include credentials in source URLs.',
    );
  return url;
}
function date(value: any) {
  if (!value?.date || !/^\d{4}(-\d{2})?(-\d{2})?$/.test(value.date)) return null;
  const segments = value.date.split('-');
  if (
    (segments[1] && (+segments[1] < 1 || +segments[1] > 12)) ||
    (segments[2] && !z.string().date().safeParse(value.date).success)
  )
    return null;
  return {
    value: value.date,
    precision:
      segments.length === 3
        ? ('day' as const)
        : segments.length === 2
          ? ('month' as const)
          : ('year' as const),
    type: ['ACTUAL', 'ESTIMATED'].includes(value.type) ? value.type : 'UNKNOWN',
  };
}
export function buildTrialData(
  input: unknown,
  previous: TrialData | null,
  states: { code: string; name: string }[],
): TrialData {
  const batch = trialInputSchema.parse(input);
  if (
    previous &&
    (previous.collectionId !== batch.plan.id || previous.condition !== batch.plan.condition)
  )
    throw new Error('Cannot mix different trial collections in one history.');
  if (previous && batch.observedAt < previous.observedAt)
    throw new Error('Cannot replace newer observations with an older input.');
  const stateNames = new Map(
    states.flatMap((s) => [
      [s.code.toLowerCase(), s.code],
      [s.name.toLowerCase(), s.code],
    ]),
  );
  const seen = new Set<string>(),
    studies: TrialData['studies'] = [],
    exclusions: TrialData['exclusions'] = [];
  for (const record of batch.records) {
    registryUrl(record.source.url);
    if (hash(record.study) !== record.source.hash) throw new Error('Study source hash mismatch');
    if (record.source.observedAt > batch.observedAt)
      throw new Error('Study observation is later than the snapshot timestamp');
    const raw = record.study as any,
      protocol = raw.protocolSection,
      identity = protocol?.identificationModule,
      status = protocol?.statusModule;
    const id = z
      .string()
      .regex(/^NCT\d{8}$/)
      .parse(identity?.nctId);
    if (seen.has(id)) throw new Error(`Duplicate registry identity ${id}`);
    seen.add(id);
    const priorRecord = previous?.studies.find((study) => study.id === id);
    if (
      priorRecord &&
      (record.source.observedAt < priorRecord.source.observedAt ||
        (batch.observedAt === previous!.observedAt &&
          record.source.hash !== priorRecord.source.hash))
    )
      throw new Error('Conflicting or stale study observation');
    if (!status?.overallStatus || !identity?.briefTitle)
      throw new Error(`Missing study identity/status: ${id}`);
    const warnings: string[] = [];
    const locations = (protocol.contactsLocationsModule?.locations ?? [])
      .filter((l: any) => l.country === 'United States')
      .map((l: any) => {
        const state = stateNames.get(String(l.state ?? '').toLowerCase()) ?? null;
        if (!state) warnings.push(`Unmapped reported state: ${l.state ?? 'not supplied'}`);
        const lat = l.geoPoint?.lat,
          lon = l.geoPoint?.lon;
        const valid =
          Number.isFinite(lat) &&
          Number.isFinite(lon) &&
          Math.abs(lat) <= 90 &&
          Math.abs(lon) <= 180;
        return {
          facility: l.facility ?? 'Facility not supplied',
          city: l.city ?? '',
          state,
          reportedState: l.state ?? '',
          lat: valid ? lat : null,
          lon: valid ? lon : null,
        };
      });
    // Previous records remain visible to history even if their location/status subsequently changes.
    if (!locations.length && !previous?.studies.some((s) => s.id === id)) {
      exclusions.push({ id, reason: 'No listed U.S. study location in this registry record.' });
      continue;
    }
    const sponsor = protocol.sponsorCollaboratorsModule?.leadSponsor;
    const completion = date(status.completionDateStruct);
    if (!completion)
      warnings.push('Completion date missing or unsupported; no duration is inferred.');
    const results =
      raw.hasResults === true ? 'posted' : raw.hasResults === false ? 'not_posted' : 'unknown';
    const firstResultsPosted = date(status.resultsFirstPostDateStruct);
    if (results === 'unknown')
      warnings.push('Registry hasResults flag is missing; results status remains unknown.');
    studies.push(
      trialSchema.parse({
        id,
        title: identity.briefTitle,
        status: status.overallStatus,
        sponsor: {
          id: `registry-sponsor-${hash(sponsor?.name ?? `unknown-${id}`).slice(0, 20)}`,
          name: sponsor?.name ?? 'Sponsor not supplied',
          category: sponsor?.class ?? 'UNKNOWN',
        },
        conditions: protocol.conditionsModule?.conditions ?? [],
        mesh: raw.derivedSection?.conditionBrowseModule?.meshes ?? [],
        completion,
        primaryCompletion: date(status.primaryCompletionDateStruct),
        firstResultsPosted,
        updated: date(status.lastUpdatePostDateStruct),
        results,
        states: [...new Set(locations.map((l: any) => l.state).filter(Boolean))].sort(),
        locations,
        publications: (protocol.referencesModule?.references ?? [])
          .filter((r: any) => /^\d+$/.test(r.pmid ?? ''))
          .map((r: any) => ({ pmid: r.pmid, type: r.type ?? 'UNKNOWN' })),
        source: record.source,
        warnings: [...new Set(warnings)],
      }),
    );
  }
  for (const prior of previous?.studies ?? [])
    if (!seen.has(prior.id))
      throw new Error(
        `Tracked study was not refreshed: ${prior.id}. Refusing an incomplete tracking snapshot.`,
      );
  const events = [...(previous?.events ?? [])];
  for (const study of studies) {
    const old = previous?.studies.find((s) => s.id === study.id);
    if (!old) continue;
    if (study.results === 'posted' && old.results === 'not_posted')
      events.push({
        studyId: study.id,
        kind: 'results_appeared',
        observedAt: study.source.observedAt,
        previousObservedAt: old.source.observedAt,
        detail: 'Registry results changed from not posted to posted between these observations.',
      });
    if (study.results === 'not_posted' && old.results === 'posted')
      events.push({
        studyId: study.id,
        kind: 'results_no_longer_marked',
        observedAt: study.source.observedAt,
        previousObservedAt: old.source.observedAt,
        detail:
          'The registry results flag changed to not posted. This is not an explanation of why.',
      });
    if (study.status !== old.status)
      events.push({
        studyId: study.id,
        kind: 'status_changed',
        observedAt: study.source.observedAt,
        previousObservedAt: old.source.observedAt,
        detail: `Reported study status changed from ${old.status} to ${study.status}.`,
      });
  }
  const coverage: Record<string, number> = {};
  for (const study of studies.filter((s) => s.status === 'COMPLETED'))
    for (const state of study.states) coverage[state] = (coverage[state] ?? 0) + 1;
  return trialDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'trial-results-v1',
    collectionId: batch.plan.id,
    condition: batch.plan.condition,
    observedAt: batch.observedAt,
    trackingStartedAt: previous?.trackingStartedAt ?? batch.observedAt,
    totalMatches: batch.totalMatches,
    discoveryTruncated: batch.discoveryTruncated,
    studies: studies.sort((a, b) => a.id.localeCompare(b.id)),
    states: coverage,
    exclusions,
    events,
  });
}

async function requestPage(url: URL, workspace: string, fetcher: typeof fetch, receipts: any[]) {
  registryUrl(url.href);
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetcher(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: { Accept: 'application/json' },
    });
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      continue;
    }
    if (!response.ok || !response.body)
      throw new Error(`Registry request failed: ${response.status}`);
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.length;
        if (size > 12_000_000) {
          await reader.cancel();
          throw new Error('Registry page exceeds 12 MB; reduce pageSize.');
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    const raw = Buffer.concat(chunks).toString('utf8'),
      payload = JSON.parse(raw);
    if (!Array.isArray(payload.studies)) throw new Error('Registry returned no studies array.');
    const rawHash = hash(raw),
      observedAt = new Date().toISOString();
    await writeAtomic(join(workspace, 'raw', `${rawHash}.json`), {
      raw,
      url: url.href,
      observedAt,
    });
    receipts.push({ url: url.href, rawHash, observedAt });
    return { payload, observedAt, url: url.href };
  }
  throw new Error('Registry request exhausted retries');
}
export async function collectTrials(
  planInput: unknown,
  previous: TrialData | null,
  workspace: string,
  fetcher = fetch,
) {
  const plan = trialPlanSchema.parse(planInput),
    records = new Map<string, any>(),
    pages: any[] = [];
  let token: string | undefined,
    totalMatches: number | null = null;
  const tokens = new Set<string>();
  for (let i = 0; i < plan.maxPages; i++) {
    const url = new URL('https://clinicaltrials.gov/api/v2/studies');
    Object.entries({
      format: 'json',
      'query.cond': plan.condition,
      'query.locn': 'United States',
      'filter.overallStatus': 'COMPLETED',
      pageSize: String(plan.pageSize),
      countTotal: 'true',
      sort: 'LastUpdatePostDate:desc',
      ...(token ? { pageToken: token } : {}),
    }).forEach(([k, v]) => url.searchParams.set(k, v));
    const page = await requestPage(url, workspace, fetcher, pages);
    if (i === 0)
      totalMatches = Number.isInteger(page.payload.totalCount) ? page.payload.totalCount : null;
    for (const study of page.payload.studies) {
      const id = study.protocolSection?.identificationModule?.nctId;
      if (!id || records.has(id))
        throw new Error(
          'Duplicate or missing study ID across registry pages. Rerun a consistent acquisition.',
        );
      records.set(id, {
        study,
        source: { url: page.url, hash: hash(study), observedAt: page.observedAt },
      });
    }
    token = page.payload.nextPageToken;
    if (!token) break;
    if (tokens.has(token)) throw new Error('Repeated registry pagination token');
    tokens.add(token);
  }
  const missing = (previous?.studies ?? []).map((s) => s.id).filter((id) => !records.has(id));
  if (records.size + missing.length > plan.maxTracked)
    throw new Error(
      'Collection exceeds maxTracked. Increase the explicit bound or start a separate collection.',
    );
  // Refresh tracked IDs that moved outside the discovery window; absence is not treated as removal.
  for (let i = 0; i < missing.length; i += 50) {
    const ids = missing.slice(i, i + 50),
      url = new URL('https://clinicaltrials.gov/api/v2/studies');
    url.search = new URLSearchParams({
      format: 'json',
      'filter.ids': ids.join(','),
      pageSize: '100',
    }).toString();
    const page = await requestPage(url, workspace, fetcher, pages);
    for (const study of page.payload.studies) {
      const id = study.protocolSection?.identificationModule?.nctId;
      if (!ids.includes(id) || records.has(id))
        throw new Error('Unexpected tracked registry identity');
      records.set(id, {
        study,
        source: { url: page.url, hash: hash(study), observedAt: page.observedAt },
      });
    }
  }
  const input = trialInputSchema.parse({
    formatVersion: 1,
    plan,
    records: [...records.values()],
    observedAt: new Date().toISOString(),
    totalMatches,
    discoveryTruncated: !!token,
  });
  await writeAtomic(join(workspace, 'acquisition.json'), input);
  await writeAtomic(join(workspace, 'acquisition-receipts.json'), pages);
  return input;
}
export async function readTrialPublication(output: string) {
  let manifest: any;
  try {
    manifest = await readJson(join(output, 'manifest.json'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  if (!/^tr-[a-f0-9]{24}$/.test(manifest.release)) throw new Error('Invalid trial release');
  const data = await readJson(join(output, 'releases', manifest.release, 'data.json'));
  if (hash(data) !== manifest.dataHash || manifest.release !== `tr-${hash(data).slice(0, 24)}`)
    throw new Error('Trial release integrity check failed');
  return { manifest, data: trialDataSchema.parse(data) };
}
export async function runTrials(options: {
  plan?: unknown;
  input?: unknown;
  workspace: string;
  output: string;
  states: { code: string; name: string }[];
  offline?: boolean;
  fetcher?: typeof fetch;
}) {
  return withLock(options.workspace, async () => {
    const previous = await readTrialPublication(options.output);
    const input =
      options.input ??
      (options.offline
        ? await readJson(join(options.workspace, 'acquisition.json'))
        : await collectTrials(
            options.plan,
            previous?.data ?? null,
            options.workspace,
            options.fetcher,
          ));
    if (
      options.offline &&
      options.plan &&
      hash(trialPlanSchema.parse(options.plan)) !== hash(trialInputSchema.parse(input).plan)
    )
      throw new Error('Offline archive belongs to a different plan');
    const data = buildTrialData(input, previous?.data ?? null, options.states);
    const manifest = await publishSnapshot(
      data,
      options.output,
      'tr',
      previous?.manifest.release ?? null,
    );
    return {
      manifest,
      counts: {
        studies: data.studies.length,
        posted: data.studies.filter((s) => s.results === 'posted').length,
        events: data.events.length,
        states: Object.keys(data.states).length,
      },
    };
  });
}
