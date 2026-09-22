import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from '../said-did/engine';
import { withLock, writeAtomic } from '../said-did/pipeline';
import { publishSnapshot } from './snapshots';
import {
  acquireFundVotes,
  fundVoteInputSchema,
  normalizeFundVotes,
} from './fund-votes-acquisition';
import { resolveFundVotes } from './fund-vote-resolution';
import {
  fundVoteDataSchema,
  fundVoteEvidencePageSchema,
  fundVoteFilingSchema,
  fundVoteFundDetailSchema,
  fundVoteMeetingSchema,
  fundVoteDirection,
  fundVoteSecurity,
  type FundVoteData,
  type FundVoteFile,
  type FundVoteMeeting,
  type FundVoteMeetingSummary,
  type FundVoteRecord,
} from '../../src/lib/civic/fund-votes';

type Normalized = ReturnType<typeof normalizeFundVotes>;
const ordered = (values: string[]) => [...new Set(values)].sort();

// Private normalized XML never becomes a bootstrap response. Every lazy child is
// addressed by path/hash/byte length from its parent, up to this small root index.
export function projectFundVotes(corpus: Normalized, sources: FundVoteData['sources']) {
  const attachments: Record<string, unknown> = {};
  const attach = (path: string, value: unknown): FundVoteFile => {
    const bytes = Buffer.byteLength(JSON.stringify(value));
    if (bytes > 8_000_000)
      throw new Error(`N-PX lazy file exceeds 8 MB; refine sharding before publication: ${path}`);
    if (Object.hasOwn(attachments, path)) throw new Error('Duplicate N-PX attachment path');
    attachments[path] = value;
    return { path, hash: hash(value), bytes };
  };
  const resolutions = resolveFundVotes(corpus.plan, corpus.covers);
  const covers = new Map(corpus.covers.map((c) => [c.accession, c]));
  const byAccession = new Map<string, Normalized['evidence']>();
  const rowPages = new Map<string, FundVoteFile>();
  for (const e of corpus.evidence) {
    if (!covers.has(e.record.accession) || hash(e.raw) !== e.record.rawHash)
      throw new Error('N-PX row has no cover or its raw evidence changed');
    const rows = byAccession.get(e.record.accession) ?? [];
    rows.push(e);
    byAccession.set(e.record.accession, rows);
  }
  const filings = [...corpus.covers]
    .sort((a, b) => a.accession.localeCompare(b.accession))
    .map((cover) => {
      const rows = (byAccession.get(cover.accession) ?? []).sort(
        (a, b) => a.record.file.localeCompare(b.record.file) || a.record.ordinal - b.record.ordinal,
      );
      const pages: FundVoteFile[] = [];
      for (let start = 0; start < rows.length; start += 200) {
        const page = start / 200;
        const value = fundVoteEvidencePageSchema.parse({
          accession: cover.accession,
          page,
          evidence: rows.slice(start, start + 200),
        });
        const ref = attach(`evidence/${cover.accession}/${page}.json`, value);
        pages.push(ref);
        for (const e of value.evidence) {
          if (rowPages.has(e.record.id)) throw new Error('Duplicate N-PX source row');
          rowPages.set(e.record.id, ref);
        }
      }
      const unassigned = rows
        .filter((e) => !cover.series.some((s) => s.id === e.record.series))
        .map((e) => ({ id: e.record.id, page: rowPages.get(e.record.id)! }));
      const docs = corpus.documents.find((d) => d.accession === cover.accession);
      if (!docs) throw new Error('Missing N-PX directory/index evidence');
      const detail = fundVoteFilingSchema.parse({
        cover,
        directory: docs.directory,
        index: docs.index,
        tables: corpus.tables
          .filter((t) => t.accession === cover.accession)
          .map(({ file, rows, source }) => ({ file, rows, source })),
        pages,
        rows: rows.length,
        unassigned,
      });
      return {
        cover,
        file: attach(`filings/${cover.accession}.json`, detail),
        rows: rows.length,
        unassignedRows: unassigned.length,
      };
    });
  const resolutionBySeries = new Map(resolutions.map((r) => [r.series, r]));
  const active = corpus.evidence
    .map((e) => e.record)
    .filter((r) => {
      const resolved = r.series ? resolutionBySeries.get(r.series) : null;
      return (
        resolved?.status === 'voting-report' &&
        resolved.active.includes(r.accession) &&
        covers.get(r.accession)?.series.some((s) => s.id === r.series)
      );
    });
  const meetingRows = new Map<string, FundVoteRecord[]>();
  const unmatched = active.filter((r) => !r.proposal);
  for (const r of active) {
    if (!r.proposal) continue;
    const security = fundVoteSecurity(r);
    if (
      !security ||
      !r.meeting ||
      !['ISSUER', 'SECURITY HOLDER'].includes(r.source ?? '') ||
      r.proposal !==
        `pv-${hash({ security, meeting: r.meeting, description: r.description, source: r.source }).slice(0, 24)}`
    )
      throw new Error('Invalid exact-proposal identity');
    const key = `mt-${hash({ security, meeting: r.meeting }).slice(0, 24)}`;
    const rows = meetingRows.get(key) ?? [];
    rows.push(r);
    meetingRows.set(key, rows);
  }
  const perFund = new Map(resolutions.map((r) => [r.series, [] as FundVoteMeetingSummary[]]));
  let proposals = 0,
    comparable = 0,
    differing = 0;
  for (const [id, rows] of [...meetingRows].sort(([a], [b]) => a.localeCompare(b))) {
    const groups = new Map<string, FundVoteRecord[]>();
    for (const row of rows) {
      const set = groups.get(row.proposal!) ?? [];
      set.push(row);
      groups.set(row.proposal!, set);
    }
    const items: FundVoteMeeting['proposals'] = [...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, records]) => {
        const funds = new Map<string, FundVoteRecord[]>();
        for (const r of records) {
          const list = funds.get(r.series!) ?? [];
          list.push(r);
          funds.set(r.series!, list);
        }
        const directions = [...funds.values()]
          .map(fundVoteDirection)
          .filter((d) => d.status === 'one-direction' || d.status === 'multiple-directions');
        const comparable = directions.length > 1;
        return {
          id,
          description: records[0].description,
          source: records[0].source as 'ISSUER' | 'SECURITY HOLDER',
          categories: ordered(records.flatMap((r) => r.categories)),
          comparable,
          differing:
            comparable && new Set(directions.map((d) => JSON.stringify(d.choices))).size > 1,
          records: records
            .sort((a, b) => a.series!.localeCompare(b.series!) || a.id.localeCompare(b.id))
            .map((record) => ({ record, page: rowPages.get(record.id)! })),
        };
      });
    const meeting = fundVoteMeetingSchema.parse({
      id,
      security: fundVoteSecurity(rows[0]),
      date: rows[0].meeting,
      proposals: items,
    });
    const file = attach(`meetings/${id}.json`, meeting);
    proposals += items.length;
    comparable += items.filter((i) => i.comparable).length;
    differing += items.filter((i) => i.differing).length;
    for (const series of ordered(rows.map((r) => r.series!))) {
      const included = items.filter((p) => p.records.some((r) => r.record.series === series));
      const comparableToFund = included.filter((p) => {
        const direction = fundVoteDirection(
          p.records.filter((r) => r.record.series === series).map((r) => r.record),
        );
        return (
          p.comparable &&
          (direction.status === 'one-direction' || direction.status === 'multiple-directions')
        );
      });
      perFund.get(series)!.push({
        id,
        security: meeting.security,
        date: meeting.date,
        issuers: ordered(rows.map((r) => r.issuer)),
        categories: ordered(included.flatMap((p) => p.categories)),
        proposals: included.length,
        comparable: comparableToFund.length,
        differing: comparableToFund.filter((p) => p.differing).length,
        file,
      });
    }
  }
  const activeBySeries = new Map(resolutions.map((r) => [r.series, [] as FundVoteRecord[]]));
  for (const r of active) activeBySeries.get(r.series!)!.push(r);
  const funds = resolutions.map((resolution) => {
    const latest = covers.get(resolution.active.at(-1) ?? resolution.filings.at(-1) ?? '');
    const meetings = perFund
      .get(resolution.series)!
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    const rows = activeBySeries.get(resolution.series)!;
    const detail = fundVoteFundDetailSchema.parse({
      series: resolution.series,
      meetings,
      unmatched: rows
        .filter((r) => !r.proposal)
        .map((r) => ({ id: r.id, page: rowPages.get(r.id)! })),
    });
    const unresolvedRows = rows.filter((r) => r.issues.length).length;
    const unassigned = filings
      .filter((f) => resolution.active.includes(f.cover.accession))
      .reduce((n, f) => n + f.unassignedRows, 0);
    return {
      ...resolution,
      cautions: [
        ...resolution.cautions,
        ...(unassigned
          ? [
              `${unassigned} row(s) in the applicable reports have unresolved series attribution; see filing evidence.`,
            ]
          : []),
      ],
      name: latest?.series.find((s) => s.id === resolution.series)?.name ?? resolution.series,
      // Conflicting/latest geography is not filled from a guessed older address.
      state: resolution.status === 'unresolved' ? null : (latest?.state ?? null),
      rows: rows.length,
      unresolvedRows,
      unmatchedRows: detail.unmatched.length,
      meetings: meetings.length,
      proposals: meetings.reduce((n, m) => n + m.proposals, 0),
      comparable: meetings.reduce((n, m) => n + m.comparable, 0),
      differing: meetings.reduce((n, m) => n + m.differing, 0),
      file: attach(`funds/${resolution.series.toLowerCase()}.json`, detail),
    };
  });
  const data = fundVoteDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'fund-votes-public-v1',
    plan: corpus.plan,
    observedAt: corpus.observedAt,
    sources: [...sources].sort((a, b) => a.key.localeCompare(b.key)),
    funds,
    filings,
    exclusions: corpus.excluded,
    counts: {
      scanned: corpus.scanned,
      unselectedRows: corpus.unselectedRows,
      retainedRows: corpus.evidence.length,
      activeRows: active.length,
      unassignedRows: filings.reduce((n, f) => n + f.unassignedRows, 0),
      unresolvedRows: active.filter((r) => r.issues.length).length,
      unmatchedRows: unmatched.length,
      meetings: meetingRows.size,
      proposals,
      comparable,
      differing,
    },
  });
  return { data, attachments };
}

export function buildFundVotes(value: unknown, previous: FundVoteData | null = null) {
  const input = fundVoteInputSchema.parse(value);
  const result = projectFundVotes(
    normalizeFundVotes(input),
    input.captures.map(({ key, source }) => ({ key, source })),
  );
  const { data } = result;
  if (previous) {
    if (
      data.plan.id !== previous.plan.id ||
      data.plan.period !== previous.plan.period ||
      data.plan.filedThrough < previous.plan.filedThrough ||
      previous.plan.funds.some(
        (f) => !data.plan.funds.some((n) => n.cik === f.cik && n.series === f.series),
      ) ||
      previous.filings.some(
        (f) => !data.filings.some((n) => n.cover.accession === f.cover.accession),
      )
    )
      throw new Error(
        'N-PX scope narrowed or retained filing disappeared; use a separate output for a different period',
      );
    const byUrl = new Map(data.sources.map((s) => [s.source.url, s.source]));
    for (const old of previous.sources) {
      const next = byUrl.get(old.source.url);
      if (
        !next ||
        Date.parse(next.observedAt) < Date.parse(old.source.observedAt) ||
        (Date.parse(next.observedAt) === Date.parse(old.source.observedAt) &&
          next.hash !== old.source.hash)
      )
        throw new Error('Missing, stale or changed-at-same-capture N-PX source');
    }
    if (
      Date.parse(data.observedAt) < Date.parse(previous.observedAt) ||
      (Date.parse(data.observedAt) === Date.parse(previous.observedAt) &&
        hash(data) !== hash(previous))
    )
      throw new Error('N-PX evidence changed at the same capture or moved backward');
  }
  return result;
}

export async function runFundVotes(options: {
  plan?: unknown;
  input?: unknown;
  workspace: string;
  output: string;
  offline?: boolean;
}) {
  return withLock(options.workspace, async () => {
    let expected: string | null = null,
      previous: FundVoteData | null = null;
    try {
      const manifest = JSON.parse(await readFile(join(options.output, 'manifest.json'), 'utf8'));
      if (!/^fv-[a-f0-9]{24}$/.test(manifest.release)) throw new Error('Invalid N-PX release');
      expected = manifest.release;
      const raw = JSON.parse(
        await readFile(join(options.output, 'releases', expected!, 'data.json'), 'utf8'),
      );
      if (hash(raw) !== manifest.dataHash || expected !== `fv-${hash(raw).slice(0, 24)}`)
        throw new Error('Prior N-PX integrity failure');
      previous = fundVoteDataSchema.parse(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || expected) throw e;
    }
    const input =
      options.input ?? (await acquireFundVotes(options.plan, options.workspace, options.offline));
    await writeAtomic(join(options.workspace, 'input.json'), input);
    const { data, attachments } = buildFundVotes(input, previous);
    const manifest = await publishSnapshot(data, options.output, 'fv', expected, attachments);
    const result = {
      release: manifest.release,
      funds: data.funds.length,
      ...data.counts,
      files: Object.keys(attachments).length,
      indexBytes: Buffer.byteLength(JSON.stringify(data)),
      attachmentBytes: Object.values(attachments).reduce<number>(
        (n, v) => n + Buffer.byteLength(JSON.stringify(v)),
        0,
      ),
    };
    await writeAtomic(join(options.workspace, 'last-run.json'), result);
    return result;
  });
}
