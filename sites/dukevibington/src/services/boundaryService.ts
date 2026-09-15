import { JurisdictionLevel, LocationContext } from '../types/civic';

// Generate realistic synthetic polygon vertices around a center point with jitter for natural boundary feel
function generatePolygon(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  pointsCount: number = 24,
  irregularity: number = 0.25,
  seed: number = 1
): [number, number][] {
  const coords: [number, number][] = [];
  const kmPerDegreeLat = 111.0;
  const kmPerDegreeLng = 111.0 * Math.cos((centerLat * Math.PI) / 180);

  for (let i = 0; i <= pointsCount; i++) {
    const angle = (i % pointsCount) * ((2 * Math.PI) / pointsCount);
    // Deterministic pseudo-random variation
    const noise = Math.sin(angle * 3 + seed) * irregularity + Math.cos(angle * 5 + seed * 2) * (irregularity / 2);
    const r = radiusKm * (1 + noise);

    const latOffset = (r * Math.cos(angle)) / kmPerDegreeLat;
    const lngOffset = (r * Math.sin(angle)) / kmPerDegreeLng;

    coords.push([centerLng + lngOffset, centerLat + latOffset]);
  }

  return coords;
}

export function getBoundaryForLevel(
  level: JurisdictionLevel,
  location: LocationContext
): GeoJSON.FeatureCollection {
  const { lat, lng, city, county, state, congressionalDistrict } = location;

  let radiusKm = 5;
  let label = `${city} Municipal Limits`;
  let levelName = 'Local Municipality';
  let seed = 12;

  switch (level) {
    case 'local':
      radiusKm = 6.5;
      label = `${city} Municipal Boundary (Ward / Council District)`;
      levelName = 'City of ' + city;
      seed = 42;
      break;
    case 'county':
      radiusKm = 24.0;
      label = `${county} Boundary (Commission Districts)`;
      levelName = county;
      seed = 84;
      break;
    case 'state':
      radiusKm = 140.0;
      label = `${state} State Legislative Boundary`;
      levelName = state;
      seed = 128;
      break;
    case 'federal':
      radiusKm = 48.0;
      label = `${state} Congressional District ${congressionalDistrict}`;
      levelName = `U.S. House Dist. ${congressionalDistrict}`;
      seed = 210;
      break;
  }

  const coordinates = generatePolygon(lat, lng, radiusKm, 32, 0.22, seed);

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          level,
          name: levelName,
          label,
          center: [lng, lat],
          radiusKm,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates],
        },
      },
    ],
  };
}

export function getRecommendedZoom(level: JurisdictionLevel): number {
  switch (level) {
    case 'local':
      return 13;
    case 'county':
      return 10;
    case 'federal':
      return 9;
    case 'state':
      return 7;
    default:
      return 12;
  }
}
