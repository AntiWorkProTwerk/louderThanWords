import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from '../said-did/engine';
import { withLock, writeAtomic } from '../said-did/pipeline';
import { publishSnapshot } from './snapshots';
import { acquireLobbying, buildLobbying, lobbyingInputSchema } from './lobbying';
import { lobbyingPlanSchema } from '../../src/lib/civic/lobbying';
import {
  coveredPositionStatus,
  revolvingDataSchema,
  type RevolvingData,
  type CareerObservation,
} from '../../src/lib/civic/revolving';

const personSchema = z.object({
  id: z.number().int().positive().safe(),
  first_name: z.string(),
  middle_name: z.string().nullable(),
  last_name: z.string(),
  suffix_display: z.string().nullable(),
});
const appearanceSchema = z.object({
  lobbyist: personSchema,
  covered_position: z.string().nullable(),
  new: z.boolean(),
});
export function buildRevolving(
  value: unknown,
  previous: RevolvingData | null = null,
): RevolvingData {
  const input = lobbyingInputSchema.parse(value),
    base = buildLobbying(input),
    observations: CareerObservation[] = [];
  if (
    previous &&
    (hash(previous.plan) !== hash(base.plan) || previous.observedAt > base.observedAt)
  )
    throw new Error('Career collection scope changed or capture is stale');
  for (const batch of input.batches)
    for (const page of batch.pages)
      for (const raw of JSON.parse(page.raw).results) {
        for (const [activityIndex, activity] of raw.lobbying_activities.entries()) {
          // Missing arrays/fields are schema failures, never an assertion of no former positions.
          const appearances = z.array(appearanceSchema).parse(activity.lobbyists),
            ids = new Set<number>();
          for (const appearance of appearances) {
            const p = appearance.lobbyist;
            if (ids.has(p.id)) throw new Error('Duplicate lobbyist ID within a filing activity');
            ids.add(p.id);
            const name = [p.first_name, p.middle_name, p.last_name, p.suffix_display]
              .filter((s) => s !== null && s !== '')
              .join(' ');
            if (!name.trim()) throw new Error('Missing lobbyist name');
            observations.push({
              id: `${raw.filing_uuid}:${activityIndex}:${p.id}`,
              filingId: raw.filing_uuid,
              activityIndex,
              personId: p.id,
              name,
              coveredPosition: appearance.covered_position,
              positionStatus: coveredPositionStatus(appearance.covered_position),
              reportedNew: appearance.new,
            });
          }
        }
      }
  observations.sort((a, b) => a.id.localeCompare(b.id));
  const old = new Map(previous?.observations.map((o) => [o.id, hash(o)]) ?? []),
    ids = new Set(observations.map((o) => o.id));
  let changes: RevolvingData['changes'] = previous
    ? {
        baselineAt: previous.observedAt,
        added: observations.filter((o) => !old.has(o.id)).map((o) => o.id),
        updated: observations
          .filter((o) => old.has(o.id) && old.get(o.id) !== hash(o))
          .map((o) => o.id),
        notReturned: [...old.keys()].filter((id) => !ids.has(id)).sort(),
      }
    : { baselineAt: null, added: [], updated: [], notReturned: [] };
  if (previous?.observedAt === base.observedAt) {
    if (
      hash(previous.observations) !== hash(observations) ||
      hash(previous.filings) !== hash(base.records) ||
      hash(previous.sources) !== hash(base.sources)
    )
      throw new Error('Career evidence changed at the same capture time');
    changes = previous.changes;
  }
  return revolvingDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'revolving-record-v1',
    plan: base.plan,
    observedAt: base.observedAt,
    sourceNotice: base.sourceNotice,
    coverage: base.coverage,
    sources: base.sources,
    filings: base.records,
    observations,
    changes,
  });
}

export async function runRevolving(options: {
  input?: unknown;
  plan?: unknown;
  workspace: string;
  output: string;
  offline?: boolean;
  fetcher?: typeof fetch;
}) {
  return withLock(options.workspace, async () => {
    let previous: RevolvingData | null = null,
      expected: string | null = null;
    try {
      const manifest = JSON.parse(await readFile(join(options.output, 'manifest.json'), 'utf8'));
      if (!/^rd-[a-f0-9]{24}$/.test(manifest.release)) throw new Error('Invalid career release');
      expected = manifest.release;
      const raw = JSON.parse(
        await readFile(join(options.output, 'releases', manifest.release, 'data.json'), 'utf8'),
      );
      if (hash(raw) !== manifest.dataHash || expected !== `rd-${hash(raw).slice(0, 24)}`)
        throw new Error('Prior career release integrity failure');
      previous = revolvingDataSchema.parse(raw);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || expected) throw error;
    }
    let input = options.input;
    if (input === undefined) {
      const plan = lobbyingPlanSchema.parse(options.plan);
      if (options.offline) {
        input = JSON.parse(await readFile(join(options.workspace, 'acquisition.json'), 'utf8'));
        if (hash(lobbyingInputSchema.parse(input).plan) !== hash(plan))
          throw new Error('Offline career plan mismatch');
      } else input = await acquireLobbying(plan, options.workspace, options.fetcher);
    }
    const data = buildRevolving(input, previous);
    await writeAtomic(join(options.workspace, 'input.json'), input);
    const manifest = await publishSnapshot(data, options.output, 'rd', expected);
    return {
      ...manifest,
      filings: data.filings.length,
      observations: data.observations.length,
      people: new Set(data.observations.map((o) => o.personId)).size,
      withPositions: new Set(
        data.observations.filter((o) => o.positionStatus === 'disclosed').map((o) => o.personId),
      ).size,
      coverage: data.coverage,
    };
  });
}
