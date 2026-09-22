import { geoAlbersUsa, geoPath } from 'd3-geo';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import type { State } from '$lib/data/schema';

export type StateGeography = FeatureCollection<Polygon | MultiPolygon, { code: string }>;
export type MapSite = { id: string; label: string; lng: number; lat: number };
export const vectorSize = { width: 1000, height: 650 };

export function parseStateGeography(value: unknown, states: State[]): StateGeography {
  const data = value as StateGeography;
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features))
    throw new Error('State boundaries are unavailable');
  // The source also includes territories outside the 50-state/DC manifest and this projection.
  const features = data.features.filter((feature) =>
    states.some((s) => s.code === feature.properties?.code),
  );
  const codes = new Set<string>();
  for (const feature of features) {
    const code = feature.properties?.code;
    if (
      feature.type !== 'Feature' ||
      !states.some((s) => s.code === code) ||
      codes.has(code) ||
      !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)
    )
      throw new Error('Invalid or duplicate state boundary');
    const polygons =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    if (
      !polygons.length ||
      polygons.some(
        (polygon) =>
          !polygon.length ||
          polygon.some(
            (ring) =>
              ring.length < 3 ||
              ring.some(
                (p) =>
                  p.length < 2 ||
                  !Number.isFinite(p[0]) ||
                  !Number.isFinite(p[1]) ||
                  Math.abs(p[0]) > 180 ||
                  Math.abs(p[1]) > 90,
              ),
          ),
      )
    )
      throw new Error('Invalid boundary coordinates');
    codes.add(code);
  }
  if (states.some((state) => !codes.has(state.code)))
    throw new Error('Incomplete state boundaries');
  return { ...data, features };
}

export function projectStates(data: StateGeography, states: State[]) {
  const projection = geoAlbersUsa().fitExtent(
    [
      [22, 22],
      [978, 605],
    ],
    data,
  );
  const path = geoPath(projection);
  const regions = data.features
    .map((feature) => {
      const state = states.find((s) => s.code === feature.properties.code)!;
      const center = projection(state.center) ?? path.centroid(feature);
      return {
        code: state.code,
        name: state.name,
        path: path(feature) ?? '',
        center,
        bounds: path.bounds(feature),
        area: path.area(feature),
      };
    })
    .toSorted((a, b) => a.name.localeCompare(b.name));
  return { projection, regions };
}

export function vectorCamera(bounds?: [[number, number], [number, number]]) {
  if (!bounds || !bounds.flat().every(Number.isFinite)) return { x: 0, y: 0, scale: 1 };
  const width = bounds[1][0] - bounds[0][0],
    height = bounds[1][1] - bounds[0][1];
  const scale = Math.min(24, 800 / Math.max(width, 1), 490 / Math.max(height, 1));
  return {
    scale,
    x: 500 - ((bounds[0][0] + bounds[1][0]) / 2) * scale,
    y: 310 - ((bounds[0][1] + bounds[1][1]) / 2) * scale,
  };
}

export function nextVectorState(codes: string[], current: string, key: string) {
  if (!codes.length) return null;
  if (key === 'Home') return codes[0];
  if (key === 'End') return codes.at(-1)!;
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return null;
  const index = Math.max(0, codes.indexOf(current));
  const direction = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
  return codes[Math.max(0, Math.min(codes.length - 1, index + direction))];
}

// Insets are displaced. Never draw a geographic connection across inset boundaries.
export function siteInset(site: MapSite) {
  return site.lat > 50 ? 'AK' : site.lng < -140 ? 'HI' : 'contiguous';
}

export function vectorSiteLinks<T extends MapSite>(
  original: MapSite[],
  plotted: T[],
  enabled: boolean,
) {
  const anchor = plotted.find((site) => site.id === original[0]?.id) ?? null;
  const targets =
    enabled && anchor
      ? plotted.filter(
          (site) =>
            site.id !== anchor.id &&
            siteInset(site) === siteInset(anchor) &&
            (site.lng !== anchor.lng || site.lat !== anchor.lat),
        )
      : [];
  // If the original anchor cannot be projected, do not invent a different relationship hub.
  return { anchor, targets };
}
