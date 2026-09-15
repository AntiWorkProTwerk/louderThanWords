// Contract Creep Visual Analytics & Graph Data Service
// Calculates multi-dimensional breakdowns: Industry Sectors, Politician Distributions, Agency Shares, Pareto Concentration, and Earmark Volatility
import { STATE_CREEP_DATA } from './stateCreepData';
import { getStateFipsFromCode, US_STATES_FIPS } from './vectorMapService';
import { queryPoliticians, PoliticianWithMetrics } from './politicianService';
import { JurisdictionGeoProps } from '../components/ContractCreepPanel';

export interface IndustrySectorStats {
  id: string;
  name: string;
  shortName: string;
  initialObligation: number;
  currentObligation: number;
  dollarCreep: number;
  percentCreep: number;
  contractCount: number;
  color: string;
  tailwindBg: string;
  tailwindText: string;
  topRecipient: string;
  description: string;
}

export interface AgencyCreepShare {
  id: string;
  agencyName: string;
  abbreviation: string;
  dollarCreep: number;
  percentOfTotalCreep: number;
  initialObligation: number;
  currentObligation: number;
  percentCreep: number;
  color: string;
}

export interface PoliticianIndustryShare {
  industryName: string;
  shortName: string;
  percentShare: number;
  amount: number;
  color: string;
}

export interface PoliticianIndustryProfile {
  politicianId: string;
  name: string;
  party: 'Democrat' | 'Republican' | 'Independent';
  title: string;
  stateCode: string;
  district?: string;
  photoUrl: string;
  totalDollarCreep: number;
  aggregatePercentCreep: number;
  industries: PoliticianIndustryShare[];
}

export interface ContractorParetoItem {
  rank: number;
  contractorName: string;
  initialObligation: number;
  currentObligation: number;
  dollarCreep: number;
  percentCreep: number;
  shareOfCreep: number;
  cumulativeShare: number;
}

export interface EarmarkVsCompetitiveStats {
  earmarkAvgCreepPct: number;
  competitiveAvgCreepPct: number;
  earmarkInitialTotal: number;
  earmarkCurrentTotal: number;
  earmarkDollarCreep: number;
  competitiveInitialTotal: number;
  competitiveCurrentTotal: number;
  competitiveDollarCreep: number;
  earmarkContractCount: number;
  competitiveContractCount: number;
}

export interface ModificationStepPoint {
  stage: string;
  modNumber: number;
  avgObligation: number;
  avgDollarCreep: number;
  pctIncrease: number;
}

export interface FullJurisdictionAnalytics {
  jurisdictionTitle: string;
  totalInitial: number;
  totalCurrent: number;
  totalDollarCreep: number;
  aggregatePercentCreep: number;
  activeContractsCount: number;
  industries: IndustrySectorStats[];
  agencies: AgencyCreepShare[];
  politicians: PoliticianIndustryProfile[];
  topContractorsPareto: ContractorParetoItem[];
  earmarkComparison: EarmarkVsCompetitiveStats;
  modificationVelocity: ModificationStepPoint[];
}

// Canonical Industry Color Map matching Editorial Palette
export const INDUSTRY_SECTOR_COLORS: Record<string, { color: string; tailwindBg: string; tailwindText: string }> = {
  defense: { color: '#dc2626', tailwindBg: 'bg-red-500', tailwindText: 'text-red-700' },
  transit: { color: '#ea580c', tailwindBg: 'bg-orange-500', tailwindText: 'text-orange-700' },
  tech: { color: '#2563eb', tailwindBg: 'bg-blue-600', tailwindText: 'text-blue-700' },
  healthcare: { color: '#059669', tailwindBg: 'bg-emerald-600', tailwindText: 'text-emerald-700' },
  consulting: { color: '#7c3aed', tailwindBg: 'bg-purple-600', tailwindText: 'text-purple-700' },
  energy: { color: '#d97706', tailwindBg: 'bg-amber-600', tailwindText: 'text-amber-700' },
};

// Compute Full Contract Analytics for any Geo Jurisdiction
export function computeContractAnalytics(geoProps: JurisdictionGeoProps): FullJurisdictionAnalytics {
  const { level, stateCode, stateName, countyName, city, districtNumber, countyFips } = geoProps;

  // 1. Resolve State Procurement Baseline Anchor
  const isNational = level === 'federal' || stateCode === 'US' || !stateCode;
  const fips = !isNational ? getStateFipsFromCode(stateCode) || '17' : '17';
  const stateMeta = !isNational ? US_STATES_FIPS[fips] : null;
  const stateCreep = !isNational && STATE_CREEP_DATA[fips]
    ? STATE_CREEP_DATA[fips]
    : {
        initialObligation: 285000000000,
        currentObligation: 421800000000,
        dollarCreep: 136800000000,
        percentCreep: 48.0,
        activeContractsCount: 142800,
      };

  // Geographic Title
  const jurisdictionTitle = isNational
    ? 'United States (Federal Procurement)'
    : city
    ? `${city}, ${stateCode}`
    : countyName
    ? `${countyName}, ${stateCode}`
    : `${stateName || stateMeta?.name || stateCode} (Statewide)`;

  // Scale totals based on jurisdiction tier
  let scaleFactor = 1.0;
  if (level === 'local') scaleFactor = 0.04;
  else if (level === 'county') scaleFactor = 0.18;
  else if (level === 'state') scaleFactor = 1.0;
  else scaleFactor = 1.0; // National

  const totalInitial = Math.round(stateCreep.initialObligation * scaleFactor);
  const totalDollarCreep = Math.round(stateCreep.dollarCreep * scaleFactor);
  const totalCurrent = totalInitial + totalDollarCreep;
  const aggregatePercentCreep = totalInitial > 0 ? (totalDollarCreep / totalInitial) * 100 : 48.0;
  const activeContractsCount = Math.round(stateCreep.activeContractsCount * scaleFactor);

  // 2. Industry Sector Breakdown Calculation
  const industryWeights = [
    {
      id: 'defense',
      name: 'Defense & Aerospace Systems',
      shortName: 'Defense',
      share: 0.38,
      creepMultiplier: 1.25,
      topRecipient: 'Lockheed Martin / Boeing Co.',
      description: 'Tactical aircraft, missile defense, naval ship construction, and weapon systems.',
    },
    {
      id: 'transit',
      name: 'Transportation & Civil Infrastructure',
      shortName: 'Transit',
      share: 0.22,
      creepMultiplier: 1.15,
      topRecipient: 'Walsh Construction / Bechtel',
      description: 'Highway corridors, interstate bridges, rail transit tunnels, and port deepening.',
    },
    {
      id: 'tech',
      name: 'IT, Cloud & Secure Cyber Systems',
      shortName: 'IT & Cloud',
      share: 0.16,
      creepMultiplier: 0.95,
      topRecipient: 'General Dynamics IT / Leidos',
      description: 'Federal cloud migration, intelligence network security, and database modernization.',
    },
    {
      id: 'healthcare',
      name: 'Healthcare, Biomedical & Life Sciences',
      shortName: 'Healthcare',
      share: 0.11,
      creepMultiplier: 0.85,
      topRecipient: 'Pfizer / Cerner Health / NIH Centers',
      description: 'Clinical trials, medical supply logistics, VA health records, and genomic research.',
    },
    {
      id: 'consulting',
      name: 'Management Consulting & Defense Support',
      shortName: 'Consulting',
      share: 0.08,
      creepMultiplier: 1.05,
      topRecipient: 'Deloitte / Booz Allen Hamilton',
      description: 'Program management, audit readiness, strategy evaluation, and administrative support.',
    },
    {
      id: 'energy',
      name: 'Energy, Clean Tech & Environmental Cleanup',
      shortName: 'Energy & Env',
      share: 0.05,
      creepMultiplier: 0.75,
      topRecipient: 'Fluor Corp / Tetra Tech',
      description: 'Nuclear site environmental remediation, grid modernization, and dam restoration.',
    },
  ];

  const industries: IndustrySectorStats[] = industryWeights.map((w) => {
    const indInit = Math.round(totalInitial * w.share);
    const indCreepPct = Math.round(aggregatePercentCreep * w.creepMultiplier);
    const indDollarCreep = Math.round((indInit * indCreepPct) / 100);
    const indCurrent = indInit + indDollarCreep;
    const colors = INDUSTRY_SECTOR_COLORS[w.id] || INDUSTRY_SECTOR_COLORS.defense;

    return {
      id: w.id,
      name: w.name,
      shortName: w.shortName,
      initialObligation: indInit,
      currentObligation: indCurrent,
      dollarCreep: indDollarCreep,
      percentCreep: indCreepPct,
      contractCount: Math.round(activeContractsCount * w.share),
      color: colors.color,
      tailwindBg: colors.tailwindBg,
      tailwindText: colors.tailwindText,
      topRecipient: w.topRecipient,
      description: w.description,
    };
  });

  // 3. Awarding Agency Breakdown
  const agencyWeights = [
    { id: 'dod', name: 'Department of Defense (Air Force, Navy, Army)', abbreviation: 'DoD', share: 0.54, color: '#dc2626' },
    { id: 'dot', name: 'Department of Transportation (FHWA, FTA, FRA)', abbreviation: 'DOT', share: 0.21, color: '#ea580c' },
    { id: 'hhs', name: 'Health and Human Services (NIH, CDC, CMS)', abbreviation: 'HHS', share: 0.11, color: '#059669' },
    { id: 'nasa', name: 'National Aeronautics & Space Administration', abbreviation: 'NASA', share: 0.06, color: '#2563eb' },
    { id: 'doe', name: 'Department of Energy & Nuclear Security', abbreviation: 'DOE', share: 0.05, color: '#d97706' },
    { id: 'gsa', name: 'General Services Administration (IT/BPA)', abbreviation: 'GSA', share: 0.03, color: '#7c3aed' },
  ];

  const agencies: AgencyCreepShare[] = agencyWeights.map((a) => {
    const agDollarCreep = Math.round(totalDollarCreep * a.share);
    const agInit = Math.round(totalInitial * a.share);
    const agCurrent = agInit + agDollarCreep;
    const agCreepPct = agInit > 0 ? (agDollarCreep / agInit) * 100 : 0;

    return {
      id: a.id,
      agencyName: a.name,
      abbreviation: a.abbreviation,
      dollarCreep: agDollarCreep,
      percentOfTotalCreep: Math.round(a.share * 100),
      initialObligation: agInit,
      currentObligation: agCurrent,
      percentCreep: agCreepPct,
      color: a.color,
    };
  });

  // 4. Politician <-> Industry Matrix
  const politiciansData = queryPoliticians(stateCode, countyFips, countyName, city, districtNumber);
  const politicians: PoliticianIndustryProfile[] = politiciansData.map((p, idx) => {
    // Determine realistic industry split based on politician's committees
    const isDefenseChair = p.committees.some((c) => /Armed|Defense|Intelligence/i.test(c));
    const isTransitChair = p.committees.some((c) => /Transportation|Infrastructure|Public Works/i.test(c));
    const isHealthChair = p.committees.some((c) => /Health|Labor|Family|Ways/i.test(c));

    let defensePct = isDefenseChair ? 65 : 35;
    let transitPct = isTransitChair ? 50 : 25;
    let healthPct = isHealthChair ? 40 : 15;
    let techPct = 15;
    let consultingPct = 10;

    const totalWeight = defensePct + transitPct + healthPct + techPct + consultingPct;
    defensePct = Math.round((defensePct / totalWeight) * 100);
    transitPct = Math.round((transitPct / totalWeight) * 100);
    healthPct = Math.round((healthPct / totalWeight) * 100);
    techPct = Math.round((techPct / totalWeight) * 100);
    consultingPct = 100 - (defensePct + transitPct + healthPct + techPct);

    const polCreep = p.metrics.totalDollarCreep;

    return {
      politicianId: p.id,
      name: p.name,
      party: p.party as any,
      title: p.title,
      stateCode: p.stateCode,
      district: p.district,
      photoUrl: p.photoUrl,
      totalDollarCreep: polCreep,
      aggregatePercentCreep: p.metrics.aggregatePercentCreep,
      industries: [
        {
          industryName: 'Defense & Aerospace',
          shortName: 'Defense',
          percentShare: defensePct,
          amount: Math.round((polCreep * defensePct) / 100),
          color: INDUSTRY_SECTOR_COLORS.defense.color,
        },
        {
          industryName: 'Transit & Infrastructure',
          shortName: 'Transit',
          percentShare: transitPct,
          amount: Math.round((polCreep * transitPct) / 100),
          color: INDUSTRY_SECTOR_COLORS.transit.color,
        },
        {
          industryName: 'IT & Cloud Systems',
          shortName: 'IT & Cloud',
          percentShare: techPct,
          amount: Math.round((polCreep * techPct) / 100),
          color: INDUSTRY_SECTOR_COLORS.tech.color,
        },
        {
          industryName: 'Healthcare & Life Sciences',
          shortName: 'Healthcare',
          percentShare: healthPct,
          amount: Math.round((polCreep * healthPct) / 100),
          color: INDUSTRY_SECTOR_COLORS.healthcare.color,
        },
        {
          industryName: 'Management Consulting',
          shortName: 'Consulting',
          percentShare: consultingPct,
          amount: Math.round((polCreep * consultingPct) / 100),
          color: INDUSTRY_SECTOR_COLORS.consulting.color,
        },
      ],
    };
  });

  // 5. Contractor Concentration (Pareto 80/20 Distribution)
  const primeContractorTemplates = [
    { name: 'Lockheed Martin Corporation', share: 0.28, mult: 1.4 },
    { name: 'Boeing Defense & Space', share: 0.19, mult: 1.3 },
    { name: 'General Dynamics Information Tech', share: 0.13, mult: 1.15 },
    { name: 'Walsh / Bechtel Construction JV', share: 0.09, mult: 1.2 },
    { name: 'Huntington Ingalls Shipbuilding', share: 0.07, mult: 1.35 },
    { name: 'Deloitte Consulting LLP', share: 0.05, mult: 1.05 },
    { name: 'Leidos Inc.', share: 0.04, mult: 0.95 },
    { name: 'Raytheon Technologies (RTX)', share: 0.04, mult: 1.1 },
    { name: 'Fluor Enterprises Inc.', share: 0.03, mult: 0.85 },
    { name: 'Kiewit Infrastructure Co.', share: 0.02, mult: 1.1 },
  ];

  let cumulative = 0;
  const topContractorsPareto: ContractorParetoItem[] = primeContractorTemplates.map((t, idx) => {
    const contractorInit = Math.round(totalInitial * t.share);
    const contractorCreepPct = Math.round(aggregatePercentCreep * t.mult);
    const contractorDollarCreep = Math.round((contractorInit * contractorCreepPct) / 100);
    const contractorCurrent = contractorInit + contractorDollarCreep;
    const shareOfCreep = Math.round((contractorDollarCreep / (totalDollarCreep || 1)) * 100);
    cumulative += shareOfCreep;

    return {
      rank: idx + 1,
      contractorName: t.name,
      initialObligation: contractorInit,
      currentObligation: contractorCurrent,
      dollarCreep: contractorDollarCreep,
      percentCreep: contractorCreepPct,
      shareOfCreep,
      cumulativeShare: Math.min(100, cumulative),
    };
  });

  // 6. Earmarks (CPF) vs. Open Competition Comparison
  const earmarkInitialTotal = Math.round(totalInitial * 0.18);
  const earmarkAvgCreepPct = Math.round(aggregatePercentCreep * 1.35); // Earmarks have higher cost growth (+65%)
  const earmarkDollarCreep = Math.round((earmarkInitialTotal * earmarkAvgCreepPct) / 100);
  const earmarkCurrentTotal = earmarkInitialTotal + earmarkDollarCreep;

  const competitiveInitialTotal = totalInitial - earmarkInitialTotal;
  const competitiveAvgCreepPct = Math.round(aggregatePercentCreep * 0.85); // Open competitive awards (+38%)
  const competitiveDollarCreep = Math.round((competitiveInitialTotal * competitiveAvgCreepPct) / 100);
  const competitiveCurrentTotal = competitiveInitialTotal + competitiveDollarCreep;

  const earmarkComparison: EarmarkVsCompetitiveStats = {
    earmarkAvgCreepPct,
    competitiveAvgCreepPct,
    earmarkInitialTotal,
    earmarkCurrentTotal,
    earmarkDollarCreep,
    competitiveInitialTotal,
    competitiveCurrentTotal,
    competitiveDollarCreep,
    earmarkContractCount: Math.round(activeContractsCount * 0.22),
    competitiveContractCount: Math.round(activeContractsCount * 0.78),
  };

  // 7. Modification Velocity Timeline Curve
  const modificationVelocity: ModificationStepPoint[] = [
    {
      stage: 'Base Award (Signed)',
      modNumber: 0,
      avgObligation: totalInitial,
      avgDollarCreep: 0,
      pctIncrease: 0,
    },
    {
      stage: 'Mod #01: Option Year 1 Exercise',
      modNumber: 1,
      avgObligation: Math.round(totalInitial * 1.08),
      avgDollarCreep: Math.round(totalInitial * 0.08),
      pctIncrease: 8,
    },
    {
      stage: 'Mod #04: Scope Expansion & SOW Additions',
      modNumber: 4,
      avgObligation: Math.round(totalInitial * 1.24),
      avgDollarCreep: Math.round(totalInitial * 0.24),
      pctIncrease: 24,
    },
    {
      stage: 'Mod #08: Price Escalation & Supply Chain Adjustments',
      modNumber: 8,
      avgObligation: Math.round(totalInitial * 1.38),
      avgDollarCreep: Math.round(totalInitial * 0.38),
      pctIncrease: 38,
    },
    {
      stage: 'Mod #12: Final Ceiling Expansion & Closeout',
      modNumber: 12,
      avgObligation: totalCurrent,
      avgDollarCreep: totalDollarCreep,
      pctIncrease: Math.round(aggregatePercentCreep),
    },
  ];

  return {
    jurisdictionTitle,
    totalInitial,
    totalCurrent,
    totalDollarCreep,
    aggregatePercentCreep,
    activeContractsCount,
    industries,
    agencies,
    politicians,
    topContractorsPareto,
    earmarkComparison,
    modificationVelocity,
  };
}
