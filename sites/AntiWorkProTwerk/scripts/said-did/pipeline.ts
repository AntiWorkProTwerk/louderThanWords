import { mkdir, readFile, writeFile, rename, open, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  comparisonSchema,
  indexSchema,
  manifestSchema,
  type Corpus,
  type Claim,
  type Candidate,
  type Review,
  type Comparison,
  type EvidenceManifest,
} from '../../src/lib/said-did/schema.ts';
import {
  PIPELINE_VERSION,
  hash,
  normalizeText,
  validateCorpus,
  extractDeterministic,
  validateClaims,
  generateCandidates,
  validateReview,
} from './engine.ts';

export const siteRoot = fileURLToPath(new URL('../../', import.meta.url));
export const defaultWorkspace = join(siteRoot, '.local', 'said-did');
export const defaultOutput = join(siteRoot, 'public', 'data', 'said-did');
export type Store = {
  version: string;
  inputHash: string;
  corpus: Corpus;
  claims: Claim[];
  candidates: Candidate[];
  reviews: Review[];
  runs: {
    id: string;
    at: string;
    status: string;
    counts: Record<string, number>;
    extractor: string;
  }[];
};
export async function readJson(file: string) {
  return JSON.parse(await readFile(file, 'utf8'));
}
export async function writeAtomic(file: string, value: unknown) {
  await mkdir(resolve(file, '..'), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n');
  await rename(temp, file);
}
export async function withLock<T>(workspace: string, work: () => Promise<T>): Promise<T> {
  await mkdir(workspace, { recursive: true });
  const path = join(workspace, 'pipeline.lock');
  let lock;
  try {
    lock = await open(path, 'wx');
  } catch {
    throw new Error('Another local pipeline operation is active. Retry after it finishes.');
  }
  try {
    return await work();
  } finally {
    await lock.close();
    const { unlink } = await import('node:fs/promises');
    await unlink(path);
  }
}
export async function readStore(workspace = defaultWorkspace): Promise<Store> {
  return readJson(join(workspace, 'store.json'));
}
export async function prepare(
  input: unknown,
  options: {
    workspace?: string;
    extraction?: unknown;
    extractorVersion?: string;
    dryRun?: boolean;
    expectedInputHash?: string;
  } = {},
) {
  const workspace = options.workspace ?? defaultWorkspace;
  const corpus = validateCorpus(input);
  const claims = validateClaims(corpus, options.extraction ?? extractDeterministic(corpus));
  const inputHash = hash([
    PIPELINE_VERSION,
    corpus,
    claims,
    options.extractorVersion ?? 'deterministic-v1',
  ]);
  const candidates = generateCandidates(corpus, claims);
  const counts = {
    sources: corpus.sources.length,
    passages: corpus.passages.length,
    actions: corpus.actions.length,
    claims: claims.length,
    candidates: candidates.length,
    needsEvidence: candidates.filter((c) => c.blockers.length).length,
  };
  if (options.dryRun) return { inputHash, counts };
  return withLock(workspace, async () => {
    let previous: Store | undefined;
    try {
      previous = await readStore(workspace);
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (options.expectedInputHash && previous?.inputHash !== options.expectedInputHash)
      throw new Error(
        'The working corpus changed while this operation ran. Validated model outputs are cached; reload before applying them.',
      );
    if (previous?.inputHash === inputHash) return { inputHash, counts, reused: true };
    for (const s of corpus.sources) {
      const digest = hash(s.text),
        path = join(workspace, 'archive', `${digest}.json`);
      const record = { source: s, hash: digest, normalized: normalizeText(s.text) };
      try {
        await readFile(path);
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
        await writeAtomic(path, record);
      }
    }
    const at = new Date().toISOString();
    const run = {
      id: inputHash,
      at,
      status: 'completed',
      counts,
      extractor: options.extractorVersion ?? 'deterministic-v1',
    };
    const store: Store = {
      version: PIPELINE_VERSION,
      inputHash,
      corpus,
      claims,
      candidates,
      reviews: previous?.reviews ?? [],
      runs: [...(previous?.runs ?? []), run],
    };
    await writeAtomic(join(workspace, 'inputs', `${inputHash}.json`), {
      corpus,
      extraction: claims,
    });
    await writeAtomic(join(workspace, 'store.json'), store);
    await writeAtomic(join(workspace, 'checkpoint.json'), {
      inputHash,
      at,
      version: PIPELINE_VERSION,
    });
    return { inputHash, counts, reused: false };
  });
}
export async function addReview(input: unknown, workspace = defaultWorkspace) {
  return withLock(workspace, async () => {
    const store = await readStore(workspace);
    const candidate = store.candidates.find((c) => c.id === (input as Review).candidateId);
    if (!candidate) throw new Error('Candidate not found');
    const review = validateReview(candidate, input);
    const existing = store.reviews.find((r) => r.id === review.id);
    if (existing) {
      if (hash(existing) !== hash(review)) throw new Error('Review IDs are immutable');
      return existing;
    }
    store.reviews.push(review);
    await writeAtomic(join(workspace, 'reviews', `${review.id}.json`), review);
    await writeAtomic(join(workspace, 'store.json'), store);
    return review;
  });
}
export async function currentPublication(output = defaultOutput) {
  try {
    const manifest = manifestSchema.parse(await readJson(join(output, 'manifest.json')));
    const index = indexSchema.parse(
      await readJson(join(output, 'releases', manifest.release, 'index.json')),
    );
    const comparisons = await Promise.all(
      index.items.map(async (item) =>
        comparisonSchema.parse(
          await readJson(
            join(output, 'releases', manifest.release, 'comparisons', `${item.id}.json`),
          ),
        ),
      ),
    );
    return { manifest, index, comparisons };
  } catch (e: any) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}
export async function publish(workspace = defaultWorkspace, output = defaultOutput) {
  return withLock(workspace, async () => {
    const store = await readStore(workspace),
      previous = await currentPublication(output);
    const records: Comparison[] = [];
    for (const candidate of store.candidates) {
      const r = store.reviews
        .filter((r) => r.candidateId === candidate.id && r.fingerprint === candidate.fingerprint)
        .at(-1);
      if (!r || r.decision !== 'approved') continue;
      validateReview(candidate, r);
      const { person, action, measure, passage, claim } = candidate;
      if (
        !person ||
        !action ||
        !measure ||
        candidate.basis === 'none' ||
        !['statement_before_action', 'same_day_order_unknown'].includes(candidate.chronology)
      )
        throw new Error('Unsafe public projection');
      const term = person.terms.find(
        (t) => t.from <= action.date && t.to >= action.date && t.chamber === action.chamber,
      )!;
      const version = measure.versions.find((v) => v.id === action.versionId)!;
      const provisionText = normalizeText(
        store.corpus.sources.find((s) => s.id === version.sourceId)!.text,
      ).text;
      const provision = normalizeText(version.provision).text;
      const provisionStart = provisionText.indexOf(provision);
      if (provisionStart < 0) throw new Error('Approved provision disappeared from source.');
      const evidence = (
        [
          { id: passage.sourceId, role: 'statement', start: passage.start, end: passage.end },
          {
            id: action.sourceId,
            role: 'action',
            start: 0,
            end: normalizeText(store.corpus.sources.find((s) => s.id === action.sourceId)!.text)
              .text.length,
          },
          {
            id: version.sourceId,
            role: 'provision',
            start: provisionStart,
            end: provisionStart + provision.length,
          },
        ] as const
      ).map((e) => {
        const { text, ...source } = store.corpus.sources.find((s) => s.id === e.id)!;
        if (!['fixture', 'public_record'].includes(source.publicationRights))
          throw new Error('Restricted source cannot be published');
        return {
          ...source,
          hash: hash(text),
          excerpt: normalizeText(text).text.slice(e.start, e.end),
          role: e.role,
          normalizedStart: e.start,
          normalizedEnd: e.end,
        };
      });
      const old = previous?.comparisons.find((c) => c.id === candidate.id);
      const fingerprint = hash([candidate.fingerprint, r]);
      const changed = old && (old.fingerprint !== fingerprint || old.status !== 'published');
      const history = changed
        ? [
            ...old.history,
            {
              version: old.version,
              release: previous!.manifest.release,
              status: old.status,
              note: 'Superseded by a reviewed revision.',
            },
          ]
        : (old?.history ?? []);
      records.push(
        comparisonSchema.parse({
          id: candidate.id,
          version: changed ? old.version + 1 : (old?.version ?? 1),
          fingerprint,
          person,
          state: term.state,
          party: term.party,
          district: term.district,
          chamber: term.chamber,
          claim,
          statement: passage,
          action,
          measure: { ...measure, versions: [version] },
          assessment: r.assessment,
          explanation: r.explanation,
          limitations: [...new Set([...candidate.cautions, ...r.limitations])],
          basis: candidate.basis,
          chronology: candidate.chronology,
          evidence,
          reviewedAt: r.reviewedAt,
          publishedAt: r.reviewedAt,
          reviewMode:
            store.corpus.scope.mode === 'demo'
              ? 'demo'
              : r.independentReview
                ? 'independent'
                : 'single_reviewer',
          status: 'published',
          history,
        }),
      );
    }
    // Never silently retain a previously approved interpretation after a source
    // correction, removal, withdrawal, or changed extraction invalidates it.
    for (const old of previous?.comparisons ?? []) {
      if (records.some((c) => c.id === old.id)) continue;
      const latest = store.reviews.filter((r) => r.candidateId === old.id).at(-1);
      const status = latest?.decision === 'withdrawn' ? 'withdrawn' : 'correction_pending';
      records.push({
        ...old,
        status,
        explanation:
          'This assessment is not current. Its evidence or review state changed; a new review is required.',
        limitations: [
          'Do not treat this archived statement/action pairing as a current finding.',
          ...old.limitations,
        ],
        history:
          old.status === status
            ? old.history
            : [
                ...old.history,
                {
                  version: old.version,
                  release: previous!.manifest.release,
                  status: old.status,
                  note: 'Prior assessment retained for transparency; no longer current.',
                },
              ],
      });
    }
    records.sort((a, b) => a.id.localeCompare(b.id));
    const release = `sd-${hash([PIPELINE_VERSION, store.corpus.scope, records]).slice(0, 16)}`;
    const publishedAt =
      previous?.manifest.release === release
        ? previous.manifest.publishedAt
        : new Date().toISOString();
    const states: Record<string, number> = {};
    for (const c of records.filter((c) => c.status === 'published'))
      states[c.state] = (states[c.state] ?? 0) + 1;
    const manifest: EvidenceManifest = manifestSchema.parse({
      formatVersion: 1,
      release,
      publishedAt,
      scope: store.corpus.scope,
      counts: {
        sources: store.corpus.sources.length,
        passages: store.corpus.passages.length,
        actions: store.corpus.actions.length,
        candidates: store.candidates.length,
        published: records.filter((c) => c.status === 'published').length,
        needsEvidence: store.candidates.filter((c) => c.blockers.length).length,
        unmatched: store.candidates.filter((c) => !c.action).length,
      },
      states,
      lastSourceDate:
        store.corpus.sources
          .map((s) => s.date)
          .sort()
          .at(-1) ?? store.corpus.scope.through,
      methodologyVersion: PIPELINE_VERSION,
    });
    const index = indexSchema.parse({
      release,
      items: records.map((c) => ({
        id: c.id,
        version: c.version,
        state: c.state,
        party: c.party,
        district: c.district,
        chamber: c.chamber,
        assessment: c.assessment,
        status: c.status,
        personId: c.person.id,
        name: c.person.name,
        measureId: c.measure.id,
        measureTitle: c.measure.title,
        policy: c.measure.policy,
        quote: c.claim.quote,
        statementDate: c.statement.eventDate,
        actionDate: c.action.date,
        actionKind: c.action.kind,
        explanation: c.explanation,
      })),
      people: [
        ...new Map(
          [
            ...store.corpus.people.filter((p) => records.some((c) => c.person.id === p.id)),
            ...records.map((c) => c.person),
          ].map((p) => [p.id, p]),
        ).values(),
      ],
      measures: [
        ...new Map(
          records.map((c) => [
            c.measure.id,
            {
              ...c.measure,
              versions: [
                ...new Map(
                  records
                    .filter((other) => other.measure.id === c.measure.id)
                    .flatMap((other) => other.measure.versions)
                    .map((v) => [v.id, v]),
                ).values(),
              ],
            },
          ]),
        ).values(),
      ],
    });
    const directory = join(output, 'releases', release);
    const files: Record<string, unknown> = {
      'index.json': index,
      'coverage.json': {
        scope: manifest.scope,
        counts: manifest.counts,
        lastSourceDate: manifest.lastSourceDate,
      },
    };
    for (const c of records) files[`comparisons/${c.id}.json`] = c;
    for (const [name, data] of Object.entries(files)) {
      const path = join(directory, name);
      try {
        if (hash(await readJson(path)) !== hash(data))
          throw new Error('Immutable release collision');
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
        await writeAtomic(path, data);
      }
    }
    await writeAtomic(join(workspace, 'publications', `${release}.json`), manifest);
    await writeAtomic(join(output, 'manifest.json'), manifest);
    return manifest;
  });
}
export async function rollback(
  release: string,
  workspace = defaultWorkspace,
  output = defaultOutput,
) {
  if (!/^sd-[a-f0-9]{16}$/.test(release)) throw new Error('Invalid release ID');
  return withLock(workspace, async () => {
    const m = manifestSchema.parse(
      await readJson(join(workspace, 'publications', `${release}.json`)),
    );
    const target = indexSchema.parse(
      await readJson(join(output, 'releases', release, 'index.json')),
    );
    const current = await currentPublication(output);
    const store = await readStore(workspace);
    for (const item of target.items) {
      const detail = comparisonSchema.parse(
        await readJson(join(output, 'releases', release, 'comparisons', `${item.id}.json`)),
      );
      if (detail.status !== 'published') continue;
      const candidate = store.candidates.find((c) => c.id === item.id);
      const review =
        candidate &&
        store.reviews
          .filter((r) => r.candidateId === item.id && r.fingerprint === candidate.fingerprint)
          .at(-1);
      if (
        !candidate ||
        !review ||
        review.decision !== 'approved' ||
        detail.fingerprint !== hash([candidate.fingerprint, review])
      )
        throw new Error(
          'Rollback would resurrect a withdrawn or stale assertion; re-review and publish instead',
        );
      validateReview(candidate, review);
    }
    if (
      current?.comparisons.some(
        (c) =>
          c.status !== 'published' &&
          target.items.some((i) => i.id === c.id && i.status === 'published'),
      )
    )
      throw new Error(
        'Rollback would resurrect a withdrawn or stale assertion; re-review and publish instead',
      );
    await writeAtomic(join(output, 'manifest.json'), m);
    return m;
  });
}
export async function status(workspace = defaultWorkspace) {
  const s = await readStore(workspace);
  return {
    inputHash: s.inputHash,
    runs: s.runs,
    candidates: s.candidates.length,
    reviews: s.reviews.length,
    archives: (await readdir(join(workspace, 'archive'))).length,
  };
}
