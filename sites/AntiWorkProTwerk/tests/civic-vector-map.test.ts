import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseStateGeography,
  projectStates,
  vectorCamera,
  nextVectorState,
  vectorSiteLinks,
  type MapSite,
} from '../src/lib/civic/vector-map';
import { manifestSchema } from '../src/lib/data/schema';

const manifest = manifestSchema.parse(
  JSON.parse(readFileSync('public/data/manifest.json', 'utf8')),
);
const source = JSON.parse(
  readFileSync(`public/data/releases/${manifest.release}/geography/states.geojson`, 'utf8'),
);

test('lightweight map projects the actual 50 states and DC, preserving source geometry and inset scope', () => {
  const before = JSON.stringify(source),
    geography = parseStateGeography(source, manifest.states);
  assert.equal(geography.features.length, 51);
  assert.equal(JSON.stringify(source), before);
  const projected = projectStates(geography, manifest.states);
  for (const region of projected.regions) {
    assert.ok(region.path.length > 0);
    assert.ok(!region.path.includes('NaN'));
    assert.ok(region.bounds.flat().every(Number.isFinite));
    assert.ok(region.center.every(Number.isFinite));
    assert.ok(region.area > 0);
  }
  for (const code of ['AK', 'HI', 'TX', 'DC']) {
    const region = projected.regions.find((s) => s.code === code)!;
    assert.ok(region.center[0] >= 0 && region.center[0] <= 1000);
    assert.ok(region.center[1] >= 0 && region.center[1] <= 650);
    const camera = vectorCamera(region.bounds);
    assert.ok(camera.scale > 1 && camera.scale <= 24);
  }
  assert.equal(projected.projection([-66, 18]), null); // Puerto Rico is outside this composite projection.
  assert.deepEqual(vectorCamera(), { x: 0, y: 0, scale: 1 });
});

test('boundary validation rejects missing, repeated and nonfinite state geometry', () => {
  const duplicate = structuredClone(source);
  duplicate.features.push(duplicate.features[0]);
  assert.throws(() => parseStateGeography(duplicate, manifest.states), /duplicate/);
  const missing = structuredClone(source);
  missing.features = missing.features.filter((f: any) => f.properties.code !== 'TX');
  assert.throws(() => parseStateGeography(missing, manifest.states), /Incomplete/);
  const invalid = structuredClone(source);
  invalid.features[0].geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [NaN, 0],
        [0, 0],
      ],
    ],
  };
  assert.throws(() => parseStateGeography(invalid, manifest.states), /coordinates/);
});

test('state keyboard browsing preserves native keys and stops at the alphabetical bounds', () => {
  const codes = ['AL', 'AK', 'AZ'];
  assert.equal(nextVectorState(codes, 'AK', 'Home'), 'AL');
  assert.equal(nextVectorState(codes, 'AK', 'End'), 'AZ');
  assert.equal(nextVectorState(codes, 'AL', 'ArrowLeft'), 'AL');
  assert.equal(nextVectorState(codes, 'AL', 'ArrowDown'), 'AK');
  assert.equal(nextVectorState(codes, 'AZ', 'ArrowRight'), 'AZ');
  assert.equal(nextVectorState(codes, 'AZ', 'Tab'), null);
  assert.equal(nextVectorState([], 'AZ', 'Home'), null);
});

test('inset connections preserve the original anchor and never join across displaced regions', () => {
  const sites: MapSite[] = [
    { id: 'a', label: 'Texas', lng: -98, lat: 32 },
    { id: 'b', label: 'California', lng: -120, lat: 38 },
    { id: 'c', label: 'Alaska', lng: -154, lat: 61 },
    { id: 'd', label: 'Hawaii', lng: -157, lat: 21 },
    { id: 'e', label: 'Same coordinates', lng: -98, lat: 32 },
  ];
  assert.deepEqual(
    vectorSiteLinks(sites, sites, true).targets.map((s) => s.id),
    ['b'],
  );
  assert.deepEqual(vectorSiteLinks(sites, sites, false).targets, []);
  assert.deepEqual(vectorSiteLinks(sites, sites.slice(1), true), { anchor: null, targets: [] });
});
