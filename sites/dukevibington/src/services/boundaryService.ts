import { JurisdictionLevel, LocationContext } from '../types/civic';

// Generate authentic rectilinear, orthogonal (90-degree angle) blocky boundaries
// mimicking US square state lines, county grids, and township/range municipal survey blocks
function generateBlockyPolygon(
  centerLat: number,
  centerLng: number,
  halfWidthKm: number,
  halfHeightKm: number,
  complexity: 'rect' | 'stepped' | 'corridor',
  seed: number = 1
): [number, number][] {
  const kmPerDegreeLat = 111.0;
  const kmPerDegreeLng = 111.0 * Math.cos((centerLat * Math.PI) / 180);

  const dLat = halfHeightKm / kmPerDegreeLat;
  const dLng = halfWidthKm / kmPerDegreeLng;

  const minLat = centerLat - dLat;
  const maxLat = centerLat + dLat;
  const minLng = centerLng - dLng;
  const maxLng = centerLng + dLng;

  const coords: [number, number][] = [];

  if (complexity === 'rect') {
    // Pure square / rectangular state & county boundary line
    coords.push([minLng, maxLat]); // Top-Left
    coords.push([maxLng, maxLat]); // Top-Right
    coords.push([maxLng, minLat]); // Bottom-Right
    coords.push([minLng, minLat]); // Bottom-Left
    coords.push([minLng, maxLat]); // Close polygon
  } else if (complexity === 'stepped') {
    // Stepped blocky orthogonal grid (classic county/township survey grid)
    const midLng1 = minLng + dLng * 0.65;
    const midLng2 = minLng + dLng * 1.35;
    const midLat1 = minLat + dLat * 0.4;
    const midLat2 = minLat + dLat * 1.4;

    coords.push([minLng, maxLat]);
    coords.push([midLng1, maxLat]);
    coords.push([midLng1, maxLat + dLat * 0.15]); // Step up
    coords.push([midLng2, maxLat + dLat * 0.15]);
    coords.push([midLng2, maxLat]);
    coords.push([maxLng, maxLat]);
    coords.push([maxLng, midLat2]);
    coords.push([maxLng + dLng * 0.2, midLat2]); // Step right
    coords.push([maxLng + dLng * 0.2, midLat1]);
    coords.push([maxLng, midLat1]);
    coords.push([maxLng, minLat]);
    coords.push([midLng2, minLat]);
    coords.push([midLng2, minLat - dLat * 0.1]); // Step down
    coords.push([midLng1, minLat - dLat * 0.1]);
    coords.push([midLng1, minLat]);
    coords.push([minLng, minLat]);
    coords.push([minLng, midLat1]);
    coords.push([minLng - dLng * 0.15, midLat1]); // Step left
    coords.push([minLng - dLng * 0.15, midLat2]);
    coords.push([minLng, midLat2]);
    coords.push([minLng, maxLat]); // Close
  } else {
    // Congressional District blocky corridor
    const stepX = (maxLng - minLng) / 4;
    const stepY = (maxLat - minLat) / 4;

    coords.push([minLng, maxLat - stepY]);
    coords.push([minLng + stepX * 2, maxLat - stepY]);
    coords.push([minLng + stepX * 2, maxLat]);
    coords.push([maxLng, maxLat]);
    coords.push([maxLng, minLat + stepY * 2]);
    coords.push([maxLng - stepX, minLat + stepY * 2]);
    coords.push([maxLng - stepX, minLat]);
    coords.push([minLng + stepX, minLat]);
    coords.push([minLng + stepX, minLat + stepY]);
    coords.push([minLng, minLat + stepY]);
    coords.push([minLng, maxLat - stepY]); // Close
  }

  return coords;
}

export function getBoundaryForLevel(
  level: JurisdictionLevel,
  location: LocationContext
): GeoJSON.FeatureCollection {
  const { lat, lng, city, county, state, congressionalDistrict } = location;

  let halfWidthKm = 5;
  let halfHeightKm = 5;
  let label = `${city} Municipal Grid Limits`;
  let levelName = 'Local Municipality';
  let complexity: 'rect' | 'stepped' | 'corridor' = 'stepped';

  switch (level) {
    case 'local':
      halfWidthKm = 5.5;
      halfHeightKm = 4.8;
      label = `${city} Municipal Ward & Infill Boundary`;
      levelName = 'City of ' + city;
      complexity = 'stepped'; // Blocky urban ward annexation boundary
      break;
    case 'county':
      halfWidthKm = 18.0;
      halfHeightKm = 16.0;
      label = `${county} Boundary (Survey Grid & Townships)`;
      levelName = county;
      complexity = 'rect'; // Classic square American county lines
      break;
    case 'state':
      halfWidthKm = 110.0;
      halfHeightKm = 95.0;
      label = `${state} State Line & Territorial Bounds`;
      levelName = state;
      complexity = 'rect'; // Iconic square state line border
      break;
    case 'federal':
      halfWidthKm = 36.0;
      halfHeightKm = 32.0;
      label = `${state} Congressional District ${congressionalDistrict} (Blocky District)`;
      levelName = `U.S. House Dist. ${congressionalDistrict}`;
      complexity = 'corridor'; // Blocky contiguous congressional district
      break;
  }

  const coordinates = generateBlockyPolygon(lat, lng, halfWidthKm, halfHeightKm, complexity);

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
          halfWidthKm,
          halfHeightKm,
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
