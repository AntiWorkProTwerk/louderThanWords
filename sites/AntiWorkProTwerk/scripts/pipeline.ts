import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  manifestSchema,
  politicianSchema,
  summarySchema,
  type PoliticianSummary,
  type State,
} from '../src/lib/data/schema';
import { bills, source, stateCodes, texas } from './fixtures/demo';
import type { FeatureCollection, Geometry, Position } from 'geojson';

export const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
type Topology = {
  transform: { scale: number[]; translate: number[] };
  arcs: number[][][];
  objects: Record<
    string,
    {
      geometries: {
        id: string;
        properties: { name: string };
        type: string;
        arcs: number[][] | number[][][];
      }[];
    }
  >;
};
export function decodeTopology(topology: Topology, object: string): FeatureCollection {
  const arcs = topology.arcs.map((arc) => {
    let x = 0,
      y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [
        x * topology.transform.scale[0] + topology.transform.translate[0],
        y * topology.transform.scale[1] + topology.transform.translate[1],
      ];
    });
  });
  const ring = (indices: number[]) =>
    indices.flatMap((i, index) => {
      const points = i < 0 ? [...arcs[~i]].reverse() : arcs[i];
      return index ? points.slice(1) : points;
    });
  return {
    type: 'FeatureCollection',
    features: topology.objects[object].geometries.map((g) => ({
      type: 'Feature',
      id: g.id,
      properties: { ...g.properties, code: stateCodes[g.id] },
      geometry: {
        type: g.type,
        coordinates:
          g.type === 'Polygon'
            ? (g.arcs as number[][]).map(ring)
            : (g.arcs as number[][][]).map((p) => p.map(ring)),
      } as Geometry,
    })),
  };
}
export function normalizePeople(state: State): PoliticianSummary[] {
  if (state.code === 'TX') return texas;
  return ['Alex Morgan', 'Jordan Bennett']
    .slice(0, state.code === 'DC' ? 1 : 2)
    .map((name, index) => ({
      id: `${state.code.toLowerCase()}-demo-${index + 1}`,
      name,
      party: index === 0 ? 'D' : 'R',
      state: state.code,
      role: state.code === 'DC' ? 'Sample delegate (DC)' : `Sample U.S. Senator (${state.code})`,
      description:
        index === 0
          ? 'A fictional profile focused on healthcare, education, and working families.'
          : 'A fictional profile focused on infrastructure, energy, and small business.',
      portrait: null,
      approval: 54 + index * 7,
      alignment: 76 + index * 5,
      donations: 850000 + index * 420000,
      billCount: 18 + index * 6,
      issues:
        index === 0
          ? ['Healthcare', 'Education', 'Working families']
          : ['Infrastructure', 'Energy', 'Small business'],
      district: 'Statewide',
      fictional: true,
    }));
}
export async function prepareRelease() {
  const [stateRaw, worldRaw] = await Promise.all(
    ['states-10m.json', 'countries-50m.json'].map((name) =>
      readFile(join(siteRoot, 'scripts/sources', name), 'utf8'),
    ),
  );
  const statesGeo = decodeTopology(JSON.parse(stateRaw), 'states');
  const worldGeo = decodeTopology(JSON.parse(worldRaw), 'countries');
  const states: State[] = statesGeo.features
    .filter((f) => f.properties?.code)
    .map((f) => {
      const points = (f.geometry as { coordinates: Position[][][] }).coordinates.flat(
        Infinity,
      ) as unknown as number[];
      const xs = points.filter((_, i) => i % 2 === 0),
        ys = points.filter((_, i) => i % 2 === 1);
      let bounds: [number, number, number, number] = [
        Math.min(...xs),
        Math.min(...ys),
        Math.max(...xs),
        Math.max(...ys),
      ];
      if (f.properties!.code === 'AK') bounds = [-179, 51, -129, 72];
      if (f.properties!.code === 'HI') bounds = [-160.4, 18.8, -154.6, 22.5];
      return {
        code: f.properties!.code,
        name: f.properties!.name,
        fips: String(f.id),
        bounds,
        center: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2] as [number, number],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const allPeople = states.flatMap(normalizePeople);
  const release = `demo-${createHash('sha256').update(JSON.stringify({ allPeople, bills, source, stateRaw, worldRaw })).digest('hex').slice(0, 12)}`;
  const manifest = manifestSchema.parse({
    version: 1,
    release,
    publishedAt: source.collectedAt,
    states,
    demo: true,
  });
  const files: Record<string, string> = {};
  for (const state of states) {
    const summary = summarySchema.parse({ release, state, people: normalizePeople(state), source });
    files[`states/${state.code}/summary.json`] = JSON.stringify(summary);
  }
  for (const [index, p] of allPeople.entries()) {
    const person = politicianSchema.parse({
      ...p,
      release,
      source,
      bills,
      votes: bills.map((bill, i) => ({
        bill,
        vote: (index + i) % 3 === 0 ? 'Nay' : 'Yea',
        date: '2026-09-01',
      })),
      donors: [
        { category: 'Individual donors', amount: p.donations * 0.55 },
        { category: 'Political action committees', amount: p.donations * 0.3 },
        { category: 'Other contributions', amount: p.donations * 0.15 },
      ],
    });
    const total = person.donors.reduce((sum, d) => sum + d.amount, 0);
    if (Math.abs(total - person.donations) > 0.01)
      throw new Error(`Invalid donor total for ${p.id}`);
    files[`politicians/${p.id}.json`] = JSON.stringify(person);
  }
  files['geography/states.geojson'] = JSON.stringify(statesGeo);
  files['geography/world.geojson'] = JSON.stringify(worldGeo);
  files['sources.json'] = JSON.stringify({
    source,
    geography: [
      {
        url: 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json',
        license: 'ISC; underlying US Census geography',
      },
      {
        url: 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json',
        license: 'ISC; underlying Natural Earth geography',
      },
    ],
  });
  return { manifest, files };
}
export async function publishLocal(output = join(siteRoot, 'public/data')) {
  // Fully construct and validate before touching the published manifest.
  const { manifest, files } = await prepareRelease();
  const releases = join(output, 'releases');
  await mkdir(releases, { recursive: true });
  const target = join(releases, manifest.release);
  // Publish immutable files first, then atomically switch the manifest. Individual
  // files are renamed only after a complete write, so interrupted writes are retryable.
  for (const [name, body] of Object.entries(files)) {
    const file = join(target, name);
    await mkdir(dirname(file), { recursive: true });
    try {
      if ((await readFile(file, 'utf8')) !== body)
        throw new Error(`Immutable release differs: ${name}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const temporaryFile = `${file}.${process.pid}.tmp`;
      await writeFile(temporaryFile, body);
      await rename(temporaryFile, file);
    }
  }
  // Archive the normalized input provenance along with each immutable release.
  const temporary = join(output, `manifest-${process.pid}.tmp`);
  await writeFile(temporary, JSON.stringify(manifest));
  await rename(temporary, join(output, 'manifest.json'));
  return manifest;
}
