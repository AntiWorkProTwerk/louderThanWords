import * as topojson from 'topojson-client';
import { civicCache, CACHE_TTL } from './civicCacheService';

export interface StateMetadata {
  fips: string;
  name: string;
  code: string;
  lat: number;
  lng: number;
  capital: string;
  repsCount: number;
}

export const US_STATES_FIPS: Record<string, StateMetadata> = {
  '01': { fips: '01', name: 'Alabama', code: 'AL', lat: 32.806671, lng: -86.791130, capital: 'Montgomery', repsCount: 7 },
  '02': { fips: '02', name: 'Alaska', code: 'AK', lat: 61.370716, lng: -152.404419, capital: 'Juneau', repsCount: 1 },
  '04': { fips: '04', name: 'Arizona', code: 'AZ', lat: 33.729759, lng: -111.431221, capital: 'Phoenix', repsCount: 9 },
  '05': { fips: '05', name: 'Arkansas', code: 'AR', lat: 34.969704, lng: -92.373123, capital: 'Little Rock', repsCount: 4 },
  '06': { fips: '06', name: 'California', code: 'CA', lat: 36.116203, lng: -119.681564, capital: 'Sacramento', repsCount: 52 },
  '08': { fips: '08', name: 'Colorado', code: 'CO', lat: 39.059811, lng: -105.311104, capital: 'Denver', repsCount: 8 },
  '09': { fips: '09', name: 'Connecticut', code: 'CT', lat: 41.597782, lng: -72.755371, capital: 'Hartford', repsCount: 5 },
  '10': { fips: '10', name: 'Delaware', code: 'DE', lat: 39.318523, lng: -75.507141, capital: 'Dover', repsCount: 1 },
  '11': { fips: '11', name: 'District of Columbia', code: 'DC', lat: 38.897438, lng: -77.026817, capital: 'Washington', repsCount: 1 },
  '12': { fips: '12', name: 'Florida', code: 'FL', lat: 27.766279, lng: -81.686783, capital: 'Tallahassee', repsCount: 28 },
  '13': { fips: '13', name: 'Georgia', code: 'GA', lat: 33.040619, lng: -83.643074, capital: 'Atlanta', repsCount: 14 },
  '15': { fips: '15', name: 'Hawaii', code: 'HI', lat: 21.094318, lng: -157.498337, capital: 'Honolulu', repsCount: 2 },
  '16': { fips: '16', name: 'Idaho', code: 'ID', lat: 44.240459, lng: -114.478828, capital: 'Boise', repsCount: 2 },
  '17': { fips: '17', name: 'Illinois', code: 'IL', lat: 40.349457, lng: -88.986137, capital: 'Springfield', repsCount: 17 },
  '18': { fips: '18', name: 'Indiana', code: 'IN', lat: 39.849426, lng: -86.258278, capital: 'Indianapolis', repsCount: 9 },
  '19': { fips: '19', name: 'Iowa', code: 'IA', lat: 42.011539, lng: -93.210526, capital: 'Des Moines', repsCount: 4 },
  '20': { fips: '20', name: 'Kansas', code: 'KS', lat: 38.526600, lng: -96.726486, capital: 'Topeka', repsCount: 4 },
  '21': { fips: '21', name: 'Kentucky', code: 'KY', lat: 37.668140, lng: -84.670067, capital: 'Frankfort', repsCount: 6 },
  '22': { fips: '22', name: 'Louisiana', code: 'LA', lat: 31.169546, lng: -91.867805, capital: 'Baton Rouge', repsCount: 6 },
  '23': { fips: '23', name: 'Maine', code: 'ME', lat: 44.693947, lng: -69.381927, capital: 'Augusta', repsCount: 2 },
  '24': { fips: '24', name: 'Maryland', code: 'MD', lat: 39.063946, lng: -76.802101, capital: 'Annapolis', repsCount: 8 },
  '25': { fips: '25', name: 'Massachusetts', code: 'MA', lat: 42.230171, lng: -71.530106, capital: 'Boston', repsCount: 9 },
  '26': { fips: '26', name: 'Michigan', code: 'MI', lat: 43.326618, lng: -84.536095, capital: 'Lansing', repsCount: 13 },
  '27': { fips: '27', name: 'Minnesota', code: 'MN', lat: 45.694454, lng: -93.900192, capital: 'Saint Paul', repsCount: 8 },
  '28': { fips: '28', name: 'Mississippi', code: 'MS', lat: 32.741646, lng: -89.678696, capital: 'Jackson', repsCount: 4 },
  '29': { fips: '29', name: 'Missouri', code: 'MO', lat: 38.456085, lng: -92.288368, capital: 'Jefferson City', repsCount: 8 },
  '30': { fips: '30', name: 'Montana', code: 'MT', lat: 46.921925, lng: -110.454353, capital: 'Helena', repsCount: 2 },
  '31': { fips: '31', name: 'Nebraska', code: 'NE', lat: 41.125370, lng: -98.268082, capital: 'Lincoln', repsCount: 3 },
  '32': { fips: '32', name: 'Nevada', code: 'NV', lat: 38.313515, lng: -117.055374, capital: 'Carson City', repsCount: 4 },
  '33': { fips: '33', name: 'New Hampshire', code: 'NH', lat: 43.452492, lng: -71.563896, capital: 'Concord', repsCount: 2 },
  '34': { fips: '34', name: 'New Jersey', code: 'NJ', lat: 40.298904, lng: -74.521011, capital: 'Trenton', repsCount: 12 },
  '35': { fips: '35', name: 'New Mexico', code: 'NM', lat: 34.840515, lng: -106.248482, capital: 'Santa Fe', repsCount: 3 },
  '36': { fips: '36', name: 'New York', code: 'NY', lat: 42.165726, lng: -74.948051, capital: 'Albany', repsCount: 26 },
  '37': { fips: '37', name: 'North Carolina', code: 'NC', lat: 35.630066, lng: -79.806419, capital: 'Raleigh', repsCount: 14 },
  '38': { fips: '38', name: 'North Dakota', code: 'ND', lat: 47.528912, lng: -99.784012, capital: 'Bismarck', repsCount: 1 },
  '39': { fips: '39', name: 'Ohio', code: 'OH', lat: 40.388783, lng: -82.764915, capital: 'Columbus', repsCount: 15 },
  '40': { fips: '40', name: 'Oklahoma', code: 'OK', lat: 35.565342, lng: -96.928917, capital: 'Oklahoma City', repsCount: 5 },
  '41': { fips: '41', name: 'Oregon', code: 'OR', lat: 44.572021, lng: -122.070938, capital: 'Salem', repsCount: 6 },
  '42': { fips: '42', name: 'Pennsylvania', code: 'PA', lat: 40.590752, lng: -77.209755, capital: 'Harrisburg', repsCount: 17 },
  '44': { fips: '44', name: 'Rhode Island', code: 'RI', lat: 41.680893, lng: -71.511780, capital: 'Providence', repsCount: 2 },
  '45': { fips: '45', name: 'South Carolina', code: 'SC', lat: 33.856892, lng: -80.945007, capital: 'Columbia', repsCount: 7 },
  '46': { fips: '46', name: 'South Dakota', code: 'SD', lat: 44.299782, lng: -99.438828, capital: 'Pierre', repsCount: 1 },
  '47': { fips: '47', name: 'Tennessee', code: 'TN', lat: 35.747845, lng: -86.692345, capital: 'Nashville', repsCount: 9 },
  '48': { fips: '48', name: 'Texas', code: 'TX', lat: 31.054487, lng: -97.563461, capital: 'Austin', repsCount: 38 },
  '49': { fips: '49', name: 'Utah', code: 'UT', lat: 40.150032, lng: -111.862434, capital: 'Salt Lake City', repsCount: 4 },
  '50': { fips: '50', name: 'Vermont', code: 'VT', lat: 44.045876, lng: -72.710686, capital: 'Montpelier', repsCount: 1 },
  '51': { fips: '51', name: 'Virginia', code: 'VA', lat: 37.769337, lng: -78.169968, capital: 'Richmond', repsCount: 11 },
  '53': { fips: '53', name: 'Washington', code: 'WA', lat: 47.400902, lng: -121.490494, capital: 'Olympia', repsCount: 10 },
  '54': { fips: '54', name: 'West Virginia', code: 'WV', lat: 38.491226, lng: -80.954453, capital: 'Charleston', repsCount: 2 },
  '55': { fips: '55', name: 'Wisconsin', code: 'WI', lat: 44.268543, lng: -89.616508, capital: 'Madison', repsCount: 8 },
  '56': { fips: '56', name: 'Wyoming', code: 'WY', lat: 42.755966, lng: -107.302490, capital: 'Cheyenne', repsCount: 1 },
  '72': { fips: '72', name: 'Puerto Rico', code: 'PR', lat: 18.220833, lng: -66.590149, capital: 'San Juan', repsCount: 1 },
};

export function getStateFipsFromCode(codeOrName: string): string | null {
  if (!codeOrName) return '17'; // default Illinois
  const normalized = codeOrName.trim().toLowerCase();
  for (const [fips, meta] of Object.entries(US_STATES_FIPS)) {
    if (meta.code.toLowerCase() === normalized || meta.name.toLowerCase() === normalized || fips === normalized) {
      return fips;
    }
  }
  return '17';
}

export function getStateMeta(codeOrName: string): StateMetadata {
  const fips = getStateFipsFromCode(codeOrName) || '17';
  return US_STATES_FIPS[fips] || US_STATES_FIPS['17'];
}

let cachedStatesTopo: any = null;
let cachedCountiesTopo: any = null;

export async function fetchStatesGeoJson(): Promise<GeoJSON.FeatureCollection> {
  if (!cachedStatesTopo) {
    cachedStatesTopo = await civicCache.fetchCached<any>(
      'topojson:states_10m',
      async () => {
        const res = await fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json');
        return res.json();
      },
      CACHE_TTL.GEO_BOUNDARIES
    );
  }
  const geojson = topojson.feature(cachedStatesTopo, cachedStatesTopo.objects.states) as unknown as GeoJSON.FeatureCollection;
  
  // Attach state names & metadata
  geojson.features.forEach((feat: any) => {
    const fips = String(feat.id).padStart(2, '0');
    const meta = US_STATES_FIPS[fips];
    feat.properties = {
      ...(feat.properties || {}),
      fips,
      name: meta ? meta.name : `State ${fips}`,
      code: meta ? meta.code : 'US',
      repsCount: meta ? meta.repsCount : 1,
    };
  });

  return geojson;
}

export async function fetchCountiesGeoJson(stateFips?: string): Promise<GeoJSON.FeatureCollection> {
  if (!cachedCountiesTopo) {
    cachedCountiesTopo = await civicCache.fetchCached<any>(
      'topojson:counties_10m',
      async () => {
        const res = await fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json');
        return res.json();
      },
      CACHE_TTL.GEO_BOUNDARIES
    );
  }
  const geojson = topojson.feature(cachedCountiesTopo, cachedCountiesTopo.objects.counties) as unknown as GeoJSON.FeatureCollection;

  // Filter by state FIPS if provided
  if (stateFips) {
    const paddedStateFips = stateFips.padStart(2, '0');
    const filteredFeatures = geojson.features
      .filter((feat: any) => {
        const countyFips = String(feat.id).padStart(5, '0');
        return countyFips.startsWith(paddedStateFips);
      })
      .map((feat: any) => {
        const countyFips = String(feat.id).padStart(5, '0');
        const rawName = feat.properties?.name || `County ${countyFips}`;
        return {
          ...feat,
          properties: {
            ...feat.properties,
            fips: countyFips,
            name: rawName.endsWith(' County') || rawName.endsWith(' Parish') || rawName.endsWith(' Borough') || rawName.endsWith(' Census Area')
              ? rawName
              : `${rawName} County`,
            rawName,
          },
        };
      });

    return {
      type: 'FeatureCollection',
      features: filteredFeatures,
    };
  }

  return geojson;
}

const FAMOUS_COUNTY_CITIES: Record<string, string[]> = {
  // Cook County, IL (17031) - Geographically ordered North-to-South, West-to-East
  '17031': [
    // Row 0 (Northwest -> North -> Northeast)
    'Village of Schaumburg',
    'Village of Arlington Heights',
    'City of Evanston',
    // Row 1 (Upper Mid / North Shore / North Chicago)
    'Village of Skokie',
    'North Chicago / Lincoln Park',
    'City of Chicago (Loop & Central)',
    // Row 2 (Central West / Inner Suburbs / West Side)
    'Village of Oak Park',
    'City of Berwyn',
    'West Chicago / Garfield Park',
    // Row 3 (Southwest -> South -> Southeast)
    'Village of Orland Park',
    'South Chicago / Hyde Park',
    'City of Cicero',
  ],
  // Champaign County, IL (17019)
  '17019': [
    // Row 0 (North)
    'Village of Fisher',
    'Village of Rantoul',
    'Village of Ogden',
    // Row 1 (Central-North)
    'Village of Mahomet',
    'City of Champaign',
    'City of Urbana',
    // Row 2 (Central-South)
    'Village of Savoy',
    'Village of Tolono',
    'Village of St. Joseph',
    // Row 3 (South)
    'Village of Philo',
    'Village of Sidney',
    'Village of Homer',
  ],
  // Travis County, TX (48453)
  '48453': [
    // Row 0 (North)
    'Village of Point Venture',
    'City of Pflugerville',
    'North Austin',
    // Row 1 (Central-North)
    'City of Lakeway',
    'City of Austin (Downtown)',
    'East Austin',
    // Row 2 (Central-South)
    'City of West Lake Hills',
    'City of Rollingwood',
    'City of Manor',
    // Row 3 (South)
    'City of Bee Cave',
    'South Austin',
    'City of Sunset Valley',
  ],
  // Los Angeles County, CA (06037)
  '06037': [
    // Row 0 (North)
    'Santa Clarita',
    'San Fernando Valley / Burbank',
    'San Gabriel Valley / El Monte',
    // Row 1 (Central-North)
    'City of Glendale',
    'City of Pasadena',
    'Pomona / East Valley',
    // Row 2 (Central-South)
    'City of Santa Monica',
    'Hollywood / West Hollywood',
    'City of Los Angeles (Downtown / Metro)',
    // Row 3 (South)
    'South Bay / Torrance',
    'Inglewood / Compton',
    'City of Long Beach',
  ],
  // New York County (Manhattan), NY (36061)
  '36061': [
    // Row 0 (Uptown North)
    'Washington Heights & Inwood',
    'Harlem & Morningside Heights',
    // Row 1 (Upper Manhattan)
    'Upper West Side',
    'Upper East Side',
    // Row 2 (Midtown)
    'Chelsea & Flatiron',
    'Midtown Manhattan',
    // Row 3 (Downtown)
    'Greenwich Village & SoHo',
    'Lower Manhattan / Financial District',
  ],
  // King County, WA (53033)
  '53033': [
    // Row 0 (North)
    'North Seattle / Ballard',
    'City of Kirkland',
    'City of Redmond',
    // Row 1 (Central-North)
    'City of Seattle (Downtown / Capitol Hill)',
    'City of Bellevue',
    'City of Issaquah',
    // Row 2 (Central-South)
    'West Seattle',
    'City of Renton',
    'City of Kent',
    // Row 3 (South)
    'City of Federal Way',
    'City of Auburn',
    'Maple Valley',
  ],
  // Maricopa County, AZ (04013)
  '04013': [
    // Row 0 (North)
    'City of Surprise',
    'City of Peoria',
    'North Phoenix / Desert Ridge',
    // Row 1 (Central-North)
    'City of Glendale',
    'City of Phoenix (Central)',
    'City of Scottsdale',
    // Row 2 (Central-South)
    'City of Goodyear',
    'City of Tempe',
    'City of Mesa',
    // Row 3 (South)
    'South Phoenix / Laveen',
    'City of Chandler',
    'City of Gilbert',
  ],
};

const cachedCitiesByCounty: Record<string, GeoJSON.FeatureCollection> = {};

export async function fetchCountyCitiesGeoJson(
  countyFeature: GeoJSON.Feature,
  stateFips?: string
): Promise<GeoJSON.FeatureCollection> {
  const countyId = String(countyFeature.id || 'unknown').padStart(5, '0');
  if (cachedCitiesByCounty[countyId]) {
    return cachedCitiesByCounty[countyId];
  }

  // Generate clean, instant municipal sectors for this county
  const collection = generateCountyMunicipalities(countyFeature, countyId);
  cachedCitiesByCounty[countyId] = collection;
  return collection;
}

function generateCountyMunicipalities(countyFeature: any, countyId: string): GeoJSON.FeatureCollection {
  const countyName = (countyFeature.properties?.name || 'County Area').replace(/ County$/i, '');
  
  // Calculate bounding box
  let minLng = -180, minLat = -90, maxLng = 180, maxLat = 90;
  try {
    const coords = countyFeature.geometry?.coordinates;
    if (coords) {
      let allPoints: [number, number][] = [];
      if (countyFeature.geometry.type === 'Polygon') {
        allPoints = coords[0] || [];
      } else if (countyFeature.geometry.type === 'MultiPolygon') {
        coords.forEach((poly: any) => {
          if (poly && poly[0]) allPoints.push(...poly[0]);
        });
      }

      if (allPoints.length > 0) {
        minLng = Math.min(...allPoints.map((p) => p[0]));
        maxLng = Math.max(...allPoints.map((p) => p[0]));
        minLat = Math.min(...allPoints.map((p) => p[1]));
        maxLat = Math.max(...allPoints.map((p) => p[1]));
      }
    }
  } catch (err) {
    console.warn('Bounds calculation notice:', err);
  }

  const dLng = maxLng - minLng;
  const dLat = maxLat - minLat;

  // Custom city names if known, otherwise geographic municipal sectors
  const predefinedNames = FAMOUS_COUNTY_CITIES[countyId];
  const count = predefinedNames ? predefinedNames.length : 12;
  const rows = count >= 12 ? 4 : count >= 9 ? 3 : count >= 8 ? 4 : 3;
  const cols = Math.ceil(count / rows);

  const dX = dLng / cols;
  const dY = dLat / rows;

  const defaultDirectionNames = [
    `North ${countyName}`,
    `Northeast ${countyName}`,
    `Northwest ${countyName}`,
    `Central ${countyName} (Metro)`,
    `East ${countyName}`,
    `West ${countyName}`,
    `South ${countyName}`,
    `Southeast ${countyName}`,
    `Southwest ${countyName}`,
    `Upper Valley District`,
    `Lower Valley District`,
    `Highland Sector`,
  ];

  const features: GeoJSON.Feature[] = [];
  let nameIdx = 0;

  for (let r = rows - 1; r >= 0; r--) {
    for (let c = 0; c < cols; c++) {
      if (nameIdx >= count) break;

      const x0 = minLng + c * dX;
      const x1 = minLng + (c + 1) * dX;
      const y0 = minLat + r * dY;
      const y1 = minLat + (r + 1) * dY;

      // CLOCKWISE winding order: [x0, y0] -> [x0, y1] -> [x1, y1] -> [x1, y0] -> [x0, y0]
      // In d3-geo spherical projections, clockwise rings define the interior polygon
      const poly = [
        [x0, y0],
        [x0, y1],
        [x1, y1],
        [x1, y0],
        [x0, y0],
      ];

      const name = predefinedNames
        ? predefinedNames[nameIdx]
        : defaultDirectionNames[nameIdx] || `District ${nameIdx + 1}`;

      features.push({
        type: 'Feature',
        id: `${countyId}-city-${nameIdx}`,
        properties: {
          name,
          fips: `${countyId}-${nameIdx}`,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [poly],
        },
      });

      nameIdx++;
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}




