// Comprehensive Token-Efficient Data Integrity Validator
// Validates 100% of internal datasets, math integrity, schema validity, state procurement profiles, and analytics engines.

import { STATE_CREEP_DATA } from '../src/services/stateCreepData.ts';
import { STATE_BILL_VOLATILITY_DATA } from '../src/services/stateBillData.ts';
import { UNIFIED_POLITICIANS_DIRECTORY, calculatePoliticianMetrics } from '../src/services/politicianService.ts';
import { STATE_PROCUREMENT_PROFILES, computeContractAnalytics } from '../src/services/contractAnalyticsService.ts';

const ANSI_GREEN = '\x1b[32m';
const ANSI_RED = '\x1b[31m';
const ANSI_BOLD = '\x1b[1m';
const ANSI_RESET = '\x1b[0m';

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failures = [];

function assert(condition, message, details = {}) {
  totalChecks++;
  if (condition) {
    passedChecks++;
  } else {
    failedChecks++;
    failures.push({ message, details });
  }
}

console.log(`${ANSI_BOLD}================================================================================${ANSI_RESET}`);
console.log(`${ANSI_BOLD}            LOUDER THAN WORDS - COMPREHENSIVE DATA INTEGRITY AUDIT              ${ANSI_RESET}`);
console.log(`${ANSI_BOLD}================================================================================${ANSI_RESET}\n`);

// -----------------------------------------------------------------------------
// 1. Audit STATE_CREEP_DATA (52 Jurisdictions)
// -----------------------------------------------------------------------------
console.log(`📌 Auditing State Contract Creep Dataset (${Object.keys(STATE_CREEP_DATA).length} jurisdictions)...`);

for (const [fips, state] of Object.entries(STATE_CREEP_DATA)) {
  assert(state.fips === fips, `FIPS key mismatch for ${state.stateCode}`, { fips, stateFips: state.fips });
  assert(/^[0-9]{2}$/.test(fips), `Invalid FIPS format: ${fips}`, { fips });
  assert(state.initialObligation > 0, `Initial obligation must be positive for ${state.stateCode}`, { state });
  assert(state.currentObligation >= state.initialObligation, `Current obligation must be >= initial for ${state.stateCode}`, { state });
  
  const expectedDollarCreep = state.currentObligation - state.initialObligation;
  assert(state.dollarCreep === expectedDollarCreep, `Dollar creep math mismatch for ${state.stateCode}`, {
    expected: expectedDollarCreep,
    actual: state.dollarCreep,
  });

  const calculatedPercentCreep = ((state.currentObligation - state.initialObligation) / state.initialObligation) * 100;
  const percentDiff = Math.abs(calculatedPercentCreep - state.percentCreep);
  assert(percentDiff < 0.2, `Percent creep calculation mismatch for ${state.stateCode}`, {
    calculated: calculatedPercentCreep.toFixed(2),
    recorded: state.percentCreep,
  });

  assert(state.activeContractsCount > 0, `Active contracts count should be > 0 for ${state.stateCode}`, { state });
}

// -----------------------------------------------------------------------------
// 2. Audit STATE_BILL_VOLATILITY_DATA (52 Jurisdictions)
// -----------------------------------------------------------------------------
console.log(`📌 Auditing State Bill Text Volatility Dataset (${Object.keys(STATE_BILL_VOLATILITY_DATA).length} jurisdictions)...`);

for (const [fips, bill] of Object.entries(STATE_BILL_VOLATILITY_DATA)) {
  assert(bill.fips === fips, `FIPS key mismatch in bill volatility for ${bill.stateCode}`, { fips });
  assert(bill.averageVolatilityScore >= 0 && bill.averageVolatilityScore <= 100, `Volatility score out of bounds (0-100) for ${bill.stateCode}`, { bill });
  assert(bill.enactedBillsCount <= bill.totalBillsSponsored, `Enacted bills > total bills for ${bill.stateCode}`, { bill });
  assert(bill.totalWordsAdded > 0, `Words added should be positive for ${bill.stateCode}`, { bill });
  assert(bill.totalWordsDeleted > 0, `Words deleted should be positive for ${bill.stateCode}`, { bill });
  assert(bill.primaryPolicyFocus.length > 3, `Missing policy focus for ${bill.stateCode}`, { bill });
}

// -----------------------------------------------------------------------------
// 3. Audit UNIFIED_POLITICIANS_DIRECTORY & Contract Links
// -----------------------------------------------------------------------------
console.log(`📌 Auditing Politician Directory (${UNIFIED_POLITICIANS_DIRECTORY.length} profiles)...`);

const seenPoliticianIds = new Set();
let totalLinkedContracts = 0;

for (const p of UNIFIED_POLITICIANS_DIRECTORY) {
  assert(!seenPoliticianIds.has(p.id), `Duplicate politician ID: ${p.id}`, { id: p.id, name: p.name });
  seenPoliticianIds.add(p.id);

  assert(p.name && p.name.length > 2, `Invalid politician name`, { p });
  assert(['Democrat', 'Republican', 'Independent', 'Nonpartisan'].includes(p.party), `Invalid party: ${p.party} for ${p.name}`, { p });
  assert(p.stateCode && p.stateCode.length === 2, `Invalid stateCode: ${p.stateCode} for ${p.name}`, { p });
  assert(p.photoUrl && p.photoUrl.startsWith('http'), `Invalid photoUrl for ${p.name}`, { photoUrl: p.photoUrl });
  assert(p.linkedContracts && p.linkedContracts.length > 0, `Politician ${p.name} has no linked contracts`, { p });

  // Validate deterministic metrics calculation
  const metrics = calculatePoliticianMetrics(p.linkedContracts);
  assert(metrics.linkedContractsCount === p.linkedContracts.length, `Metrics link count mismatch for ${p.name}`);
  assert(metrics.totalDollarCreep === (metrics.totalCurrentObligation - metrics.totalInitialObligation), `Metrics dollar creep mismatch for ${p.name}`);

  for (const link of p.linkedContracts) {
    totalLinkedContracts++;
    assert(link.contractAwardId && link.contractAwardId.length > 4, `Invalid contractAwardId for ${p.name}`, { link });
    assert(link.piid && link.piid.length > 3, `Invalid PIID for ${p.name}`, { link });
    assert(link.recipientName && link.recipientName.length > 2, `Invalid recipientName for ${p.name}`, { link });
    assert(link.currentObligation >= link.initialObligation, `Current obligation < initial obligation for ${link.piid} on ${p.name}`, { link });

    const expectedDiff = link.currentObligation - link.initialObligation;
    assert(link.dollarCreep === expectedDiff, `Contract link dollar creep mismatch on ${link.piid}`, {
      expected: expectedDiff,
      actual: link.dollarCreep,
    });

    const calculatedPercent = ((link.currentObligation - link.initialObligation) / link.initialObligation) * 100;
    const pDiff = Math.abs(calculatedPercent - link.percentCreep);
    assert(pDiff < 0.2, `Contract link percent creep mismatch on ${link.piid}`, {
      calculated: calculatedPercent.toFixed(2),
      recorded: link.percentCreep,
    });

    assert(link.confidenceScore >= 0 && link.confidenceScore <= 1.0, `Confidence score out of bounds for ${link.piid}`, { link });
  }
}

// -----------------------------------------------------------------------------
// 4. Audit STATE_PROCUREMENT_PROFILES (State-Specific Contractor & Industry Maps)
// -----------------------------------------------------------------------------
console.log(`📌 Auditing State Procurement Profiles (${Object.keys(STATE_PROCUREMENT_PROFILES).length} explicit state mappings)...`);

for (const [stateCode, profile] of Object.entries(STATE_PROCUREMENT_PROFILES)) {
  assert(stateCode.length === 2, `Invalid stateCode key: ${stateCode}`);
  assert(profile.topContractors && profile.topContractors.length >= 5, `State ${stateCode} must have >= 5 top contractors`, { profile });

  const totalShare = profile.topContractors.reduce((sum, c) => sum + c.share, 0);
  assert(totalShare >= 0.85 && totalShare <= 1.15, `Contractor shares for ${stateCode} should sum to ~100% (got ${(totalShare * 100).toFixed(1)}%)`, { totalShare });

  for (const c of profile.topContractors) {
    assert(c.name && c.name.length > 3, `Invalid contractor name for ${stateCode}`, { c });
    assert(c.share > 0, `Contractor share must be positive for ${c.name}`, { c });
    assert(c.mult >= 0.5 && c.mult <= 2.5, `Contractor creep multiplier out of bounds for ${c.name}`, { c });
    assert(['defense', 'transit', 'tech', 'healthcare', 'consulting', 'energy'].includes(c.sector), `Invalid sector: ${c.sector} for ${c.name}`);
  }

  const industrySum = Object.values(profile.dominantIndustries).reduce((sum, v) => sum + v, 0);
  assert(Math.abs(industrySum - 1.0) < 0.05, `Dominant industries for ${stateCode} must sum to 1.0 (got ${industrySum})`, { industrySum });
}

// -----------------------------------------------------------------------------
// 5. Audit computeContractAnalytics Across All 52 US Jurisdictions
// -----------------------------------------------------------------------------
console.log(`📌 Auditing Dynamic Analytics Engine Across All 52 US Jurisdictions...`);

for (const [fips, state] of Object.entries(STATE_CREEP_DATA)) {
  const geoProps = {
    level: 'state',
    stateCode: state.stateCode,
    stateName: state.stateName,
  };

  // Test 1: Static profile evaluation
  const staticAnalytics = computeContractAnalytics(geoProps);
  assert(staticAnalytics.totalInitial === state.initialObligation, `Initial obligation mismatch for ${state.stateCode}`, { staticAnalytics, state });
  assert(staticAnalytics.totalDollarCreep === state.dollarCreep, `Dollar creep mismatch for ${state.stateCode}`, { staticAnalytics, state });
  assert(staticAnalytics.topContractorsPareto.length >= 5, `Pareto contractors missing for ${state.stateCode}`);
  assert(staticAnalytics.industries.length === 6, `Industry sectors count mismatch for ${state.stateCode}`);
  assert(staticAnalytics.agencies.length >= 4, `Agencies count mismatch for ${state.stateCode}`);

  // Test 2: Live awards dynamic ingestion
  const simulatedLiveAwards = [
    {
      'Award ID': 'TEST-AWD-01',
      'Recipient Name': `${state.stateName.toUpperCase()} SHIPBUILDING & DEFENSE`,
      'Award Amount': 500000000,
      'Start Date': '2022-01-01',
      Description: 'Naval Ship Tactical Systems and Modernization',
      generated_internal_id: 'CONT_TEST_01',
    },
    {
      'Award ID': 'TEST-AWD-02',
      'Recipient Name': `${state.stateName.toUpperCase()} TRANSIT CORRIDOR BUILDERS`,
      'Award Amount': 350000000,
      'Start Date': '2022-06-01',
      Description: 'Interstate Highway and Transit Reconstruction',
      generated_internal_id: 'CONT_TEST_02',
    },
  ];

  const liveAnalytics = computeContractAnalytics(geoProps, simulatedLiveAwards);
  assert(liveAnalytics.topContractorsPareto[0].contractorName === `${state.stateName.toUpperCase()} SHIPBUILDING & DEFENSE`, `Live award recipient rank 1 mismatch for ${state.stateCode}`);
  assert(liveAnalytics.topContractorsPareto[1].contractorName === `${state.stateName.toUpperCase()} TRANSIT CORRIDOR BUILDERS`, `Live award recipient rank 2 mismatch for ${state.stateCode}`);
  assert(liveAnalytics.topContractorsPareto[0].dollarCreep > 0, `Live award dollar creep should be positive`);
}

// -----------------------------------------------------------------------------
// 6. Audit Smart Civic Cache Key Collision & State Data Isolation
// -----------------------------------------------------------------------------
console.log(`📌 Auditing Civic Cache Key Isolation Across All 52 States...`);
import { civicCache } from '../src/services/civicCacheService.ts';

const generatedKeys = new Set();
const statePayloads = [];

for (const [fips, state] of Object.entries(STATE_CREEP_DATA)) {
  const contractsPayload = {
    filters: {
      award_type_codes: ['D', 'C', 'A', 'B'],
      place_of_performance_locations: [
        {
          country: 'USA',
          state: state.stateCode,
        },
      ],
      time_period: [{ start_date: '2019-10-01', end_date: '2024-09-30' }],
    },
    fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Start Date'],
    limit: 15,
    sort: 'Award Amount',
    order: 'desc',
  };

  const idvsPayload = {
    filters: {
      award_type_codes: ['IDV_A', 'IDV_B', 'IDV_C'],
      place_of_performance_locations: [
        {
          country: 'USA',
          state: state.stateCode,
        },
      ],
      time_period: [{ start_date: '2019-10-01', end_date: '2024-09-30' }],
    },
    fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Start Date'],
    limit: 15,
    sort: 'Award Amount',
    order: 'desc',
  };

  const contractKey = civicCache.hashKey('post:https://api.usaspending.gov/api/v2/search/spending_by_award/', contractsPayload);
  const idvKey = civicCache.hashKey('post:https://api.usaspending.gov/api/v2/search/spending_by_award/', idvsPayload);

  assert(!generatedKeys.has(contractKey), `Cache key collision detected for contracts in ${state.stateCode}`, { contractKey });
  generatedKeys.add(contractKey);

  assert(!generatedKeys.has(idvKey), `Cache key collision detected for IDVs in ${state.stateCode}`, { idvKey });
  generatedKeys.add(idvKey);

  // Store payload for cross-state cache isolation test
  statePayloads.push({ stateCode: state.stateCode, contractKey, idvKey });
}

// Verify cross-state cache retrieval isolation in memory
civicCache.clear();
for (const item of statePayloads) {
  civicCache.set(item.contractKey, { state: item.stateCode, mockResult: `DATA_${item.stateCode}` });
}

for (const item of statePayloads) {
  const retrieved = civicCache.get(item.contractKey);
  assert(retrieved !== null, `Failed to retrieve cached payload for ${item.stateCode}`);
  assert(retrieved.state === item.stateCode, `Cache state mismatch: expected ${item.stateCode}, got ${retrieved?.state}`);
}
civicCache.clear();

// -----------------------------------------------------------------------------
// Print Summary
// -----------------------------------------------------------------------------
console.log(`\n${ANSI_BOLD}--------------------------------------------------------------------------------${ANSI_RESET}`);
console.log(`Total Data Points & Integrity Assertions Checked: ${ANSI_BOLD}${totalChecks}${ANSI_RESET}`);
console.log(`Passed: ${ANSI_GREEN}${passedChecks}${ANSI_RESET} | Failed: ${failedChecks > 0 ? ANSI_RED : ANSI_GREEN}${failedChecks}${ANSI_RESET}`);
console.log(`Total Linked Contracts Audited: ${ANSI_BOLD}${totalLinkedContracts}${ANSI_RESET}`);
console.log(`${ANSI_BOLD}--------------------------------------------------------------------------------${ANSI_RESET}\n`);

if (failedChecks > 0) {
  console.error(`${ANSI_RED}❌ AUDIT FAILED with ${failedChecks} errors:${ANSI_RESET}`);
  for (const f of failures) {
    console.error(` - ${f.message}`, JSON.stringify(f.details));
  }
  process.exit(1);
} else {
  console.log(`${ANSI_GREEN}✅ ALL DATASETS, STATE PROFILES, AND ANALYTICS AGGREGATORS ARE 100% VALID!${ANSI_RESET}\n`);
  process.exit(0);
}
