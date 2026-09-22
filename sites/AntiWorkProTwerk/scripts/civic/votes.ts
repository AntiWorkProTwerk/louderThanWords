import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash, measureMentions, normalizeText, validateCorpus } from '../said-did/engine';
import { withLock } from '../said-did/pipeline';
import { officialUrl } from '../said-did/sources';
import { voteDataSchema, voteManifestSchema, type VoteData } from '../../src/lib/civic/votes';

export function buildVoteReceipts(input: unknown): VoteData {
  const corpus = validateCorpus(input);
  const sources = new Map(corpus.sources.map((s) => [s.id, s]));
  const measures = new Map(corpus.measures.map((m) => [m.id, m]));
  const people = new Map(corpus.people.map((p) => [p.id, p]));
  const excluded = [...corpus.scope.exclusions];
  const publishable = (sourceId: string) => {
    const s = sources.get(sourceId)!;
    if (corpus.scope.mode === 'demo') return s.publicationRights === 'fixture';
    if (s.publicationRights !== 'public_record' || !s.url) return false;
    officialUrl(s.url);
    return true;
  };
  const receipts: VoteData['receipts'] = [];
  const usedSources = new Set<string>();
  const usedMeasures = new Set<string>();
  for (const action of [...corpus.actions].sort(
    (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
  )) {
    if (action.kind === 'sponsorship') {
      excluded.push({ id: action.id, reason: 'Sponsorship is not a recorded vote.' });
      continue;
    }
    const measure = measures.get(action.measureId)!;
    if (!publishable(action.sourceId) || measure.versions.some((v) => !publishable(v.sourceId))) {
      excluded.push({
        id: action.id,
        reason: 'Vote or legislative text lacks permitted publication provenance.',
      });
      continue;
    }
    const person = action.personId ? people.get(action.personId)! : null;
    const terms =
      person?.terms.filter(
        (t) => t.chamber === action.chamber && t.from <= action.date && t.to >= action.date,
      ) ?? [];
    if (person && terms.length !== 1) {
      excluded.push({
        id: action.id,
        reason: 'A unique dated representation term is required for state placement.',
      });
      continue;
    }
    const cautions: string[] = [];
    if (action.kind === 'procedure')
      cautions.push(
        'This is a procedural decision, not a final yes/no vote on the underlying policy.',
      );
    if (action.kind === 'table')
      cautions.push(
        'A vote to table is a vote to set the question aside, not passage of the underlying measure.',
      );
    if (action.kind === 'combined_passage')
      cautions.push(
        'This question combines suspension of the rules with passage; preserve both parts.',
      );
    if (action.kind === 'amendment')
      cautions.push('This vote concerns an amendment, not necessarily passage of the whole bill.');
    if (action.kind === 'voice')
      cautions.push('The chamber acted by voice vote. No individual member choice is established.');
    if (action.vote === 'Not Voting')
      cautions.push(
        'Not Voting records no vote; it does not establish opposition, support, or the reason for absence.',
      );
    if (action.vote === 'Present') cautions.push('Present is neither Yea nor Nay.');
    if (action.operativeText !== 'established' || !action.versionId)
      cautions.push(
        'The exact text put to this vote has not been established. Available bill versions are context only; do not infer a position on each provision.',
      );
    else
      cautions.push(
        'Voting on a whole measure does not establish a separate position on every provision.',
      );
    receipts.push({
      id: action.id,
      action,
      person,
      state: terms[0]?.state ?? null,
      cautions,
      connections: [
        ...(person ? [{ kind: 'member' as const, id: person.id, label: person.name }] : []),
        { kind: 'measure', id: measure.id, label: measure.title },
      ],
    });
    usedSources.add(action.sourceId);
    usedMeasures.add(measure.id);
    measure.versions.forEach((v) => usedSources.add(v.sourceId));
  }
  const statements: VoteData['statements'] = [];
  for (const p of corpus.passages) {
    if (p.attribution !== 'verified' || !p.personId || !publishable(p.sourceId)) continue;
    const text = normalizeText(sources.get(p.sourceId)!.text).text.slice(p.start, p.end);
    const mentions = measureMentions(text);
    const linked = receipts.filter((r) => {
      const m = measures.get(r.action.measureId)!;
      const congressStart = 1789 + (m.congress - 1) * 2;
      // Explicit bill numbers are only joined inside the member's same-Congress term.
      return (
        r.person?.id === p.personId &&
        r.person.terms.some(
          (t) => t.chamber === r.action.chamber && t.from <= p.eventDate && t.to >= p.eventDate,
        ) &&
        (p.contextMeasureId === m.id ||
          (p.eventDate >= `${congressStart}-01-03` &&
            p.eventDate < `${congressStart + 2}-01-03` &&
            mentions.some((ref) => ref.type === m.type && ref.number === m.number)))
      );
    });
    if (!linked.length) continue;
    for (const measureId of new Set(linked.map((r) => r.action.measureId))) {
      const statementId = `${p.id}-${measureId}`;
      statements.push({
        id: statementId,
        passageId: p.id,
        personId: p.personId,
        measureId,
        sourceId: p.sourceId,
        text,
        date: p.eventDate,
      });
      for (const r of linked.filter((r) => r.action.measureId === measureId))
        r.connections.push({
          kind: 'statement',
          id: statementId,
          label: `Recorded statement · ${p.eventDate}`,
        });
    }
    usedSources.add(p.sourceId);
  }
  const states: Record<string, number> = {};
  for (const r of receipts) if (r.state) states[r.state] = (states[r.state] ?? 0) + 1;
  return voteDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'vote-receipts-v1',
    inputHash: hash(corpus),
    scope: corpus.scope,
    receipts,
    statements,
    states,
    excluded,
    measures: corpus.measures.filter((m) => usedMeasures.has(m.id)),
    sources: corpus.sources.filter((s) => usedSources.has(s.id)),
  });
}

// Portable job entry point: immutable payload first, atomic pointer last. No server or AI required.
export async function publishVoteReceipts(input: unknown, output: string) {
  const data = buildVoteReceipts(input);
  const dataHash = hash(data);
  const release = `vr-${dataHash.slice(0, 24)}`;
  return withLock(output, async () => {
    const directory = join(output, 'releases', release);
    await mkdir(directory, { recursive: true });
    const file = join(directory, 'data.json');
    try {
      if ((await readFile(file, 'utf8')) !== JSON.stringify(data))
        throw new Error('Immutable release content mismatch');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const payloadTemp = join(directory, `data.${randomUUID()}.tmp`);
      await writeFile(payloadTemp, JSON.stringify(data));
      await rename(payloadTemp, file);
    }
    const manifest = voteManifestSchema.parse({
      formatVersion: 1,
      release,
      dataHash,
      publishedAt: new Date().toISOString(),
    });
    const temp = join(output, `manifest.${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(manifest, null, 2));
    await rename(temp, join(output, 'manifest.json'));
    return {
      manifest,
      counts: {
        receipts: data.receipts.length,
        states: Object.keys(data.states).length,
        statements: data.statements.length,
      },
    };
  });
}
