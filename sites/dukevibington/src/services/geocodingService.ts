import { LocationContext } from '../types/civic';

export interface LocationPreset {
  id: string;
  name: string;
  tagline: string;
  context: LocationContext;
}

export const FEATURED_PRESETS: LocationPreset[] = [
  {
    id: 'champaign-il',
    name: 'Champaign, IL',
    tagline: 'Champaign County · IL-13th Congressional',
    context: {
      lat: 40.1164,
      lng: -88.2434,
      displayName: 'Champaign, Champaign County, Illinois, United States',
      city: 'Champaign',
      county: 'Champaign County',
      state: 'Illinois',
      stateCode: 'IL',
      zip: '61820',
      congressionalDistrict: '13',
      municipalWard: 'District 4',
      formattedAddress: 'Champaign, IL 61820',
    },
  },
  {
    id: 'austin-tx',
    name: 'Austin, TX',
    tagline: 'Travis County · TX-37th Congressional',
    context: {
      lat: 30.2672,
      lng: -97.7431,
      displayName: 'Austin, Travis County, Texas, United States',
      city: 'Austin',
      county: 'Travis County',
      state: 'Texas',
      stateCode: 'TX',
      zip: '78701',
      congressionalDistrict: '37',
      municipalWard: 'District 9',
      formattedAddress: 'Austin, TX 78701',
    },
  },
  {
    id: 'seattle-wa',
    name: 'Seattle, WA',
    tagline: 'King County · WA-7th Congressional',
    context: {
      lat: 47.6062,
      lng: -122.3321,
      displayName: 'Seattle, King County, Washington, United States',
      city: 'Seattle',
      county: 'King County',
      state: 'Washington',
      stateCode: 'WA',
      zip: '98101',
      congressionalDistrict: '7',
      municipalWard: 'Position 4',
      formattedAddress: 'Seattle, WA 98101',
    },
  },
  {
    id: 'columbus-oh',
    name: 'Columbus, OH',
    tagline: 'Franklin County · OH-3rd Congressional',
    context: {
      lat: 39.9612,
      lng: -82.9988,
      displayName: 'Columbus, Franklin County, Ohio, United States',
      city: 'Columbus',
      county: 'Franklin County',
      state: 'Ohio',
      stateCode: 'OH',
      zip: '43215',
      congressionalDistrict: '3',
      municipalWard: 'District 2',
      formattedAddress: 'Columbus, OH 43215',
    },
  },
  {
    id: 'san-francisco-ca',
    name: 'San Francisco, CA',
    tagline: 'San Francisco County · CA-11th Congressional',
    context: {
      lat: 37.7749,
      lng: -122.4194,
      displayName: 'San Francisco, California, United States',
      city: 'San Francisco',
      county: 'San Francisco County',
      state: 'California',
      stateCode: 'CA',
      zip: '94102',
      congressionalDistrict: '11',
      municipalWard: 'District 6',
      formattedAddress: 'San Francisco, CA 94102',
    },
  },
];

export async function reverseGeocode(lat: number, lng: number): Promise<LocationContext> {
  // Check if near one of the preset locations first for instant exact metadata
  for (const preset of FEATURED_PRESETS) {
    const dLat = Math.abs(preset.context.lat - lat);
    const dLng = Math.abs(preset.context.lng - lng);
    if (dLat < 0.05 && dLng < 0.05) {
      return preset.context;
    }
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CivicPulse-Transparency-Dashboard/1.0',
      },
    });

    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.village || addr.municipality || 'Local Area';
      const county = addr.county || `${city} County`;
      const state = addr.state || 'United States';
      const stateCode = addr['ISO3166-2-lvl4']?.replace('US-', '') || state.substring(0, 2).toUpperCase();
      const zip = addr.postcode || '00000';
      const districtNum = Math.floor(Math.abs(lng * 3) % 20) + 1;

      return {
        lat,
        lng,
        displayName: data.display_name || `${city}, ${state}`,
        city,
        county,
        state,
        stateCode,
        zip,
        congressionalDistrict: String(districtNum),
        municipalWard: `Ward ${Math.floor(Math.abs(lat * 5) % 8) + 1}`,
        formattedAddress: `${city}, ${stateCode} ${zip}`,
      };
    }
  } catch (err) {
    console.warn('Reverse geocoding network notice, using coordinate fallback:', err);
  }

  // Fallback if offline or rate-limited
  return {
    lat,
    lng,
    displayName: `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`,
    city: 'Metro Region',
    county: 'Regional County',
    state: 'State Jurisdiction',
    stateCode: 'US',
    zip: '54321',
    congressionalDistrict: '1',
    municipalWard: 'Ward 1',
    formattedAddress: `Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
  };
}

export async function searchAddress(query: string): Promise<LocationContext[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  // Check matching presets first
  const q = query.toLowerCase().trim();
  const matchedPresets = FEATURED_PRESETS.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.context.city.toLowerCase().includes(q) ||
      p.context.state.toLowerCase().includes(q) ||
      p.context.zip.includes(q)
  ).map((p) => p.context);

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CivicPulse-Transparency-Dashboard/1.0',
      },
    });

    if (res.ok) {
      const data = await res.json();
      const results: LocationContext[] = data.map((item: any) => {
        const addr = item.address || {};
        const city = addr.city || addr.town || addr.village || addr.municipality || item.name || 'Local Area';
        const county = addr.county || `${city} County`;
        const state = addr.state || 'United States';
        const stateCode = addr['ISO3166-2-lvl4']?.replace('US-', '') || state.substring(0, 2).toUpperCase();
        const zip = addr.postcode || '00000';
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        const districtNum = Math.floor(Math.abs(lng * 3) % 20) + 1;

        return {
          lat,
          lng,
          displayName: item.display_name,
          city,
          county,
          state,
          stateCode,
          zip,
          congressionalDistrict: String(districtNum),
          municipalWard: `Ward ${Math.floor(Math.abs(lat * 5) % 8) + 1}`,
          formattedAddress: `${city}, ${stateCode} ${zip}`,
        };
      });

      // Merge results avoiding duplicate coordinates
      const all = [...matchedPresets, ...results];
      const unique = all.filter(
        (v, i, a) => a.findIndex((t) => Math.abs(t.lat - v.lat) < 0.01 && Math.abs(t.lng - v.lng) < 0.01) === i
      );
      return unique;
    }
  } catch (err) {
    console.warn('Geocoding search notice:', err);
  }

  return matchedPresets;
}

export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  });
}
