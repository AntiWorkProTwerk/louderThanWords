import { CONGRESS_NAME_TO_BIOGUIDE, CONGRESS_DISTRICT_TO_BIOGUIDE } from '../data/congressBioguideData';

// Service providing authentic government headshot URLs streamed directly from the official @unitedstates CDN
// CDN Source: https://unitedstates.github.io/images/congress/

export const CONGRESS_CDN_225x275 = 'https://unitedstates.github.io/images/congress/225x275';
export const CONGRESS_CDN_450x550 = 'https://unitedstates.github.io/images/congress/450x550';
export const CONGRESS_CDN_ORIGINAL = 'https://unitedstates.github.io/images/congress/original';

// Direct Bioguide ID mapping for federal officials, leadership, and executives
export const BIOGUIDE_MAP: Record<string, string> = {
  // President & Vice President (served in Congress)
  'president of the united states': 'B000444', // Joe Biden (B000444)
  'joe biden': 'B000444',
  'kamala harris': 'H001075', // Kamala Harris (H001075)

  // Illinois
  'nikki budzinski': 'B001315',
  'dick durbin': 'D000563',
  'richard durbin': 'D000563',
  'tammy duckworth': 'D000622',
  'mike bost': 'B001295',
  'robin kelly': 'K000385',
  'delia ramirez': 'R000617',
  'jesus garcia': 'G000586',
  'chuy garcia': 'G000586',
  'mike quigley': 'Q000023',
  'sean casten': 'C001117',
  'danny davis': 'D000096',
  'raja krishnamoorthi': 'K000391',
  'jan schakowsky': 'S001145',
  'brad schneider': 'S001190',
  'bill foster': 'F000454',
  'lauren underwood': 'U000040',
  'mary miller': 'M001211',
  'eric sorensen': 'S001225',
  'darin lahood': 'L000585',

  // Texas
  'john cornyn': 'C001056',
  'ted cruz': 'C001098',
  'lloyd doggett': 'D000399',
  'greg casar': 'C001131',
  'chip roy': 'R000614',
  'michael mccaul': 'M001157',
  'dan crenshaw': 'C001120',
  'sheila jackson lee': 'J000032',
  'al green': 'G000553',
  'joaquin castro': 'C001115',
  'jasmine crockett': 'C001130',
  'colin allred': 'A000376',

  // Washington
  'patty murray': 'M001111',
  'maria cantwell': 'C000127',
  'pramila jayapal': 'J000298',
  'adam smith': 'S000510',
  'rick larsen': 'L000560',
  'suzan delbene': 'D000617',
  'kim schrier': 'S001216',

  // Ohio
  'sherrod brown': 'B000944',
  'jd vance': 'V000137',
  'j.d. vance': 'V000137',
  'bernie moreno': 'M001229',
  'joyce beatty': 'B001281',
  'jim jordan': 'J000289',
  'marcy kaptur': 'K000009',
  'shontel brown': 'B001313',

  // California
  'alex padilla': 'P000145',
  'laphonza butler': 'B001320',
  'adam schiff': 'S001150',
  'nancy pelosi': 'P000197',
  'kevin mccarthy': 'M001165',
  'ted lieu': 'L000582',
  'ro khanna': 'K000389',
  'eric swalwell': 'S001193',
  'barbara lee': 'L000551',
  'katie porter': 'P000618',
  'maxine waters': 'W000187',

  // Congressional Leadership & Prominent
  'mike johnson': 'J000299',
  'hakeem jeffries': 'J000294',
  'chuck schumer': 'S000148',
  'mitch mcconnell': 'M000355',
  'john thune': 'T000250',
  'bernie sanders': 'S000033',
  'elizabeth warren': 'W000817',
  'ed markey': 'M000133',
  'mark warner': 'W000805',
  'tim kaine': 'K000384',
  'amy klobuchar': 'K000367',
  'cory booker': 'B001288',
  'mitt romney': 'R000615',
  'lindsey graham': 'G000359',
  'marco rubio': 'R000595',
  'rick scott': 'S001217',
  'raphael warnock': 'W000790',
  'jon ossoff': 'O000174',
  'alexandria ocasio-cortez': 'O000172',
  'ilhan omar': 'O000173',
  'rashida tlaib': 'T000481',
  'ayanna pressley': 'P000617',
  'jamie raskin': 'R000606',
};

// Generates a self-contained SVG civic bust portrait for non-congress state/municipal officials
export function createCivicPortraitSvg(
  name: string,
  party: 'Democratic' | 'Republican' | 'Nonpartisan' | string = 'Nonpartisan',
  role: 'Executive' | 'Legislative' | 'Judicial' | 'Law Enforcement' | string = 'Executive'
): string {
  const isDem = party.toLowerCase().includes('dem');
  const isRep = party.toLowerCase().includes('rep');
  const accentColor = isDem ? '#3b82f6' : isRep ? '#ef4444' : '#10b981';
  const secondaryColor = isDem ? '#1d4ed8' : isRep ? '#b91c1c' : '#059669';

  const initials = name
    .replace(/^(Hon\.|Rep\.|Sen\.|Senator|Representative|Congressman|Congresswoman|Mayor|Gov\.|Governor|Dr\.)\s+/gi, '')
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 225 275" width="225" height="275">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a" />
        <stop offset="50%" stop-color="#1e293b" />
        <stop offset="100%" stop-color="#020617" />
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${accentColor}" />
        <stop offset="100%" stop-color="${secondaryColor}" />
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="35%" r="60%">
        <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.25" />
        <stop offset="100%" stop-color="${accentColor}" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="suit" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#334155" />
        <stop offset="100%" stop-color="#0f172a" />
      </linearGradient>
    </defs>
    
    <rect width="225" height="275" fill="url(#bg)" />
    <circle cx="112.5" cy="95" r="90" fill="url(#glow)" />
    <rect x="3" y="3" width="219" height="269" rx="8" fill="none" stroke="url(#accent)" stroke-width="2.5" stroke-opacity="0.8" />
    <path d="M 35 275 C 35 205, 70 180, 112.5 180 C 155 180, 190 205, 190 275 Z" fill="url(#suit)" />
    <path d="M 98 180 L 112.5 215 L 127 180 Z" fill="#f8fafc" />
    <path d="M 110 186 L 115 186 L 114 235 L 112.5 240 L 111 235 Z" fill="url(#accent)" />
    <circle cx="112.5" cy="115" r="46" fill="#cbd5e1" opacity="0.95" />
    <circle cx="112.5" cy="115" r="46" fill="url(#accent)" opacity="0.2" />
    <text x="112.5" y="127" font-family="system-ui, -apple-system, sans-serif" font-size="34" font-weight="800" fill="#0f172a" text-anchor="middle" letter-spacing="-1">${initials}</text>
    <rect x="20" y="240" width="185" height="24" rx="12" fill="#0f172a" stroke="url(#accent)" stroke-width="1.5" />
    <circle cx="34" cy="252" r="5" fill="${accentColor}" />
    <text x="118" y="256" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="700" fill="#e2e8f0" text-anchor="middle" text-transform="uppercase" letter-spacing="1">${role.toUpperCase()}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Resolves headshot URL for any representative streamed live from the official Congress CDN
 * (https://unitedstates.github.io/images/congress/225x275/{bioguide}.jpg) for federal officials,
 * with vector portraits for municipal/local leaders.
 */
export function getHeadshotUrl(
  name: string,
  options?: {
    bioguideId?: string;
    stateCode?: string;
    district?: string;
    party?: string;
    role?: string;
    jurisdictionLevel?: string;
    size?: '225x275' | '450x550' | 'original';
    existingPhotoUrl?: string;
  }
): string {
  const size = options?.size || '225x275';
  const cleanName = name
    .replace(/^(Hon\.|Rep\.|Sen\.|Senator|Representative|Congressman|Congresswoman|Mayor|Gov\.|Governor|Dr\.)\s+/gi, '')
    .trim();
  const normalized = cleanName.toLowerCase();

  // 1. Direct Bioguide ID passed -> Use official Congress CDN directly
  if (options?.bioguideId) {
    return `https://unitedstates.github.io/images/congress/${size}/${options.bioguideId}.jpg`;
  }

  // 2. Exact match in 539-member Congress Bioguide Registry -> Use official Congress CDN directly
  if (CONGRESS_NAME_TO_BIOGUIDE[normalized]) {
    return `https://unitedstates.github.io/images/congress/${size}/${CONGRESS_NAME_TO_BIOGUIDE[normalized]}.jpg`;
  }

  // 3. District match if stateCode + district provided (e.g. IL-13) -> Use official Congress CDN directly
  if (options?.stateCode && options?.district) {
    const distKey = `${options.stateCode.toUpperCase()}-${options.district}`;
    if (CONGRESS_DISTRICT_TO_BIOGUIDE[distKey]) {
      return `https://unitedstates.github.io/images/congress/${size}/${CONGRESS_DISTRICT_TO_BIOGUIDE[distKey]}.jpg`;
    }
  }

  // 4. Fuzzy lookup in Congress Bioguide Registry -> Use official Congress CDN directly
  for (const [key, bioguide] of Object.entries(CONGRESS_NAME_TO_BIOGUIDE)) {
    if (key.length > 3 && (normalized.includes(key) || key.includes(normalized))) {
      return `https://unitedstates.github.io/images/congress/${size}/${bioguide}.jpg`;
    }
  }

  // 5. Bioguide lookup in explicit BIOGUIDE_MAP
  for (const [key, bioguide] of Object.entries(BIOGUIDE_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return `https://unitedstates.github.io/images/congress/${size}/${bioguide}.jpg`;
    }
  }

  // 6. Use existing photo URL if valid
  if (
    options?.existingPhotoUrl &&
    !options.existingPhotoUrl.includes('unsplash.com') &&
    !options.existingPhotoUrl.includes('stock') &&
    !options.existingPhotoUrl.includes('ui-avatars.com') &&
    !options.existingPhotoUrl.includes('placeholder')
  ) {
    return options.existingPhotoUrl;
  }

  // 7. Generate official civic vector portrait
  return createCivicPortraitSvg(cleanName, options?.party || 'Nonpartisan', options?.role || 'Executive');
}
