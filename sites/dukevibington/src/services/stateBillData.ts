export interface StateBillVolatilityAggregate {
  fips: string;
  stateCode: string;
  stateName: string;
  totalBillsSponsored: number;
  enactedBillsCount: number;
  averageVolatilityScore: number; // 0 - 100% Rewrite Index
  totalWordsAdded: number;
  totalWordsDeleted: number;
  majorSubstitutionsCount: number;
  primaryPolicyFocus: string;
}

// State-level legislative text volatility aggregate dataset based on congressional delegation legislative churn
export const STATE_BILL_VOLATILITY_DATA: Record<string, StateBillVolatilityAggregate> = {
  '01': { fips: '01', stateCode: 'AL', stateName: 'Alabama', totalBillsSponsored: 142, enactedBillsCount: 18, averageVolatilityScore: 36.0, totalWordsAdded: 182000, totalWordsDeleted: 74000, majorSubstitutionsCount: 8, primaryPolicyFocus: 'Armed Forces & National Security' },
  '02': { fips: '02', stateCode: 'AK', stateName: 'Alaska', totalBillsSponsored: 98, enactedBillsCount: 14, averageVolatilityScore: 48.0, totalWordsAdded: 145000, totalWordsDeleted: 62000, majorSubstitutionsCount: 11, primaryPolicyFocus: 'Public Lands & Natural Resources' },
  '04': { fips: '04', stateCode: 'AZ', stateName: 'Arizona', totalBillsSponsored: 210, enactedBillsCount: 24, averageVolatilityScore: 54.0, totalWordsAdded: 320000, totalWordsDeleted: 140000, majorSubstitutionsCount: 19, primaryPolicyFocus: 'Immigration & Border Security' },
  '05': { fips: '05', stateCode: 'AR', stateName: 'Arkansas', totalBillsSponsored: 84, enactedBillsCount: 9, averageVolatilityScore: 18.0, totalWordsAdded: 68000, totalWordsDeleted: 22000, majorSubstitutionsCount: 3, primaryPolicyFocus: 'Agriculture & Forestry' },
  '06': { fips: '06', stateCode: 'CA', stateName: 'California', totalBillsSponsored: 890, enactedBillsCount: 112, averageVolatilityScore: 78.0, totalWordsAdded: 1840000, totalWordsDeleted: 920000, majorSubstitutionsCount: 84, primaryPolicyFocus: 'Technology, Climate & Judiciary' },
  '08': { fips: '08', stateCode: 'CO', stateName: 'Colorado', totalBillsSponsored: 175, enactedBillsCount: 22, averageVolatilityScore: 42.0, totalWordsAdded: 240000, totalWordsDeleted: 95000, majorSubstitutionsCount: 14, primaryPolicyFocus: 'Energy & Public Lands' },
  '09': { fips: '09', stateCode: 'CT', stateName: 'Connecticut', totalBillsSponsored: 165, enactedBillsCount: 21, averageVolatilityScore: 62.0, totalWordsAdded: 290000, totalWordsDeleted: 115000, majorSubstitutionsCount: 17, primaryPolicyFocus: 'Healthcare & Defense Procurement' },
  '10': { fips: '10', stateCode: 'DE', stateName: 'Delaware', totalBillsSponsored: 76, enactedBillsCount: 12, averageVolatilityScore: 24.0, totalWordsAdded: 92000, totalWordsDeleted: 31000, majorSubstitutionsCount: 4, primaryPolicyFocus: 'Corporate Finance & Banking' },
  '11': { fips: '11', stateCode: 'DC', stateName: 'District of Columbia', totalBillsSponsored: 64, enactedBillsCount: 6, averageVolatilityScore: 12.0, totalWordsAdded: 45000, totalWordsDeleted: 12000, majorSubstitutionsCount: 2, primaryPolicyFocus: 'Government Operations & Home Rule' },
  '12': { fips: '12', stateCode: 'FL', stateName: 'Florida', totalBillsSponsored: 460, enactedBillsCount: 52, averageVolatilityScore: 68.0, totalWordsAdded: 820000, totalWordsDeleted: 390000, majorSubstitutionsCount: 41, primaryPolicyFocus: 'Disaster Relief & Homeland Security' },
  '13': { fips: '13', stateCode: 'GA', stateName: 'Georgia', totalBillsSponsored: 280, enactedBillsCount: 31, averageVolatilityScore: 44.0, totalWordsAdded: 410000, totalWordsDeleted: 175000, majorSubstitutionsCount: 22, primaryPolicyFocus: 'Agriculture & Infrastructure' },
  '15': { fips: '15', stateCode: 'HI', stateName: 'Hawaii', totalBillsSponsored: 110, enactedBillsCount: 15, averageVolatilityScore: 32.0, totalWordsAdded: 130000, totalWordsDeleted: 48000, majorSubstitutionsCount: 7, primaryPolicyFocus: 'Pacific Defense & Tourism' },
  '16': { fips: '16', stateCode: 'ID', stateName: 'Idaho', totalBillsSponsored: 65, enactedBillsCount: 8, averageVolatilityScore: 14.0, totalWordsAdded: 52000, totalWordsDeleted: 16000, majorSubstitutionsCount: 2, primaryPolicyFocus: 'Forestry & Federal Lands' },
  '17': { fips: '17', stateCode: 'IL', stateName: 'Illinois', totalBillsSponsored: 390, enactedBillsCount: 48, averageVolatilityScore: 66.0, totalWordsAdded: 690000, totalWordsDeleted: 310000, majorSubstitutionsCount: 34, primaryPolicyFocus: 'Judiciary, Healthcare & Transportation' },
  '18': { fips: '18', stateCode: 'IN', stateName: 'Indiana', totalBillsSponsored: 180, enactedBillsCount: 19, averageVolatilityScore: 28.0, totalWordsAdded: 210000, totalWordsDeleted: 72000, majorSubstitutionsCount: 11, primaryPolicyFocus: 'Commerce & Manufacturing' },
  '19': { fips: '19', stateCode: 'IA', stateName: 'Iowa', totalBillsSponsored: 120, enactedBillsCount: 14, averageVolatilityScore: 22.0, totalWordsAdded: 140000, totalWordsDeleted: 44000, majorSubstitutionsCount: 6, primaryPolicyFocus: 'Biofuels & Agriculture' },
  '20': { fips: '20', stateCode: 'KS', stateName: 'Kansas', totalBillsSponsored: 95, enactedBillsCount: 11, averageVolatilityScore: 25.0, totalWordsAdded: 115000, totalWordsDeleted: 38000, majorSubstitutionsCount: 5, primaryPolicyFocus: 'Aviation & Agriculture' },
  '21': { fips: '21', stateCode: 'KY', stateName: 'Kentucky', totalBillsSponsored: 160, enactedBillsCount: 26, averageVolatilityScore: 58.0, totalWordsAdded: 340000, totalWordsDeleted: 160000, majorSubstitutionsCount: 19, primaryPolicyFocus: 'Energy, Coal & Appropriations' },
  '22': { fips: '22', stateCode: 'LA', stateName: 'Louisiana', totalBillsSponsored: 145, enactedBillsCount: 18, averageVolatilityScore: 49.0, totalWordsAdded: 260000, totalWordsDeleted: 110000, majorSubstitutionsCount: 15, primaryPolicyFocus: 'Energy, Gulf Coast & Flood Insurance' },
  '23': { fips: '23', stateCode: 'ME', stateName: 'Maine', totalBillsSponsored: 90, enactedBillsCount: 16, averageVolatilityScore: 45.0, totalWordsAdded: 150000, totalWordsDeleted: 58000, majorSubstitutionsCount: 9, primaryPolicyFocus: 'Aging, Small Business & Maritime' },
  '24': { fips: '24', stateCode: 'MD', stateName: 'Maryland', totalBillsSponsored: 320, enactedBillsCount: 42, averageVolatilityScore: 72.0, totalWordsAdded: 710000, totalWordsDeleted: 340000, majorSubstitutionsCount: 38, primaryPolicyFocus: 'Federal Workforce & Oversight' },
  '25': { fips: '25', stateCode: 'MA', stateName: 'Massachusetts', totalBillsSponsored: 340, enactedBillsCount: 45, averageVolatilityScore: 76.0, totalWordsAdded: 820000, totalWordsDeleted: 410000, majorSubstitutionsCount: 44, primaryPolicyFocus: 'Banking, Health & Education' },
  '26': { fips: '26', stateCode: 'MI', stateName: 'Michigan', totalBillsSponsored: 260, enactedBillsCount: 30, averageVolatilityScore: 51.0, totalWordsAdded: 430000, totalWordsDeleted: 185000, majorSubstitutionsCount: 23, primaryPolicyFocus: 'Automotive, Great Lakes & Labor' },
  '27': { fips: '27', stateCode: 'MN', stateName: 'Minnesota', totalBillsSponsored: 195, enactedBillsCount: 25, averageVolatilityScore: 46.0, totalWordsAdded: 280000, totalWordsDeleted: 120000, majorSubstitutionsCount: 16, primaryPolicyFocus: 'Healthcare & Agriculture' },
  '28': { fips: '28', stateCode: 'MS', stateName: 'Mississippi', totalBillsSponsored: 115, enactedBillsCount: 14, averageVolatilityScore: 38.0, totalWordsAdded: 165000, totalWordsDeleted: 64000, majorSubstitutionsCount: 8, primaryPolicyFocus: 'Armed Forces & Rural Health' },
  '29': { fips: '29', stateCode: 'MO', stateName: 'Missouri', totalBillsSponsored: 190, enactedBillsCount: 21, averageVolatilityScore: 40.0, totalWordsAdded: 270000, totalWordsDeleted: 105000, majorSubstitutionsCount: 14, primaryPolicyFocus: 'Armed Services & Small Business' },
  '30': { fips: '30', stateCode: 'MT', stateName: 'Montana', totalBillsSponsored: 80, enactedBillsCount: 12, averageVolatilityScore: 35.0, totalWordsAdded: 120000, totalWordsDeleted: 45000, majorSubstitutionsCount: 7, primaryPolicyFocus: 'Public Lands & Veterans' },
  '31': { fips: '31', stateCode: 'NE', stateName: 'Nebraska', totalBillsSponsored: 78, enactedBillsCount: 9, averageVolatilityScore: 16.0, totalWordsAdded: 75000, totalWordsDeleted: 24000, majorSubstitutionsCount: 3, primaryPolicyFocus: 'Agriculture & Trade' },
  '32': { fips: '32', stateCode: 'NV', stateName: 'Nevada', totalBillsSponsored: 140, enactedBillsCount: 17, averageVolatilityScore: 52.0, totalWordsAdded: 240000, totalWordsDeleted: 110000, majorSubstitutionsCount: 13, primaryPolicyFocus: 'Public Lands, Water & Gaming' },
  '33': { fips: '33', stateCode: 'NH', stateName: 'New Hampshire', totalBillsSponsored: 95, enactedBillsCount: 13, averageVolatilityScore: 39.0, totalWordsAdded: 140000, totalWordsDeleted: 55000, majorSubstitutionsCount: 8, primaryPolicyFocus: 'Veterans & Small Business' },
  '34': { fips: '34', stateCode: 'NJ', stateName: 'New Jersey', totalBillsSponsored: 330, enactedBillsCount: 39, averageVolatilityScore: 64.0, totalWordsAdded: 620000, totalWordsDeleted: 280000, majorSubstitutionsCount: 31, primaryPolicyFocus: 'Foreign Affairs & Transit' },
  '35': { fips: '35', stateCode: 'NM', stateName: 'New Mexico', totalBillsSponsored: 125, enactedBillsCount: 16, averageVolatilityScore: 47.0, totalWordsAdded: 190000, totalWordsDeleted: 82000, majorSubstitutionsCount: 12, primaryPolicyFocus: 'Energy, National Labs & Water' },
  '36': { fips: '36', stateCode: 'NY', stateName: 'New York', totalBillsSponsored: 680, enactedBillsCount: 86, averageVolatilityScore: 84.0, totalWordsAdded: 1620000, totalWordsDeleted: 810000, majorSubstitutionsCount: 72, primaryPolicyFocus: 'Financial Services, Judiciary & Transit' },
  '37': { fips: '37', stateCode: 'NC', stateName: 'North Carolina', totalBillsSponsored: 250, enactedBillsCount: 28, averageVolatilityScore: 43.0, totalWordsAdded: 380000, totalWordsDeleted: 155000, majorSubstitutionsCount: 20, primaryPolicyFocus: 'Defense, Biotech & Banking' },
  '38': { fips: '38', stateCode: 'ND', stateName: 'North Dakota', totalBillsSponsored: 60, enactedBillsCount: 7, averageVolatilityScore: 15.0, totalWordsAdded: 55000, totalWordsDeleted: 18000, majorSubstitutionsCount: 2, primaryPolicyFocus: 'Energy & Agriculture' },
  '39': { fips: '39', stateCode: 'OH', stateName: 'Ohio', totalBillsSponsored: 310, enactedBillsCount: 37, averageVolatilityScore: 56.0, totalWordsAdded: 540000, totalWordsDeleted: 230000, majorSubstitutionsCount: 27, primaryPolicyFocus: 'Manufacturing, Banking & Defense' },
  '40': { fips: '40', stateCode: 'OK', stateName: 'Oklahoma', totalBillsSponsored: 130, enactedBillsCount: 15, averageVolatilityScore: 33.0, totalWordsAdded: 175000, totalWordsDeleted: 68000, majorSubstitutionsCount: 9, primaryPolicyFocus: 'Energy & Armed Forces' },
  '41': { fips: '41', stateCode: 'OR', stateName: 'Oregon', totalBillsSponsored: 185, enactedBillsCount: 24, averageVolatilityScore: 57.0, totalWordsAdded: 310000, totalWordsDeleted: 135000, majorSubstitutionsCount: 18, primaryPolicyFocus: 'Finance, Forestry & Trade' },
  '42': { fips: '42', stateCode: 'PA', stateName: 'Pennsylvania', totalBillsSponsored: 360, enactedBillsCount: 44, averageVolatilityScore: 61.0, totalWordsAdded: 680000, totalWordsDeleted: 295000, majorSubstitutionsCount: 33, primaryPolicyFocus: 'Energy, Healthcare & Judiciary' },
  '44': { fips: '44', stateCode: 'RI', stateName: 'Rhode Island', totalBillsSponsored: 110, enactedBillsCount: 17, averageVolatilityScore: 59.0, totalWordsAdded: 210000, totalWordsDeleted: 95000, majorSubstitutionsCount: 13, primaryPolicyFocus: 'Armed Services & Oceans' },
  '45': { fips: '45', stateCode: 'SC', stateName: 'South Carolina', totalBillsSponsored: 170, enactedBillsCount: 22, averageVolatilityScore: 49.0, totalWordsAdded: 280000, totalWordsDeleted: 120000, majorSubstitutionsCount: 16, primaryPolicyFocus: 'Judiciary & Armed Forces' },
  '46': { fips: '46', stateCode: 'SD', stateName: 'South Dakota', totalBillsSponsored: 62, enactedBillsCount: 8, averageVolatilityScore: 19.0, totalWordsAdded: 62000, totalWordsDeleted: 21000, majorSubstitutionsCount: 3, primaryPolicyFocus: 'Commerce & Agriculture' },
  '47': { fips: '47', stateCode: 'TN', stateName: 'Tennessee', totalBillsSponsored: 195, enactedBillsCount: 23, averageVolatilityScore: 41.0, totalWordsAdded: 290000, totalWordsDeleted: 115000, majorSubstitutionsCount: 15, primaryPolicyFocus: 'Health, Education & Energy' },
  '48': { fips: '48', stateCode: 'TX', stateName: 'Texas', totalBillsSponsored: 720, enactedBillsCount: 88, averageVolatilityScore: 81.0, totalWordsAdded: 1540000, totalWordsDeleted: 760000, majorSubstitutionsCount: 69, primaryPolicyFocus: 'Energy, Border, Armed Forces & Tech' },
  '49': { fips: '49', stateCode: 'UT', stateName: 'Utah', totalBillsSponsored: 135, enactedBillsCount: 17, averageVolatilityScore: 37.0, totalWordsAdded: 195000, totalWordsDeleted: 78000, majorSubstitutionsCount: 10, primaryPolicyFocus: 'Public Lands & Judiciary' },
  '50': { fips: '50', stateCode: 'VT', stateName: 'Vermont', totalBillsSponsored: 85, enactedBillsCount: 13, averageVolatilityScore: 47.0, totalWordsAdded: 160000, totalWordsDeleted: 68000, majorSubstitutionsCount: 9, primaryPolicyFocus: 'Budget, Veterans & Climate' },
  '51': { fips: '51', stateCode: 'VA', stateName: 'Virginia', totalBillsSponsored: 390, enactedBillsCount: 52, averageVolatilityScore: 73.0, totalWordsAdded: 790000, totalWordsDeleted: 360000, majorSubstitutionsCount: 42, primaryPolicyFocus: 'Intelligence, Defense & Federal Employees' },
  '53': { fips: '53', stateCode: 'WA', stateName: 'Washington', totalBillsSponsored: 290, enactedBillsCount: 38, averageVolatilityScore: 65.0, totalWordsAdded: 580000, totalWordsDeleted: 260000, majorSubstitutionsCount: 29, primaryPolicyFocus: 'Commerce, Tech & Natural Resources' },
  '54': { fips: '54', stateCode: 'WV', stateName: 'West Virginia', totalBillsSponsored: 110, enactedBillsCount: 19, averageVolatilityScore: 63.0, totalWordsAdded: 290000, totalWordsDeleted: 140000, majorSubstitutionsCount: 18, primaryPolicyFocus: 'Energy, Infrastructure & Appropriations' },
  '55': { fips: '55', stateCode: 'WI', stateName: 'Wisconsin', totalBillsSponsored: 175, enactedBillsCount: 20, averageVolatilityScore: 39.0, totalWordsAdded: 240000, totalWordsDeleted: 95000, majorSubstitutionsCount: 12, primaryPolicyFocus: 'Homeland Security & Trade' },
  '56': { fips: '56', stateCode: 'WY', stateName: 'Wyoming', totalBillsSponsored: 58, enactedBillsCount: 7, averageVolatilityScore: 17.0, totalWordsAdded: 50000, totalWordsDeleted: 17000, majorSubstitutionsCount: 2, primaryPolicyFocus: 'Energy & Natural Resources' },
  '72': { fips: '72', stateCode: 'PR', stateName: 'Puerto Rico', totalBillsSponsored: 45, enactedBillsCount: 4, averageVolatilityScore: 26.0, totalWordsAdded: 42000, totalWordsDeleted: 14000, majorSubstitutionsCount: 3, primaryPolicyFocus: 'Territorial Status & Economic Development' },
};

/**
 * Editorial CartoColors color scale for Legislative Text Volatility / Rewrite Index:
 * - 0% – 15% (Pristine / Baseline): fill-stone-200 (#E5E7EB)
 * - 16% – 35% (Minor Amendments): fill-orange-200 (#FED7AA)
 * - 36% – 55% (Substantial Revisions): fill-orange-400 (#FB923C)
 * - 56% – 75% (Major Rewrites): fill-red-600 (#DC2626)
 * - 76%+ (Omnibus Substitutions / Extreme Volatility): fill-red-900 (#7F1D1D)
 */
export function getEditorialVolatilityColor(
  volatilityScore: number,
  isSelected: boolean = false
): {
  fill: string;
  hoverFill: string;
  tailwindClass: string;
  category: string;
} {
  if (isSelected) {
    return {
      fill: '#1e3a8a', // Editorial Navy
      hoverFill: '#172554',
      tailwindClass: 'fill-blue-900',
      category: 'Selected Delegation',
    };
  }

  if (volatilityScore <= 15) {
    return {
      fill: '#E5E7EB',
      hoverFill: '#D1D5DB',
      tailwindClass: 'fill-stone-200',
      category: 'Pristine / Low Churn (0% – 15%)',
    };
  }

  if (volatilityScore <= 35) {
    return {
      fill: '#FED7AA',
      hoverFill: '#FDBA74',
      tailwindClass: 'fill-orange-200',
      category: 'Minor Amendments (16% – 35%)',
    };
  }

  if (volatilityScore <= 55) {
    return {
      fill: '#FB923C',
      hoverFill: '#F97316',
      tailwindClass: 'fill-orange-400',
      category: 'Substantial Revisions (36% – 55%)',
    };
  }

  if (volatilityScore <= 75) {
    return {
      fill: '#DC2626',
      hoverFill: '#B91C1C',
      tailwindClass: 'fill-red-600',
      category: 'Major Rewrites (56% – 75%)',
    };
  }

  return {
    fill: '#7F1D1D',
    hoverFill: '#5E1414',
    tailwindClass: 'fill-red-900',
    category: 'Extreme Churn / Substitutions (76%+)',
  };
}

export function formatCompactNumber(num: number): string {
  if (isNaN(num) || num === 0) return '0';
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs}`;
}
