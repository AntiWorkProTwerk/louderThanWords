import { JurisdictionLevel, LocationContext } from '../types/civic';

// US Census Bureau TIGERweb REST API Layer IDs
const TIGER_LAYERS = {
  STATE: 82, // States and Equivalent
  COUNTY: 84, // Counties
  CONGRESSIONAL_DISTRICT: 54, // 119th Congressional Districts
  INCORPORATED_PLACE: 28, // Incorporated Places (Cities/Municipalities)
};

const CENSUS_BASE_URL = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer';

export async function fetchCensusTigerBoundary(
  level: JurisdictionLevel,
  lat: number,
  lng: number
): Promise<GeoJSON.FeatureCollection | null> {
  let layerId: number;

  switch (level) {
    case 'local':
      layerId = TIGER_LAYERS.INCORPORATED_PLACE;
      break;
    case 'county':
      layerId = TIGER_LAYERS.COUNTY;
      break;
    case 'state':
      layerId = TIGER_LAYERS.STATE;
      break;
    case 'federal':
      layerId = TIGER_LAYERS.CONGRESSIONAL_DISTRICT;
      break;
  }

  try {
    const queryUrl = `${CENSUS_BASE_URL}/${layerId}/query?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=NAME,STATE,COUNTY,BASENAME,CDSESSN&outSR=4326&f=geojson`;

    const res = await fetch(queryUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (res.ok) {
      const geojson: GeoJSON.FeatureCollection = await res.json();
      if (geojson && geojson.features && geojson.features.length > 0) {
        return geojson;
      }
    }
  } catch (err) {
    console.warn(`Census TIGERweb API lookup notice for ${level}:`, err);
  }

  return null;
}
