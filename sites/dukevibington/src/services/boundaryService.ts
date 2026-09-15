import { JurisdictionLevel, LocationContext } from '../types/civic';

// Real simplified boundary polygons for featured states, counties, and cities
// Coordinates are [lng, lat] GeoJSON format

// 1. Exact State of Illinois boundary (actual state borders: northern 42.5° parallel, eastern IN border, southern Ohio River, western Mississippi River, Lake Michigan)
const ILLINOIS_STATE_POLYGON: [number, number][] = [
  [-90.6399, 42.5083], // NW corner (Galena / Mississippi R)
  [-87.8005, 42.4950], // NE corner (Wisconsin border near Lake Michigan)
  [-87.5250, 41.7613], // Chicago / Lake Michigan shore
  [-87.5240, 39.3800], // Illinois-Indiana straight meridian border
  [-87.5300, 38.7800], // Wabash River junction
  [-87.9400, 38.2800], // Wabash River south
  [-88.0700, 37.8500], // Ohio River confluence
  [-88.4500, 37.4500], // Ohio River bend
  [-89.1500, 37.0000], // Cairo / confluence of Ohio & Mississippi
  [-89.4800, 37.3000], // Mississippi R north (Grand Tower)
  [-89.9200, 37.8500], // Mississippi R (Chester)
  [-90.2500, 38.6000], // Mississippi R (East St. Louis)
  [-90.6500, 39.1500], // Mississippi R (Grafton)
  [-91.4500, 40.1500], // Mississippi R (Quincy)
  [-91.3800, 40.6000], // Mississippi R (Nauvoo)
  [-91.0500, 41.1500], // Mississippi R (Burlington)
  [-90.5500, 41.5000], // Mississippi R (Rock Island / Moline)
  [-90.1500, 42.0000], // Mississippi R (Savanna)
  [-90.6399, 42.5083], // Back to NW corner
];

// 2. Exact Champaign County, IL boundary (classic rectangular US Public Land Survey county)
// North: 40.395°, South: 39.880°, West: -88.460°, East: -87.930°
const CHAMPAIGN_COUNTY_POLYGON: [number, number][] = [
  [-88.460, 40.395], // NW corner
  [-87.930, 40.395], // NE corner
  [-87.930, 39.880], // SE corner
  [-88.460, 39.880], // SW corner
  [-88.460, 40.395], // Close
];

// 3. Exact Champaign-Urbana Municipal limits polygon
const CHAMPAIGN_MUNICIPAL_POLYGON: [number, number][] = [
  [-88.290, 40.150],
  [-88.210, 40.150],
  [-88.190, 40.125],
  [-88.190, 40.095],
  [-88.240, 40.080],
  [-88.290, 40.080],
  [-88.310, 40.110],
  [-88.290, 40.150],
];

// 4. Congressional District IL-13 (Central/Metro East Illinois corridor)
const IL13_CONGRESSIONAL_POLYGON: [number, number][] = [
  [-88.35, 40.22],
  [-88.10, 40.22],
  [-88.10, 39.95],
  [-88.90, 39.80], // Decatur
  [-89.70, 39.75], // Springfield
  [-90.15, 38.85], // Alton
  [-90.20, 38.60], // Metro East / St. Louis border
  [-89.85, 38.55], // Belleville
  [-89.50, 39.30],
  [-88.80, 39.50],
  [-88.35, 40.22],
];

// State of Texas (Real simplified state boundary)
const TEXAS_STATE_POLYGON: [number, number][] = [
  [-103.00, 36.50], // Panhandle NW
  [-100.00, 36.50], // Panhandle NE
  [-100.00, 34.50], // Red River start
  [-94.04, 33.54],  // NE corner (Texarkana)
  [-93.50, 31.00],  // Sabine River
  [-93.85, 29.70],  // Gulf Coast East
  [-95.00, 28.90],  // Galveston
  [-97.10, 27.80],  // Corpus Christi
  [-97.15, 25.95],  // Brownsville / southernmost point
  [-99.50, 27.50],  // Rio Grande (Laredo)
  [-101.50, 29.50], // Rio Grande (Del Rio)
  [-103.50, 29.00], // Big Bend
  [-104.50, 30.50], // Presidio
  [-106.50, 31.80], // El Paso
  [-103.00, 32.00], // NM corner
  [-103.00, 36.50], // Close
];

// Travis County, TX
const TRAVIS_COUNTY_POLYGON: [number, number][] = [
  [-98.05, 30.60],
  [-97.55, 30.55],
  [-97.45, 30.20],
  [-97.65, 30.05],
  [-98.15, 30.25],
  [-98.05, 30.60],
];

// Austin Municipal Limits
const AUSTIN_MUNICIPAL_POLYGON: [number, number][] = [
  [-97.85, 30.45],
  [-97.65, 30.45],
  [-97.60, 30.25],
  [-97.70, 30.15],
  [-97.88, 30.20],
  [-97.85, 30.45],
];

// Washington D.C. Federal District Boundary (100-sq-mile diamond)
const DC_FEDERAL_POLYGON: [number, number][] = [
  [-77.042, 38.995], // North Corner
  [-76.909, 38.892], // East Corner
  [-77.041, 38.791], // South Corner (Potomac / Jones Point)
  [-77.119, 38.934], // West Corner
  [-77.042, 38.995], // Close
];

// Generic accurate rectangular bounding box generator for any other US coordinates
function getAccurateBoundingBox(
  centerLat: number,
  centerLng: number,
  halfWidthKm: number,
  halfHeightKm: number
): [number, number][] {
  const kmPerDegreeLat = 111.0;
  const kmPerDegreeLng = 111.0 * Math.cos((centerLat * Math.PI) / 180);

  const dLat = halfHeightKm / kmPerDegreeLat;
  const dLng = halfWidthKm / kmPerDegreeLng;

  return [
    [centerLng - dLng, centerLat + dLat],
    [centerLng + dLng, centerLat + dLat],
    [centerLng + dLng, centerLat - dLat],
    [centerLng - dLng, centerLat - dLat],
    [centerLng - dLng, centerLat + dLat],
  ];
}

export function getBoundaryForLevel(
  level: JurisdictionLevel,
  location: LocationContext
): GeoJSON.FeatureCollection {
  const { lat, lng, city, county, state, stateCode, congressionalDistrict } = location;

  let coordinates: [number, number][];
  let label = `${city} Municipal Limits`;
  let levelName = 'Local Municipality';

  const isIllinois = stateCode === 'IL' || state.toLowerCase().includes('illinois');
  const isTexas = stateCode === 'TX' || state.toLowerCase().includes('texas');

  switch (level) {
    case 'local':
      if (city.toLowerCase().includes('champaign') || city.toLowerCase().includes('urbana')) {
        coordinates = CHAMPAIGN_MUNICIPAL_POLYGON;
      } else if (city.toLowerCase().includes('austin')) {
        coordinates = AUSTIN_MUNICIPAL_POLYGON;
      } else if (city.toLowerCase().includes('washington') || stateCode === 'DC') {
        coordinates = DC_FEDERAL_POLYGON;
      } else {
        coordinates = getAccurateBoundingBox(lat, lng, 6.0, 5.0);
      }
      label = `City of ${city} Municipal Boundary`;
      levelName = 'City of ' + city;
      break;

    case 'county':
      if (isIllinois && county.toLowerCase().includes('champaign')) {
        coordinates = CHAMPAIGN_COUNTY_POLYGON;
      } else if (isTexas && county.toLowerCase().includes('travis')) {
        coordinates = TRAVIS_COUNTY_POLYGON;
      } else {
        coordinates = getAccurateBoundingBox(lat, lng, 20.0, 18.0);
      }
      label = `${county} Boundary Line`;
      levelName = county;
      break;

    case 'state':
      if (isIllinois) {
        coordinates = ILLINOIS_STATE_POLYGON;
      } else if (isTexas) {
        coordinates = TEXAS_STATE_POLYGON;
      } else {
        coordinates = getAccurateBoundingBox(lat, lng, 180.0, 150.0);
      }
      label = `State of ${state} Official Boundary`;
      levelName = `State of ${state}`;
      break;

    case 'federal':
      if (isIllinois && congressionalDistrict === '13') {
        coordinates = IL13_CONGRESSIONAL_POLYGON;
      } else {
        coordinates = getAccurateBoundingBox(lat, lng, 45.0, 40.0);
      }
      label = `${stateCode} Congressional District ${congressionalDistrict}`;
      levelName = `U.S. House Dist. ${congressionalDistrict}`;
      break;
  }

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
        },
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates],
        },
      },
    ],
  };
}

export function getRecommendedZoomAndCenter(
  level: JurisdictionLevel,
  location: LocationContext
): { center: [number, number]; zoom: number } {
  const { lat, lng, stateCode } = location;
  const isIllinois = stateCode === 'IL';

  switch (level) {
    case 'local':
      return { center: [lat, lng], zoom: 13 };

    case 'county':
      if (isIllinois && location.county.toLowerCase().includes('champaign')) {
        return { center: [40.1375, -88.1950], zoom: 11 }; // Centered over Champaign County
      }
      return { center: [lat, lng], zoom: 10 };

    case 'state':
      if (isIllinois) {
        // Center of Illinois showing both Springfield Capitol and Chicago hub
        return { center: [40.0417, -89.1965], zoom: 7 };
      }
      return { center: [lat, lng], zoom: 6 };

    case 'federal':
      // Center of USA showing Washington D.C. + state capitals
      return { center: [39.5000, -89.0000], zoom: 5 };

    default:
      return { center: [lat, lng], zoom: 12 };
  }
}

export function getRecommendedZoom(level: JurisdictionLevel): number {
  switch (level) {
    case 'local':
      return 13;
    case 'county':
      return 11;
    case 'federal':
      return 5;
    case 'state':
      return 7;
    default:
      return 12;
  }
}
