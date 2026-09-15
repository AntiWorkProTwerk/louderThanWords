// Service providing authentic government headshot URLs using the official @unitedstates CDN
// CDN Source: https://unitedstates.github.io/images/congress/

export const CONGRESS_CDN_225x275 = 'https://unitedstates.github.io/images/congress/225x275';
export const CONGRESS_CDN_450x550 = 'https://unitedstates.github.io/images/congress/450x550';
export const CONGRESS_CDN_ORIGINAL = 'https://unitedstates.github.io/images/congress/original';

// Bioguide ID mapping for U.S. Senators, Representatives, and Leadership
export const BIOGUIDE_MAP: Record<string, string> = {
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
  'beto o rourke': 'O000170',

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
  'greg landsman': 'L000601',

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
  'charles schumer': 'S000148',
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

// Official Executive & State/Local Portraits (verified official public records)
export const OFFICIAL_GOVERNMENT_PORTRAITS: Record<string, string> = {
  // Federal Executive
  'president of the united states': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Joe_Biden_presidential_portrait_%28cropped%29.jpg/440px-Joe_Biden_presidential_portrait_%28cropped%29.jpg',
  'joe biden': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Joe_Biden_presidential_portrait_%28cropped%29.jpg/440px-Joe_Biden_presidential_portrait_%28cropped%29.jpg',
  'kamala harris': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Kamala_Harris_Vice_Presidential_Portrait.jpg/440px-Kamala_Harris_Vice_Presidential_Portrait.jpg',

  // Illinois State & Municipal
  'jb pritzker': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/JB_Pritzker_official_portrait.jpg/440px-JB_Pritzker_official_portrait.jpg',
  'j.b. pritzker': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/JB_Pritzker_official_portrait.jpg/440px-JB_Pritzker_official_portrait.jpg',
  'governor of the state of illinois': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/JB_Pritzker_official_portrait.jpg/440px-JB_Pritzker_official_portrait.jpg',
  'brandon johnson': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Mayor_Brandon_Johnson_official_portrait_%28cropped%29.jpg/440px-Mayor_Brandon_Johnson_official_portrait_%28cropped%29.jpg',
  'mayor of chicago': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Mayor_Brandon_Johnson_official_portrait_%28cropped%29.jpg/440px-Mayor_Brandon_Johnson_official_portrait_%28cropped%29.jpg',
  'deborah frank feinen': 'https://champaignil.gov/wp-content/uploads/2015/05/Feinen_Deborah.jpg',
  'deborah albright': 'https://co.champaign.il.us/images/countyboard/albright.jpg',
  'dustin heuerman': 'https://co.champaign.il.us/sheriff/images/heuerman.jpg',

  // Texas State & Municipal
  'greg abbott': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Governor_Greg_Abbott_2015.jpg/440px-Governor_Greg_Abbott_2015.jpg',
  'kirk watson': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Kirk_Watson_2023.jpg/440px-Kirk_Watson_2023.jpg',
  'andy brown': 'https://www.traviscountytx.gov/images/county-judge/judge-andy-brown.jpg',

  // Washington State & Municipal
  'jay inslee': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Jay_Inslee_official_portrait.jpg/440px-Jay_Inslee_official_portrait.jpg',
  'bruce harrell': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Mayor_Bruce_Harrell_official_portrait.jpg/440px-Mayor_Bruce_Harrell_official_portrait.jpg',
  'dow constantine': 'https://kingcounty.gov/~/media/elected/executive/constantine/images/dow-constantine-portrait.ashx',

  // Ohio State & Municipal
  'mike dewine': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Mike_DeWine_official_portrait.jpg/440px-Mike_DeWine_official_portrait.jpg',
  'andrew ginther': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Andrew_Ginther_2016.jpg/440px-Andrew_Ginther_2016.jpg',

  // California State & Municipal
  'gavin newsom': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Gavin_Newsom_official_photo_%28cropped%29.jpg/440px-Gavin_Newsom_official_photo_%28cropped%29.jpg',
  'london breed': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/London_Breed_official_portrait.jpg/440px-London_Breed_official_portrait.jpg',
};

/**
 * Resolves headshot URL for any representative, prioritizing the official Congress CDN
 * (https://unitedstates.github.io/images/congress/225x275/{bioguide}.jpg) for federal officials,
 * official government portraits for state/municipal executives, and clean fallback avatars.
 */
export function getHeadshotUrl(
  name: string,
  options?: {
    bioguideId?: string;
    jurisdictionLevel?: string;
    size?: '225x275' | '450x550' | 'original';
    existingPhotoUrl?: string;
  }
): string {
  const normalized = name.toLowerCase().trim().replace(/^hon\.\s+/i, '').replace(/^rep\.\s+/i, '').replace(/^sen\.\s+/i, '').replace(/^dr\.\s+/i, '');

  // 1. Direct Bioguide ID passed
  if (options?.bioguideId) {
    const size = options.size || '225x275';
    return `https://unitedstates.github.io/images/congress/${size}/${options.bioguideId}.jpg`;
  }

  // 2. Bioguide lookup in our registry
  for (const [key, bioguide] of Object.entries(BIOGUIDE_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      const size = options?.size || '225x275';
      return `https://unitedstates.github.io/images/congress/${size}/${bioguide}.jpg`;
    }
  }

  // 3. Official Government / Executive Portrait
  for (const [key, url] of Object.entries(OFFICIAL_GOVERNMENT_PORTRAITS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return url;
    }
  }

  // 4. Use existing non-stock photo URL if valid and not a stock placeholder
  if (options?.existingPhotoUrl && !options.existingPhotoUrl.includes('unsplash.com') && !options.existingPhotoUrl.includes('stock')) {
    return options.existingPhotoUrl;
  }

  // 5. Clean fallback UI Avatar with official slate palette
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1e293b&color=f8fafc&size=256&bold=true`;
}
