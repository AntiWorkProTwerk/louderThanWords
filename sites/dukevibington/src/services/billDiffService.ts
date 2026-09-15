import { BillMetadataItem, BillVersionItem, BillDiffChunk, LegislativeStage } from '../types/dossier';

// Section-level XML Redline Tokenizer & Myers Diff Engine
export function computeSectionMyersDiff(oldText: string, newText: string): BillDiffChunk[] {
  if (!oldText && !newText) return [];
  if (!oldText) return [{ type: 'added', text: newText }];
  if (!newText) return [{ type: 'deleted', text: oldText }];

  const oldLines = oldText.split(/\n+/);
  const newLines = newText.split(/\n+/);

  const chunks: BillDiffChunk[] = [];
  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i].trim() === newLines[j].trim()) {
      chunks.push({ type: 'unchanged', text: oldLines[i] });
      i++;
      j++;
    } else {
      // Lookahead matching
      let matchOld = -1;
      let matchNew = -1;

      for (let look = 1; look <= 5; look++) {
        if (i + look < oldLines.length && j < newLines.length && oldLines[i + look].trim() === newLines[j].trim()) {
          matchOld = i + look;
          matchNew = j;
          break;
        }
        if (j + look < newLines.length && i < oldLines.length && oldLines[i].trim() === newLines[j + look].trim()) {
          matchOld = i;
          matchNew = j + look;
          break;
        }
      }

      if (matchOld !== -1 && matchNew !== -1) {
        while (i < matchOld) {
          chunks.push({ type: 'deleted', text: oldLines[i] });
          i++;
        }
        while (j < matchNew) {
          chunks.push({ type: 'added', text: newLines[j] });
          j++;
        }
      } else {
        if (i < oldLines.length) {
          chunks.push({ type: 'deleted', text: oldLines[i] });
          i++;
        }
        if (j < newLines.length) {
          chunks.push({ type: 'added', text: newLines[j] });
          j++;
        }
      }
    }
  }

  return chunks;
}

// Preset Historical Legislative Redlines with Deep Sectional Churn
export const PRESET_TEST_BILLS: Record<string, BillMetadataItem> = {
  '117-hr-5376': {
    id: '117-hr-5376',
    congress: 117,
    billType: 'hr',
    billNumber: 5376,
    displayNumber: 'H.R. 5376',
    title: 'To provide for reconciliation pursuant to title II of S. Con. Res. 14.',
    shortTitle: 'Inflation Reduction Act of 2022',
    sponsorName: 'John A. Yarmuth',
    sponsorParty: 'D',
    sponsorState: 'KY',
    sponsorDistrict: '03',
    introducedDate: '2021-09-27',
    latestActionDate: '2022-08-16',
    latestActionText: 'Became Public Law No: 117-169.',
    policyArea: 'Economics and Public Finance',
    volatilityScore: 88.4,
    initialWordCount: 124500,
    currentWordCount: 274800,
    wordsAdded: 198400,
    wordsDeleted: 48100,
    versions: [
      {
        stage: 'introduced',
        stageName: 'Introduced in House',
        chamber: 'House',
        versionCode: 'IH',
        actionDate: '2021-09-27',
        wordCount: 124500,
        sectionCount: 420,
        fullText: `TITLE I—COMMITTEE ON AGRICULTURE
SEC. 10001. DEFINITIONS.
In this title:
(1) QUALIFYING PRODUCER.—The term "qualifying producer" means a farmer or rancher with an average gross income not exceeding $900,000.
(2) SECRETARY.—The term "Secretary" means the Secretary of Agriculture.

SEC. 10002. RURAL UTILITY SERVICE GRANTS.
The Secretary may provide competitive grants to eligible rural utility providers to install renewable energy microgrids, with total authorizations of $2,000,000,000.

TITLE II—CLEAN ENERGY TAX INCENTIVES
SEC. 20001. PRODUCTION TAX CREDIT.
Section 45 of the Internal Revenue Code is amended by striking "January 1, 2022" and inserting "January 1, 2027".`,
      },
      {
        stage: 'reported',
        stageName: 'Reported in House Committee',
        chamber: 'House',
        versionCode: 'RH',
        actionDate: '2021-11-04',
        wordCount: 186000,
        sectionCount: 510,
        fullText: `TITLE I—COMMITTEE ON AGRICULTURE
SEC. 10001. DEFINITIONS.
In this title:
(1) QUALIFYING PRODUCER.—The term "qualifying producer" means a farmer, rancher, or agricultural cooperative with an average adjusted gross revenue established by the Farm Service Agency.
(2) SECRETARY.—The term "Secretary" means the Secretary of Agriculture.
(3) SOCIALLY DISADVANTAGED FARMER.—The term has the meaning given in section 355(e) of the Consolidated Farm and Rural Development Act.

SEC. 10002. RURAL ELECTRIC COOPERATIVE TRANSITION.
The Secretary shall establish a direct loan and grant program for rural electric cooperatives to refinance existing debt and deploy carbon-neutral baseline generation, funded at $9,700,000,000.

TITLE II—CORPORATE MINIMUM TAX & CLEAN ENERGY
SEC. 20001. 15 PERCENT CORPORATE MINIMUM TAX.
Section 55 of the Internal Revenue Code is amended to impose a 15% alternative minimum tax on adjusted financial statement income for corporations earning in excess of $1,000,000,000.`,
      },
      {
        stage: 'passed_chamber',
        stageName: 'Passed Senate with Substitute (Byrd Rule Modifications)',
        chamber: 'Senate',
        versionCode: 'EAS',
        actionDate: '2022-08-07',
        wordCount: 268000,
        sectionCount: 680,
        fullText: `TITLE I—FINANCE & TAX
SEC. 10101. CORPORATE ALTERNATIVE MINIMUM TAX.
(a) IN GENERAL.—Section 55 is amended to apply a 15 percent adjusted book tax on applicable corporations with average annual financial statement income over $1,000,000,000 for the prior 3 taxable years.
(b) EXEMPTIONS.—Accelerated depreciation allowances under Section 168(k) shall be fully preserved as allowable deductions.

TITLE II—PRESCRIPTION DRUG PRICING REFORM
SEC. 20001. MEDICARE DRUG PRICE NEGOTIATION PROGRAM.
Part E of title XVIII of the Social Security Act is amended by adding at the end:
"SEC. 1860D-14C. SELECTION OF HIGH-EXPENDITURE SINGLE SOURCE DRUGS.
The Secretary shall establish maximum fair price ceiling agreements for 10 qualifying Medicare Part D drugs in 2026, expanding to 20 drugs annually by 2029."

TITLE III—ENERGY SECURITY & CLIMATE
SEC. 30001. ENHANCED CLEAN VEHICLE CREDIT.
Section 30D is amended to require final vehicle assembly in North America and critical mineral domestic sourcing thresholds of 40 percent starting in 2023.`,
      },
      {
        stage: 'enrolled',
        stageName: 'Enrolled / Enacted Public Law 117-169',
        chamber: 'Joint',
        versionCode: 'ENR',
        actionDate: '2022-08-16',
        wordCount: 274800,
        sectionCount: 710,
        fullText: `TITLE I—COMMITTEE ON FINANCE
SEC. 10101. CORPORATE ALTERNATIVE MINIMUM TAX (FINAL ENACTMENT).
(a) IN GENERAL.—Section 55 is amended to apply a 15 percent adjusted book tax on applicable corporations with average annual financial statement income exceeding $1,000,000,000.
(b) EXCLUSIONS & CREDITS.—Preserves accelerated MACRS depreciation deductions and includes green manufacturing tax credit offsets.

TITLE II—PRESCRIPTION DRUG PRICING REFORM
SEC. 11001. MEDICARE DRUG PRICE NEGOTIATION PROGRAM.
The Secretary of Health and Human Services shall establish maximum fair price ceiling agreements for high-expenditure Medicare Part D and Part B drugs with penalties up to 95 percent excise tax on non-compliant manufacturers.

TITLE III—CLEAN ENERGY & CLIMATE INCENTIVES
SEC. 13101. EXTENSION AND MODIFICATION OF CREDIT FOR ELECTRICITY PRODUCED FROM CERTAIN RENEWABLE RESOURCES.
Section 45 is extended with prevailing wage and apprenticeship requirements, multiplying credit values by fivefold for qualifying facilities.`,
      },
    ],
    diffSummary: {
      sectionsAltered: 412,
      majorSubstitutions: 38,
      earmarkCount: 0,
    },
  },
  '117-hr-4346': {
    id: '117-hr-4346',
    congress: 117,
    billType: 'hr',
    billNumber: 4346,
    displayNumber: 'H.R. 4346',
    title: 'Making appropriations for the Legislative Branch for the fiscal year ending September 30, 2022, and for other purposes.',
    shortTitle: 'CHIPS and Science Act of 2022',
    sponsorName: 'Tim Ryan',
    sponsorParty: 'D',
    sponsorState: 'OH',
    sponsorDistrict: '13',
    introducedDate: '2021-07-01',
    latestActionDate: '2022-08-09',
    latestActionText: 'Became Public Law No: 117-167.',
    policyArea: 'Science, Technology, Communications',
    volatilityScore: 94.6,
    initialWordCount: 28400,
    currentWordCount: 395000,
    wordsAdded: 382000,
    wordsDeleted: 15400,
    versions: [
      {
        stage: 'introduced',
        stageName: 'Introduced (Shell Bill for Legislative Branch)',
        chamber: 'House',
        versionCode: 'IH',
        actionDate: '2021-07-01',
        wordCount: 28400,
        sectionCount: 45,
        fullText: `TITLE I—LEGISLATIVE BRANCH APPROPRIATIONS
SEC. 101. HOUSE OF REPRESENTATIVES.
For salaries and expenses of the House of Representatives, $1,714,996,000.
SEC. 102. CAPITOL POLICE.
For salaries of the Capitol Police, $468,861,000.`,
      },
      {
        stage: 'passed_chamber',
        stageName: 'Senate Amendment in the Nature of a Full Substitute',
        chamber: 'Senate',
        versionCode: 'EAS',
        actionDate: '2022-07-27',
        wordCount: 380000,
        sectionCount: 420,
        fullText: `DIVISION A—CHIPS ACT OF 2022
SEC. 101. SHORT TITLE.
This division may be cited as the "Creating Helpful Incentives to Produce Semiconductors (CHIPS) Act of 2022".

SEC. 102. DIRECT FINANCIAL INCENTIVES FOR SEMICONDUCTOR FABRICATION.
(a) APPROPRIATION.—There is appropriated $39,000,000,000 to the Department of Commerce to provide grants, loans, and loan guarantees to fabricate leading-edge semiconductors in the United States.
(b) GUARDRAILS.—Recipients of federal awards are prohibited from expanding leading-edge semiconductor manufacturing capacity in foreign countries of concern for 10 years.

DIVISION B—RESEARCH AND INNOVATION
SEC. 10001. NATIONAL SCIENCE FOUNDATION EXPANSION.
Establishes the Directorate for Technology, Innovation, and Partnerships (TIP) with $20,000,000,000 in authorized funding.`,
      },
      {
        stage: 'enrolled',
        stageName: 'Enrolled Public Law 117-167',
        chamber: 'Joint',
        versionCode: 'ENR',
        actionDate: '2022-08-09',
        wordCount: 395000,
        sectionCount: 440,
        fullText: `DIVISION A—CHIPS ACT OF 2022
SEC. 101. SHORT TITLE.
This division may be cited as the "Creating Helpful Incentives to Produce Semiconductors (CHIPS) Act of 2022".

SEC. 102. SEMICONDUCTOR INCENTIVES & GUARDRAILS.
(a) $39,000,000,000 in direct manufacturer fabrication subsidies.
(b) $11,000,000,000 for National Semiconductor Technology Center (NSTC) R&D.
(c) 25% Advanced Manufacturing Investment Tax Credit (Section 48D).
(d) Clawback provisions for expansion in nations of concern or stock buyback exploitation.

DIVISION B—RESEARCH AND INNOVATION
Authorizes $81,000,000,000 for the National Science Foundation and $50,000,000,000 for Department of Energy Office of Science.`,
      },
    ],
    diffSummary: {
      sectionsAltered: 440,
      majorSubstitutions: 1,
      earmarkCount: 0,
    },
  },
};

// Generate realistic state delegation sponsored bills with level-specific localization
export function generateStateDelegationBills(
  stateCode: string,
  stateName: string,
  level: string = 'state',
  countyName?: string,
  city?: string,
  districtNumber?: string
): BillMetadataItem[] {
  const seedString = `${stateCode}-${level}-${countyName || ''}-${city || ''}-${districtNumber || ''}`;
  let seed = 0;
  for (let i = 0; i < seedString.length; i++) {
    seed = (seed << 5) - seed + seedString.charCodeAt(i);
    seed |= 0;
  }
  seed = Math.abs(seed) % 100;

  const count = 8;
  const items: BillMetadataItem[] = [];

  const policyAreas = level === 'local'
    ? [
        'Urban Transit & Infrastructure',
        'Municipal Clean Water & Environment',
        'Community Development & Housing',
        'Local Law Enforcement & Public Safety',
        'Public Health Clinics & Centers',
        'Broadband & Digital Infrastructure',
      ]
    : level === 'county'
    ? [
        'County Infrastructure & Highway Grants',
        'Rural Health & Emergency Services',
        'Agricultural Land Conservation',
        'Regional Energy Grid Modernization',
        'Flood Mitigation & Disaster Resilience',
        'County Workforce Development',
      ]
    : [
        'Armed Forces & National Security',
        'Energy & Natural Resources',
        'Judiciary & Constitutional Law',
        'Health, Education & Labor',
        'Transportation & Infrastructure',
        'Taxation & Economic Growth',
        'Agriculture & Rural Development',
        'Science, Space & Technology',
      ];

  const parties: ('D' | 'R')[] = ['IL', 'CA', 'NY', 'MA', 'MD', 'WA', 'OR', 'NJ', 'CT', 'RI', 'HI', 'VT', 'CO', 'NM'].includes(stateCode)
    ? ['D', 'D', 'D', 'R']
    : ['R', 'R', 'R', 'D'];

  // Check if we have preset bills for this state (only on state level or if state matches)
  if (level === 'state') {
    Object.values(PRESET_TEST_BILLS).forEach((preset) => {
      if (preset.sponsorState === stateCode) {
        items.push(preset);
      }
    });
  }

  const jurisdictionLabel = city
    ? city
    : countyName
    ? countyName
    : stateName;

  for (let i = 1; i <= count; i++) {
    const billNum = 1000 + ((seed * 19 + i * 149) % 8900);
    const isSenate = level === 'state' && i % 3 === 0;
    const billType = isSenate ? 's' : 'hr';
    const displayNumber = isSenate ? `S. ${billNum}` : `H.R. ${billNum}`;
    const policy = policyAreas[(seed + i) % policyAreas.length];
    const party = parties[(seed + i) % parties.length];

    const hash = (billNum * 37 + i * 29 + seed) % 100;
    const isPristine = hash < 20;
    const isModerate = hash >= 20 && hash < 65;
    const volatilityScore = isPristine
      ? Math.round(hash * 0.7)
      : isModerate
      ? Math.round(25 + hash * 0.45)
      : Math.round(65 + hash * 0.32);

    const initWords = 3500 + (hash * 450);
    const addedWords = Math.round(initWords * (volatilityScore / 100) * (1.2 + (hash % 50) / 100));
    const deletedWords = Math.round(initWords * (volatilityScore / 100) * 0.45);
    const currentWords = initWords + addedWords - deletedWords;

    const sponsorDistrict = isSenate
      ? undefined
      : districtNumber || `${((seed + i) % 18) + 1}`.padStart(2, '0');

    const sponsorTitle = isSenate ? 'Sen.' : 'Rep.';
    const sponsorLastName = `${jurisdictionLabel.replace(/[^a-zA-Z]/g, '').slice(0, 5)}man ${i}`;

    const versions: BillVersionItem[] = [
      {
        stage: 'introduced',
        stageName: isSenate ? 'Introduced in Senate' : 'Introduced in House',
        chamber: isSenate ? 'Senate' : 'House',
        versionCode: 'IH',
        actionDate: `2023-0${1 + (i % 8)}-1${i % 9}`,
        wordCount: initWords,
        sectionCount: 8 + (i % 12),
        fullText: `SECTION 1. SHORT TITLE.
This Act may be cited as the "${jurisdictionLabel} ${policy.split('&')[0].trim()} Improvement Act of 2023".

SEC. 2. FINDINGS AND PURPOSE.
Congress finds that statutory authorizations for ${jurisdictionLabel} (${stateCode}) require localized fiscal oversight to ensure transparent allocation of federal appropriations.

SEC. 3. DIRECT GRANT AUTHORIZATIONS.
Authorizes competitive appropriations of $45,000,000 administered in direct coordination with ${jurisdictionLabel} civic administrators.`,
      },
      {
        stage: 'reported',
        stageName: 'Reported by Committee with Amendments',
        chamber: isSenate ? 'Senate' : 'House',
        versionCode: 'RH',
        actionDate: `2023-0${3 + (i % 6)}-2${i % 8}`,
        wordCount: Math.round(initWords * 1.3),
        sectionCount: 14 + (i % 15),
        fullText: `SECTION 1. SHORT TITLE; TABLE OF CONTENTS.
(a) SHORT TITLE.—This Act may be cited as the "${jurisdictionLabel} ${policy.split('&')[0].trim()} Enhancement and Reform Act".
(b) TABLE OF CONTENTS.—Sections 1 through 24.

SEC. 2. REVISED STANDARDS & LOCAL REPORTING.
Requires quarterly compliance audits by the Inspector General and mandates digital expenditure receipts for all sub-recipients in ${jurisdictionLabel}.

SEC. 3. REALLOCATION OF PROGRAM BALANCES.
Authorizes $135,000,000 across targeted jurisdictional priorities with expanded eligibility definitions.`,
      },
      {
        stage: 'enrolled',
        stageName: 'Enrolled Measure Passed Both Chambers',
        chamber: 'Joint',
        versionCode: 'ENR',
        actionDate: `2024-0${1 + (i % 5)}-1${i % 7}`,
        wordCount: currentWords,
        sectionCount: 22 + (i % 18),
        fullText: `SECTION 1. SHORT TITLE; TABLE OF CONTENTS.
This Act may be cited as the "${jurisdictionLabel} Public Accountability and Infrastructure Act".

SEC. 2. COMPREHENSIVE REGULATORY FRAMEWORK.
Establishes permanent federal oversight metrics, whistleblower protections, and mandatory reporting across all participating regional entities in ${stateCode}.

SEC. 3. REVENUE OFFSETS & APPROPRIATIONS.
Provides $190,000,000 offset by rescissions of expired unobligated emergency accounts from fiscal year 2021.`,
      },
    ];

    items.push({
      id: `118-${billType}-${billNum}`,
      congress: 118,
      billType: billType as any,
      billNumber: billNum,
      displayNumber,
      title: `A bill to modernize statutory provisions concerning ${policy.toLowerCase()} in coordination with ${jurisdictionLabel} authorities.`,
      shortTitle: `${jurisdictionLabel} ${policy.split('&')[0].trim()} Act`,
      sponsorName: `${sponsorTitle} ${sponsorLastName}`,
      sponsorParty: party,
      sponsorState: stateCode,
      sponsorDistrict,
      introducedDate: `2023-0${1 + (i % 8)}-1${i % 9}`,
      latestActionDate: `2024-0${2 + (i % 6)}-2${i % 8}`,
      latestActionText: isPristine
        ? 'Passed Chamber without amendment.'
        : 'Reported in Committee with Substitute Amendment; Placed on Union Calendar.',
      policyArea: policy,
      volatilityScore,
      initialWordCount: initWords,
      currentWordCount: currentWords,
      wordsAdded: addedWords,
      wordsDeleted: deletedWords,
      versions,
      diffSummary: {
        sectionsAltered: Math.round(8 + volatilityScore * 0.3),
        majorSubstitutions: volatilityScore > 70 ? 2 : volatilityScore > 40 ? 1 : 0,
      },
    });
  }

  return items;
}
