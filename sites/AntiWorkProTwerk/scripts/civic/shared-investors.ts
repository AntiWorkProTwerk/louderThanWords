import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { hash } from '../said-did/engine';
import { withLock, writeAtomic } from '../said-did/pipeline';
import { parseXml, decodeEntities } from '../said-did/sources';
import { acquireSecFile, secSourceSchema } from './sec-source';
import { acquireInsiderFile, insiderIssuerUrl } from './insider-source';
import { publishSnapshot } from './snapshots';
import { holdingsColumns, type HoldingsTable } from './holdings';
import { amountAdd, amountCompare, valueDollars } from '../../src/lib/civic/holdings';
import type { insiderRowSchema } from '../../src/lib/civic/insiders';
import { loadHoldings, createHoldingsReader } from '../../src/lib/civic/holdings-repository';
import {
  sharedCatalogSchema,
  sharedDataSchema,
  sharedCell,
  sharedEvidenceSchema,
  type SharedData,
} from '../../src/lib/civic/shared-investors';

const captureSchema = z.object({
  key: z.string(),
  source: secSourceSchema,
  body: z.string().max(20_000_000),
});
export const sharedInputSchema = z.object({
  formatVersion: z.literal(1),
  catalog: sharedCatalogSchema,
  captures: z.array(captureSchema).max(2200),
  holdings: z.object({
    manifest: z.unknown(),
    data: z.unknown(),
    artifacts: z.record(z.string(), z.unknown()),
  }),
});
export type SharedInput = z.infer<typeof sharedInputSchema>;
const identityKey = (cusip: string) => `identity-${cusip.toLowerCase()}`;
export function sharedFilingUrl(url: string, extension: 'xml' | 'html', cik?: string) {
  const u = new URL(url);
  if (
    u.origin !== 'https://www.sec.gov' ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    !new RegExp(
      `^/Archives/edgar/data/${cik ? String(Number(cik)) : '\\d+'}/\\d{18}/[a-zA-Z0-9_-]+\\.${extension === 'html' ? 'html?' : 'xml'}$`,
    ).test(u.pathname)
  )
    throw new Error('Expected exact official SEC filing document URL');
  return url;
}
function memoryFetcher(input: SharedInput['holdings']): typeof fetch {
  return (async (url) => {
    const p = String(url),
      prefix = '/data/holdings/';
    if (!p.startsWith(prefix)) throw new Error('Unexpected holdings path');
    if (p === prefix + 'manifest.json') return Response.json(input.manifest);
    const m = p.match(/^\/data\/holdings\/releases\/(hf-[a-f0-9]{24})\/(.+)$/);
    if (!m || m[1] !== (input.manifest as { release?: string })?.release)
      return new Response('', { status: 404 });
    const value = m[2] === 'data.json' ? input.data : input.artifacts[m[2]];
    return value === undefined ? new Response('', { status: 404 }) : Response.json(value);
  }) as typeof fetch;
}
export async function acquireSharedInvestors(
  catalogInput: unknown,
  holdingsDirectory: string,
  workspace: string,
  offline = false,
) {
  const catalog = sharedCatalogSchema.parse(catalogInput),
    captures: SharedInput['captures'] = [];
  async function capture(key: string, result: Awaited<ReturnType<typeof acquireSecFile>>) {
    captures.push({ key, source: result.source, body: await readFile(result.path, 'utf8') });
  }
  for (const c of catalog.companies) {
    await capture(
      'issuer-' + c.cik,
      await acquireInsiderFile(join(workspace, 'metadata'), { cik: c.cik }, offline),
    );
    for (const s of c.securities)
      await capture(
        identityKey(s.cusip),
        await acquireSecFile(
          join(workspace, 'metadata'),
          {
            key: identityKey(s.cusip),
            url: sharedFilingUrl(s.identityUrl, 'xml', c.cik),
            extension: 'xml',
            cap: 2_000_000,
          },
          offline,
        ),
      );
  }
  for (const g of catalog.groups)
    if (g.kind === 'curated')
      await capture(
        'group-' + g.id,
        await acquireSecFile(
          join(workspace, 'metadata'),
          {
            key: 'group-' + g.id,
            url: sharedFilingUrl(g.sourceUrl!, 'html'),
            extension: 'html',
            cap: 20_000_000,
          },
          offline,
        ),
      );
  // Freeze the manifest once. Subsequent reads cannot follow a concurrently updated pointer.
  const manifest = JSON.parse(await readFile(join(holdingsDirectory, 'manifest.json'), 'utf8'));
  if (!/^hf-[a-f0-9]{24}$/.test(manifest.release)) throw new Error('Invalid upstream release');
  const directory = join(holdingsDirectory, 'releases', manifest.release),
    artifacts: Record<string, unknown> = {};
  const data = JSON.parse(await readFile(join(directory, 'data.json'), 'utf8'));
  const fetcher = (async (url) => {
    const path = String(url);
    if (path === '/data/holdings/manifest.json') return Response.json(manifest);
    const prefix = `/data/holdings/releases/${manifest.release}/`;
    if (!path.startsWith(prefix)) throw new Error('Unexpected upstream request');
    const file = path.slice(prefix.length);
    if (file === 'data.json') return Response.json(data);
    if (!Object.hasOwn(manifest.files, file)) throw new Error('Unlisted upstream artifact');
    artifacts[file] ??= JSON.parse(await readFile(join(directory, file), 'utf8'));
    return Response.json(artifacts[file]);
  }) as typeof fetch;
  const bundle = await loadHoldings(fetcher),
    reader = createHoldingsReader(fetcher),
    cusips = new Set(catalog.companies.flatMap((c) => c.securities.map((s) => s.cusip)));
  for (const s of bundle.data.snapshots) {
    for (const accession of s.filings) await reader.filing(bundle, accession);
    const positions = await reader.positions(bundle, s.id);
    for (const p of positions)
      if (cusips.has(p.cusip) && p.unit === 'SH' && p.option === '')
        for (const r of p.refs) await reader.rows(bundle, r.accession, Math.floor(r.index / 500));
  }
  return sharedInputSchema.parse({
    formatVersion: 1,
    catalog,
    captures,
    holdings: { manifest, data, artifacts },
  });
}
const profileSchema = z.object({
  cik: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  sic: z.string(),
  sicDescription: z.string(),
  addresses: z.object({ business: z.object({ stateOrCountry: z.string().nullable() }) }),
});
function clean(value: unknown): string {
  return typeof value === 'string' ? decodeEntities(value).replace(/\s+/g, ' ').trim() : '';
}
export async function buildSharedInvestors(raw: unknown, previous: SharedData | null = null) {
  const input = sharedInputSchema.parse(raw),
    { catalog } = input,
    used = new Set<string>();
  if (new Set(input.captures.map((c) => c.key)).size !== input.captures.length)
    throw new Error('Duplicate metadata capture');
  function capture(key: string, url: string) {
    const c = input.captures.find((c) => c.key === key);
    if (
      !c ||
      c.source.url !== url ||
      Buffer.byteLength(c.body) !== c.source.bytes ||
      createHash('sha256').update(c.body).digest('hex') !== c.source.hash
    )
      throw new Error('Metadata source integrity failure');
    used.add(key);
    return c;
  }
  const companies: SharedData['companies'] = catalog.companies.map((c) => {
    const profile = capture('issuer-' + c.cik, insiderIssuerUrl(c.cik)),
      p = profileSchema.parse(JSON.parse(profile.body));
    if (String(p.cik).padStart(10, '0') !== c.cik)
      throw new Error('Profile company identity mismatch');
    const identities = c.securities.map((s) => {
      const raw = capture(identityKey(s.cusip), sharedFilingUrl(s.identityUrl, 'xml', c.cik));
      const root = parseXml(raw.body).edgarSubmission;
      const cover = root?.formData?.coverPageHeader,
        info = cover?.issuerInfo;
      const cusips = info?.issuerCusips?.issuerCusipNumber,
        values = Array.isArray(cusips) ? cusips : [cusips];
      if (
        !['SCHEDULE 13G', 'SCHEDULE 13G/A'].includes(clean(root?.headerData?.submissionType)) ||
        clean(info?.issuerCik).padStart(10, '0') !== c.cik ||
        !values.some((v) => clean(v) === s.cusip)
      )
        throw new Error('Schedule 13G issuer/CUSIP identity mismatch');
      const event = clean(cover.eventDateRequiresFilingThisStatement).match(
        /^(\d{2})\/(\d{2})\/(\d{4})$/,
      );
      if (!event) throw new Error('Invalid identity event date');
      const eventDate = `${event[3]}-${event[1]}-${event[2]}`;
      if (eventDate < s.from || eventDate > s.through)
        throw new Error('Identity evidence outside curated mapping interval');
      return {
        cusip: s.cusip,
        name: clean(info.issuerName),
        securityClass: clean(cover.securitiesClassTitle),
        eventDate,
        source: raw.source,
      };
    });
    return {
      cik: c.cik,
      name: p.name,
      state: /^[A-Z]{2}$/.test(p.addresses.business.stateOrCountry ?? '')
        ? p.addresses.business.stateOrCountry
        : null,
      sic: p.sic,
      sicDescription: p.sicDescription,
      profile: profile.source,
      identities,
    };
  });
  const groups = catalog.groups.map((g) => {
    if (g.kind === 'sic') {
      if (g.companies.some((id) => !g.sicCodes.includes(companies.find((c) => c.cik === id)!.sic)))
        throw new Error('Peer company does not match curated SIC classification');
      return { id: g.id, source: null };
    }
    const c = capture('group-' + g.id, sharedFilingUrl(g.sourceUrl!, 'html'));
    const text = clean(
      c.body.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '),
    );
    if (!text.includes(clean(g.excerpt)))
      throw new Error('Curated group excerpt missing from official filing');
    return { id: g.id, source: c.source };
  });
  if (used.size !== input.captures.length) throw new Error('Unscoped metadata capture');
  const fetcher = memoryFetcher(input.holdings),
    bundle = await loadHoldings(fetcher),
    reader = createHoldingsReader(fetcher);
  const periods = [...new Set(bundle.data.snapshots.map((s) => s.period))].sort(),
    managers = bundle.data.plan.managers.map((cik) => ({
      cik,
      name: bundle.data.snapshots.filter((s) => s.cik === cik).at(-1)?.name ?? `CIK ${cik}`,
    }));
  const cells: SharedData['cells'] = [],
    attachments: Record<string, unknown> = {};
  function validateRow(row: z.infer<typeof insiderRowSchema>, table: HoldingsTable) {
    if (
      row.hash !== hash(row.fields) ||
      Object.keys(row.fields).some(
        (k) => !(holdingsColumns[table] as readonly string[]).includes(k),
      )
    )
      throw new Error('Holding row integrity or privacy whitelist mismatch');
  }
  for (const manager of managers)
    for (const period of periods) {
      const snapshot = bundle.data.snapshots.find(
          (s) => s.cik === manager.cik && s.period === period,
        ),
        positions = snapshot ? await reader.positions(bundle, snapshot.id) : [];
      const filings = [];
      for (const accession of snapshot?.filings ?? [])
        filings.push(await reader.filing(bundle, accession));
      for (const f of filings) {
        validateRow(f.submission, 'SUBMISSION');
        validateRow(f.cover, 'COVERPAGE');
        if (f.summary) validateRow(f.summary, 'SUMMARYPAGE');
        f.reportingFor.forEach((r) => validateRow(r, 'OTHERMANAGER'));
        f.includedManagers.forEach((r) => validateRow(r, 'OTHERMANAGER2'));
      }
      for (const company of catalog.companies) {
        const cell = sharedCell(company, manager.cik, period, snapshot, positions),
          selected =
            cell.status === 'unavailable'
              ? []
              : positions.filter(
                  (p) =>
                    p.unit === 'SH' &&
                    p.option === '' &&
                    company.securities.some((s) => s.cusip === p.cusip),
                );
        const rows = [];
        for (const p of selected) {
          let quantity = '0',
            value = '0';
          const seen = new Set<string>();
          for (const ref of p.refs) {
            const page = Math.floor(ref.index / 500),
              row = (await reader.rows(bundle, ref.accession, page))[ref.index % 500];
            validateRow(row, 'INFOTABLE');
            if (
              row.fields.CUSIP !== p.cusip ||
              row.fields.SSHPRNAMTTYPE !== 'SH' ||
              row.fields.PUTCALL ||
              seen.has(`${ref.accession}/${ref.index}`)
            )
              throw new Error('Selected holding row integrity or security mismatch');
            seen.add(`${ref.accession}/${ref.index}`);
            quantity = amountAdd(quantity, row.fields.SSHPRNAMT);
            value = amountAdd(
              value,
              valueDollars(
                row.fields.VALUE,
                filings.find((f) => f.filing.accession === ref.accession)!.filing.filed,
              ),
            );
            rows.push({
              accession: ref.accession,
              index: ref.index,
              pageHash: bundle.manifest.files[`rows/${ref.accession}-${page}.json`],
              row,
            });
          }
          if (
            !p.refs.length ||
            amountCompare(quantity, p.quantity) !== 0 ||
            amountCompare(value, p.value) !== 0
          )
            throw new Error('Selected position does not reconcile to original source rows');
        }
        cells.push(cell);
        attachments[`evidence/${cell.id}.json`] = sharedEvidenceSchema.parse({
          cell,
          upstreamRelease: bundle.manifest.release,
          positions: selected,
          filings,
          rows,
        });
      }
    }
  const observedAt = [bundle.data.observedAt, ...input.captures.map((c) => c.source.observedAt)]
    .sort()
    .at(-1)!;
  const data = sharedDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'shared-investors-v1',
    catalog,
    observedAt,
    upstream: {
      release: bundle.manifest.release,
      dataHash: bundle.manifest.dataHash,
      observedAt: bundle.data.observedAt,
      selection: bundle.data.plan.selection,
    },
    companies,
    groups,
    managers,
    periods,
    cells,
  });
  if (previous) {
    const previousSources = [
      ...previous.companies.flatMap((c) => [c.profile, ...c.identities.map((i) => i.source)]),
      ...previous.groups.flatMap((g) => (g.source ? [g.source] : [])),
    ];
    for (const old of previousSources) {
      const next = input.captures.find((c) => c.source.url === old.url)?.source;
      if (
        next &&
        (next.observedAt < old.observedAt ||
          (next.observedAt === old.observedAt && next.hash !== old.hash))
      )
        throw new Error('Stale or changed metadata source capture');
    }
    if (
      data.upstream.observedAt === previous.upstream.observedAt &&
      data.upstream.dataHash !== previous.upstream.dataHash
    )
      throw new Error('Upstream holdings changed at the same capture');
    if (
      data.observedAt < previous.observedAt ||
      data.upstream.observedAt < previous.upstream.observedAt
    )
      throw new Error('Stale shared-investor input');
    if (
      previous.catalog.id !== catalog.id ||
      previous.companies.some((c) => !companies.some((n) => n.cik === c.cik)) ||
      previous.managers.some((m) => !managers.some((n) => n.cik === m.cik)) ||
      previous.periods.some((p) => !periods.includes(p))
    )
      throw new Error('Shared-investor collection scope disappeared');
    if (previous.catalog.version === catalog.version && hash(previous.catalog) !== hash(catalog))
      throw new Error('Catalog changes require a new explicit version');
    if (previous.observedAt === data.observedAt && hash(previous) !== hash(data))
      throw new Error('Shared-investor evidence changed at same capture');
  }
  return { data, attachments };
}
export async function runSharedInvestors(options: {
  plan?: unknown;
  input?: unknown;
  holdings: string;
  workspace: string;
  output: string;
  offline?: boolean;
}) {
  return withLock(options.workspace, async () => {
    let expected: string | null = null,
      previous: SharedData | null = null;
    try {
      const m = JSON.parse(await readFile(join(options.output, 'manifest.json'), 'utf8'));
      if (!/^si-[a-f0-9]{24}$/.test(m.release)) throw new Error('Invalid shared-investor release');
      expected = m.release;
      const raw = JSON.parse(
        await readFile(join(options.output, 'releases', expected!, 'data.json'), 'utf8'),
      );
      if (hash(raw) !== m.dataHash || expected !== `si-${hash(raw).slice(0, 24)}`)
        throw new Error('Prior shared-investor hash mismatch');
      previous = sharedDataSchema.parse(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || expected) throw e;
    }
    const input =
      options.input ??
      (await acquireSharedInvestors(
        options.plan,
        options.holdings,
        options.workspace,
        options.offline,
      ));
    await writeAtomic(join(options.workspace, 'input.json'), input);
    const { data, attachments } = await buildSharedInvestors(input, previous);
    const manifest = await publishSnapshot(data, options.output, 'si', expected, attachments);
    const result = {
      release: manifest.release,
      upstream: data.upstream.release,
      companies: data.companies.length,
      managers: data.managers.length,
      periods: data.periods,
      cells: data.cells.length,
    };
    await writeAtomic(join(options.workspace, 'last-run.json'), result);
    return result;
  });
}
