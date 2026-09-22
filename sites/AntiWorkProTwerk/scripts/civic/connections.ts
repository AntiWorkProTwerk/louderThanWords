import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from '../said-did/engine';
import { publishSnapshot } from './snapshots';
import { insiderDataSchema, type InsiderData } from '../../src/lib/civic/insiders';
import { stakeDataSchema, type StakeData } from '../../src/lib/civic/major-stakes';
import { sharedDataSchema, type SharedData } from '../../src/lib/civic/shared-investors';
import {
  connectionsDataSchema,
  connectionKinds,
  type ConnectionsData,
  type ConnectionEntity,
} from '../../src/lib/civic/connections';

export function buildConnections(
  insiders: InsiderData,
  stakes: StakeData,
  shared: SharedData,
  upstream: ConnectionsData['upstream'],
) {
  const ciks = [
    ...new Set([
      ...insiders.issuers.map((i) => i.cik),
      ...stakes.issuers.map((i) => i.cik),
      ...shared.companies.map((i) => i.cik),
    ]),
  ].sort();
  const entities: ConnectionEntity[] = [];
  for (const cik of ciks) {
    const a = insiders.issuers.find((i) => i.cik === cik),
      b = stakes.issuers.find((i) => i.cik === cik),
      c = shared.companies.find((i) => i.cik === cik);
    const views: ConnectionEntity['views'] = [];
    const inside = insiders.filings.filter((f) => f.issuerCik === cik),
      major = stakes.filings.filter((f) => f.issuerCik === cik);
    const positions = shared.cells.filter(
      (cell) => cell.company === cik && ['reported', 'zero-reported'].includes(cell.status),
    );
    const dates = (values: string[]) => ({
      from: [...values].sort()[0],
      through: [...values].sort().at(-1)!,
    });
    if (a && inside.length)
      views.push({
        kind: 'insiders',
        count: inside.length,
        unit: 'collected filings',
        ...dates(inside.map((f) => f.filed)),
        dateMeaning: 'Filing dates; transaction dates are separate',
        href: `/records/insiders/?issuer=${cik}`,
        profile: a.source,
      });
    if (b && major.length)
      views.push({
        kind: 'major-stakes',
        count: major.length,
        unit: 'collected filings',
        ...dates(major.map((f) => f.filed)),
        dateMeaning: 'Filing dates; includes amendments',
        href: `/records/major-stakes/?issuer=${cik}`,
        profile: b.source,
      });
    const group = shared.catalog.groups.find((g) => g.companies.includes(cik));
    if (c && positions.length && group)
      views.push({
        kind: 'shared-investors',
        count: positions.length,
        unit: 'reported manager / quarter cells',
        ...dates(positions.map((p) => p.period)),
        dateMeaning: 'Quarter-end holdings dates; not filing dates',
        href: `/records/shared-investors/?company=${cik}&group=${group.id}`,
        profile: c.profile,
      });
    if (views.length < 2) continue;
    const states = [
      ...new Set(
        views.map((v) =>
          v.kind === 'insiders' ? a?.state : v.kind === 'major-stakes' ? b?.state : c?.state,
        ),
      ),
    ];
    const state = states.length === 1 && states[0] ? states[0] : null;
    entities.push({
      cik,
      name: c?.name ?? a?.name ?? b!.name,
      ticker:
        shared.catalog.companies.find((i) => i.cik === cik)?.ticker ??
        a?.tickers[0] ??
        b?.tickers[0] ??
        '',
      state,
      geography: state
        ? 'Captured issuer business-address state agrees across these views. State-label anchor, not a transaction location.'
        : 'Captured business-address states differ or are missing. No map location is inferred.',
      views,
    });
  }
  return connectionsDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'connections-v1',
    method: 'exact-issuer-cik',
    upstream,
    entities,
  });
}

export async function runConnections(root: string, output = join(root, 'connections')) {
  const inputs: any[] = [],
    upstream: ConnectionsData['upstream'] = [];
  const schemas = [insiderDataSchema, stakeDataSchema, sharedDataSchema];
  const prefixes = ['it', 'ms', 'si'];
  for (let i = 0; i < connectionKinds.length; i++) {
    const kind = connectionKinds[i],
      directory = join(root, kind);
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
    if (!new RegExp(`^${prefixes[i]}-[a-f0-9]{24}$`).test(manifest.release))
      throw new Error(`Invalid ${kind} release`);
    const raw = JSON.parse(
      await readFile(join(directory, 'releases', manifest.release, 'data.json'), 'utf8'),
    );
    if (
      hash(raw) !== manifest.dataHash ||
      manifest.release !== `${prefixes[i]}-${hash(raw).slice(0, 24)}`
    )
      throw new Error(`Invalid ${kind} source hash`);
    const data = schemas[i].parse(raw);
    inputs.push(data);
    upstream.push({
      kind,
      release: manifest.release,
      dataHash: manifest.dataHash,
      observedAt: data.observedAt,
      selection: 'plan' in data ? data.plan.selection : data.catalog.selection,
    });
  }
  let expected: string | null = null;
  try {
    const old = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
    if (!/^cn-[a-f0-9]{24}$/.test(old.release)) throw new Error('Invalid connection release');
    expected = old.release;
    const raw = JSON.parse(
      await readFile(join(output, 'releases', expected!, 'data.json'), 'utf8'),
    );
    if (hash(raw) !== old.dataHash) throw new Error('Prior connection hash mismatch');
    const previous = connectionsDataSchema.parse(raw);
    if (
      previous.upstream.some((u) => {
        const next = upstream.find((n) => n.kind === u.kind)!;
        return (
          next.observedAt < u.observedAt ||
          (next.observedAt === u.observedAt && next.dataHash !== u.dataHash)
        );
      })
    )
      throw new Error('Connection source moved backward or changed at the same capture');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || expected) throw e;
  }
  const data = buildConnections(inputs[0], inputs[1], inputs[2], upstream);
  const manifest = await publishSnapshot(data, output, 'cn', expected);
  return {
    release: manifest.release,
    companies: data.entities.length,
    views: data.entities.reduce((n, e) => n + e.views.length, 0),
    bytes: Buffer.byteLength(JSON.stringify(data)),
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(
    JSON.stringify(
      await runConnections(
        resolve(process.argv[2] ?? 'public/data'),
        process.argv[3] ? resolve(process.argv[3]) : undefined,
      ),
      null,
      2,
    ),
  );
}
