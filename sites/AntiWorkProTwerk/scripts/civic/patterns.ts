import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from '../said-did/engine';
import { publishSnapshot } from './snapshots';
import { paycheckDataSchema, type PaycheckData } from '../../src/lib/civic/paycheck';
import { economyDataSchema, type EconomyData } from '../../src/lib/civic/economy';
import { patternsDataSchema, type PatternsData } from '../../src/lib/civic/patterns';

export function buildPatterns(
  paycheck: PaycheckData,
  economy: EconomyData,
  upstream: PatternsData['upstream'],
) {
  const first = Math.max(Number(paycheck.from.slice(0, 4)), Number(economy.from.slice(0, 4)));
  const last = Math.min(
    Number(paycheck.through.slice(0, 4)) - (paycheck.through.endsWith('-12') ? 0 : 1),
    Number(economy.through.slice(0, 4)) - (economy.through.endsWith('-12') ? 0 : 1),
  );
  if (last <= first) throw new Error('No complete shared December-to-December window');
  const years = Array.from({ length: last - first }, (_, i) => first + i + 1);
  const pick = (
    series: PaycheckData['series'] | EconomyData['series'],
    code: string,
    metric: string,
    id: string,
  ) => {
    const matches = series.filter((s) => s.state === code && s.metric === metric);
    if (matches.length > 1) throw new Error(`Ambiguous ${metric} series for ${code}`);
    if (!matches.length) return null;
    const s = matches[0];
    if (s.id !== id) throw new Error(`Unexpected ${metric} series for ${code}`);
    if (new Set(s.points.map((p) => p.month)).size !== s.points.length)
      throw new Error(`Duplicate month in ${s.id}`);
    return {
      id: s.id,
      sourceUrl: s.sourceUrl,
      points: s.points
        .filter(
          (p) =>
            p.month.endsWith('-12') &&
            Number(p.month.slice(0, 4)) >= first &&
            Number(p.month.slice(0, 4)) <= last,
        )
        .toSorted((a, b) => a.month.localeCompare(b.month)),
    };
  };
  return patternsDataSchema.parse({
    formatVersion: 1,
    pipelineVersion: 'state-patterns-v1',
    method: 'december-year-over-year-state-pairs',
    upstream,
    years,
    states: paycheck.states
      .toSorted((a, b) => a.code.localeCompare(b.code))
      .map((s) => ({
        ...s,
        earnings: pick(paycheck.series, s.code, 'earnings', `SMU${s.fips}000000500000003`),
        jobs: pick(paycheck.series, s.code, 'employment', `SMU${s.fips}000000500000001`),
        unemployment: pick(economy.series, s.code, 'unemployment', `LASST${s.fips}0000000000003`),
      })),
  });
}
export async function runPatterns(root: string, output = join(root, 'patterns')) {
  async function input(kind: 'paycheck' | 'economy') {
    const manifest = JSON.parse(await readFile(join(root, kind, 'manifest.json'), 'utf8'));
    const prefix = kind === 'paycheck' ? 'pc' : 'ec';
    if (!new RegExp(`^${prefix}-[a-f0-9]{24}$`).test(manifest.release))
      throw new Error('Invalid source release');
    const data = JSON.parse(
      await readFile(join(root, kind, 'releases', manifest.release, 'data.json'), 'utf8'),
    );
    if (
      hash(data) !== manifest.dataHash ||
      manifest.release !== `${prefix}-${hash(data).slice(0, 24)}`
    )
      throw new Error('Source hash mismatch');
    return {
      data,
      metadata: {
        release: manifest.release,
        dataHash: manifest.dataHash,
        observedAt: data.observedAt,
      },
    };
  }
  const [a, b] = await Promise.all([input('paycheck'), input('economy')]);
  const data = buildPatterns(paycheckDataSchema.parse(a.data), economyDataSchema.parse(b.data), {
    paycheck: a.metadata,
    economy: b.metadata,
  });
  let expected: string | null = null;
  try {
    const old = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
    if (!/^pt-[a-f0-9]{24}$/.test(old.release)) throw new Error('Invalid prior release');
    expected = old.release;
    const raw = JSON.parse(
      await readFile(join(output, 'releases', expected!, 'data.json'), 'utf8'),
    );
    if (hash(raw) !== old.dataHash || expected !== `pt-${hash(raw).slice(0, 24)}`)
      throw new Error('Prior hash mismatch');
    const previous = patternsDataSchema.parse(raw);
    for (const k of ['paycheck', 'economy'] as const)
      if (
        data.upstream[k].observedAt < previous.upstream[k].observedAt ||
        (data.upstream[k].observedAt === previous.upstream[k].observedAt &&
          data.upstream[k].dataHash !== previous.upstream[k].dataHash)
      )
        throw new Error('Source moved backward or changed at the same capture');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || expected) throw e;
  }
  const manifest = await publishSnapshot(data, output, 'pt', expected);
  return {
    release: manifest.release,
    states: data.states.length,
    years: data.years,
    bytes: Buffer.byteLength(JSON.stringify(data)),
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(
    JSON.stringify(
      await runPatterns(
        resolve(process.argv[2] ?? 'public/data'),
        process.argv[3] ? resolve(process.argv[3]) : undefined,
      ),
      null,
      2,
    ),
  );
