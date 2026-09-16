/**
 * Civic Intelligence Forensic Procurement Ingestion Engine v2.0
 * Ingests USAspending records, reconstructs Mod #0 baselines, calculates forensic creep,
 * classifies industry sectors & competition, links state budget benchmarks, and populates D1 & R2.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USASPENDING_API = 'https://api.usaspending.gov/api/v2';
const TIME_PERIOD = [{ start_date: '2020-10-01', end_date: '2026-09-30' }];
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CivicEdgeProcurement/2.0';

// Helper: Sleep to respect rate limits
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Robust fetch with retry and custom User-Agent
export async function fetchWithRetry(url, options = {}, retries = 2, timeoutMs = 25000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
          ...(options.headers || {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(1000 * (attempt + 1));
    }
  }
}

// Helper: Format SQL strings safely
function sqlEscape(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return isNaN(val) ? '0' : String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

// Load Counties Database
const countiesDataPath = path.join(__dirname, 'data', 'counties_by_state.json');
let countiesByState = {};
if (fs.existsSync(countiesDataPath)) {
  try {
    countiesByState = JSON.parse(fs.readFileSync(countiesDataPath, 'utf8'));
  } catch (e) {}
}

export function getCountiesForState(stateCode) {
  return countiesByState[stateCode?.toUpperCase()] || [];
}

export function resolveCounty(stateCode, rawCountyStr) {
  if (!rawCountyStr || !stateCode) return null;
  const list = getCountiesForState(stateCode);
  const clean = String(rawCountyStr).toLowerCase().replace(/ (county|parish|borough|census area|city)$/i, '').replace(/[\.\,]/g, '').trim();
  return list.find((c) => {
    const cClean = c.rawName.toLowerCase().replace(/ (county|parish|borough|census area|city)$/i, '').replace(/[\.\,]/g, '').trim();
    return cClean === clean;
  }) || null;
}

// Derive Federal Fiscal Year from date (e.g. 2021-10-15 -> FY2022)
export function getFiscalYear(dateStr) {
  if (!dateStr) return 2022;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 2022;
  const month = d.getUTCMonth() + 1; // 1-12
  const year = d.getUTCFullYear();
  return month >= 10 ? year + 1 : year;
}

// Standardize Industry Sector Taxonomy
export function classifyIndustrySector(award) {
  const text = `${award['Awarding Agency'] || ''} ${award['Awarding Sub Agency'] || ''} ${award.Description || ''} ${award['Recipient Name'] || ''}`.toUpperCase();
  
  if (text.includes('DEFENSE') || text.includes('AIR FORCE') || text.includes('ARMY') || text.includes('NAVY') || text.includes('MISSILE') || text.includes('LOCKHEED') || text.includes('BOEING') || text.includes('NORTHROP') || text.includes('RAYTHEON') || text.includes('SPACE FORCE') || text.includes('ORION')) {
    return 'DEFENSE & WEAPONS';
  }
  if (text.includes('ENERGY') || text.includes('NREL') || text.includes('RENEWABLE') || text.includes('NUCLEAR') || text.includes('LABORATORY') || text.includes('OAK RIDGE') || text.includes('ARGONNE')) {
    return 'ENERGY & R&D';
  }
  if (text.includes('HEALTH') || text.includes('PHARMA') || text.includes('NIH') || text.includes('CDC') || text.includes('FDA') || text.includes('VETERANS') || text.includes('MEDICAL') || text.includes('HOSPITAL')) {
    return 'HEALTHCARE & PHARMA';
  }
  if (text.includes('SOFTWARE') || text.includes('CLOUD') || text.includes('CYBER') || text.includes('DATABASE') || text.includes('IT ') || text.includes('TECHNOLOGY') || text.includes('SYSTEMS DEVELOPMENT')) {
    return 'IT & CLOUD SYSTEMS';
  }
  if (text.includes('CONSTRUCTION') || text.includes('CORPS OF ENGINEERS') || text.includes('FACILITIES') || text.includes('ENVIRONMENTAL') || text.includes('INFRASTRUCTURE') || text.includes('BECHTEL')) {
    return 'INFRASTRUCTURE & CONSTRUCTION';
  }
  return 'LOGISTICS & SUPPORT';
}

// Standardize Competition Type
export function classifyCompetition(award) {
  const desc = (award.Description || '').toUpperCase();
  const pricing = (award.type_of_contract_pricing || award['Contract Award Type'] || '').toUpperCase();
  
  if (desc.includes('SOLE SOURCE') || desc.includes('NO-BID') || desc.includes('NON-COMPETITIVE') || desc.includes('JUSTIFICATION AND APPROVAL') || desc.includes('J&A')) {
    return 'SOLE SOURCE / NO BID';
  }
  if (desc.includes('FOLLOW-ON') || desc.includes('FOLLOW ON') || desc.includes('BRIDGE CONTRACT')) {
    return 'FOLLOW-ON';
  }
  if (pricing.includes('COST') || desc.includes('RESTRUCTURED')) {
    return 'LIMITED BID';
  }
  return 'FULL COMPETITION';
}

// Standardize Pricing Type Classification
export function classifyPricingType(award) {
  const raw = (award.type_of_contract_pricing || award.pricing_type || award.pricingType || award['Contract Award Type'] || '').toUpperCase();
  const desc = (award.Description || award.description || '').toUpperCase();
  const recipient = (award['Recipient Name'] || award.recipient_name || award.recipientName || award.parent_recipient_name || '').toUpperCase();

  // 1. Direct field match
  if (raw.includes('COST') || raw.includes('REIMBURSEMENT') || raw.includes('CPFF') || raw.includes('CPIF') || raw.includes('CPAF')) {
    return 'COST-PLUS';
  }
  if (raw.includes('TIME') || raw.includes('MATERIAL') || raw.includes('T&M') || raw.includes('LABOR HOUR')) {
    return 'TIME & MATERIALS';
  }
  if (raw.includes('FIXED') || raw.includes('FIRM') || raw.includes('FFP')) {
    return 'FIXED PRICE';
  }

  // 2. Legacy FPDS token inspection in description (e.g. !R!, !U!, !V!, !S!, !T!, !Y!, !Z!, !J!, !K!, !L!)
  // FPDS pricing codes: R=Cost Plus Award Fee, U=Cost Plus Fixed Fee, V=Cost Plus Incentive, S=Cost No Fee, T=Cost Sharing
  // Y=Time and Materials, Z=Labor Hours
  // J=Firm Fixed Price, K=Fixed Price EPA, L=Fixed Price Incentive
  if (/(?:!|\||\s)(?:R|U|V|S|T)(?:!|\||\s)/.test(desc) || desc.includes('!U!R!') || desc.includes('!R!') || desc.includes('!U!')) {
    return 'COST-PLUS';
  }
  if (/(?:!|\||\s)(?:Y|Z)(?:!|\||\s)/.test(desc) || desc.includes('!Y!') || desc.includes('!Z!') || desc.includes('T&M') || desc.includes('TIME AND MATERIAL')) {
    return 'TIME & MATERIALS';
  }

  // 3. Keywords in description
  if (desc.includes('COST PLUS') || desc.includes('COST-PLUS') || desc.includes('COST REIMBURSE') || desc.includes('CPFF') || desc.includes('CPIF') || desc.includes('CPAF')) {
    return 'COST-PLUS';
  }
  if (desc.includes('MANAGEMENT AND OPERATION') || desc.includes('MANAGEMENT & OPERATION') || desc.includes('M&O CONTRACT') || desc.includes('NATIONAL LABORATORY') || desc.includes('ACCELERATOR LABORATORY')) {
    return 'COST-PLUS'; // DOE National Lab M&O contracts are Cost-Reimbursement / Cost-Plus Award Fee
  }
  if (desc.includes('TIME AND MATERIAL') || desc.includes('LABOR HOUR')) {
    return 'TIME & MATERIALS';
  }
  if (desc.includes('FIRM FIXED') || desc.includes('FIXED PRICE') || desc.includes('FFP')) {
    return 'FIXED PRICE';
  }

  // 4. Recipient heuristic for DOE Lab M&O LLCs
  if (recipient.includes('ARGONNE') || recipient.includes('FERMI RESEARCH') || recipient.includes('BATTELLE') || recipient.includes('LOS ALAMOS') || recipient.includes('LAWRENCE LIVERMORE') || recipient.includes('SANDIA') || recipient.includes('OAK RIDGE')) {
    return 'COST-PLUS';
  }

  return 'FIXED PRICE';
}

// Forensic baseline matching
function calculateSplitTrackCreep(award, transactions) {
  const currentObligation = Number(award['Award Amount'] ?? award.award_amount ?? 0);
  const awardCeiling = Number(award['Base and All Options Value'] ?? currentObligation);

  if (!transactions || transactions.length === 0) {
    const startDate = award['Period of Performance Start Date'] || '2020-01-01';
    const endDate = award['Period of Performance Current End Date'] || '2025-01-01';
    return {
      initialObligation: currentObligation,
      currentObligation,
      awardCeiling,
      dollarCreep: 0,
      percentCreep: 0,
      fiscalYearStarted: getFiscalYear(startDate),
      startDate,
      initialEndDate: endDate,
      currentEndDate: endDate,
      scheduleDelayDays: 0,
      sortedTransactions: [],
    };
  }

  const sorted = [...transactions].sort((a, b) => {
    const dComp = new Date(a.action_date).getTime() - new Date(b.action_date).getTime();
    if (dComp !== 0) return dComp;
    const mA = Number(a.modification_number ?? 0);
    const mB = Number(b.modification_number ?? 0);
    return isNaN(mA) || isNaN(mB) ? 0 : mA - mB;
  });

  const firstTx = sorted[0];
  const lastTx = sorted[sorted.length - 1];
  const initialObligation = Math.max(0, Number(firstTx.federal_action_obligation ?? firstTx.action_obligation ?? currentObligation));
  const dollarCreep = Math.max(0, currentObligation - initialObligation);
  const percentCreep = initialObligation > 0 ? (dollarCreep / initialObligation) * 100 : 0;

  const startDate = firstTx.action_date || award['Period of Performance Start Date'] || '2020-01-01';
  const fiscalYearStarted = getFiscalYear(startDate);

  const initialEndDate = firstTx.period_of_performance_current_end_date || award['Period of Performance Start Date'] || '2024-01-01';
  const currentEndDate = lastTx.period_of_performance_current_end_date || award['Period of Performance Current End Date'] || initialEndDate;

  let scheduleDelayDays = 0;
  try {
    const dInit = new Date(initialEndDate).getTime();
    const dCurr = new Date(currentEndDate).getTime();
    if (!isNaN(dInit) && !isNaN(dCurr) && dCurr > dInit) {
      scheduleDelayDays = Math.round((dCurr - dInit) / (1000 * 60 * 60 * 24));
    }
  } catch (e) {
    scheduleDelayDays = 0;
  }

  return {
    initialObligation,
    currentObligation,
    awardCeiling,
    dollarCreep,
    percentCreep,
    fiscalYearStarted,
    startDate,
    initialEndDate,
    currentEndDate,
    scheduleDelayDays,
    sortedTransactions: sorted,
  };
}

const CACHE_DIR = path.join(__dirname, '.cache');

// Helper: Cache read/write
function getCachePath(subfolder, filename) {
  const dir = path.join(CACHE_DIR, subfolder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const safeFilename = filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  return path.join(dir, safeFilename);
}

function readCache(subfolder, filename) {
  try {
    const p = getCachePath(subfolder, filename);
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (e) {
    // Ignore cache read errors
  }
  return null;
}

function writeCache(subfolder, filename, data) {
  try {
    const p = getCachePath(subfolder, filename);
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn(`Failed to write cache for ${subfolder}/${filename}:`, e.message);
  }
}

import { quotaGuard, LIMITS } from './quota_guard.mjs';

// Harvest Awards for a State or County
export async function harvestJurisdiction({ stateCode, countyFips, limit = 25, force = false }) {
  const cacheKey = `search_${stateCode}_${countyFips || 'STATE'}_${limit}.json`;

  let rawAwards = null;
  if (!force) {
    rawAwards = readCache('awards', cacheKey);
    if (rawAwards && rawAwards.length > 0 && rawAwards[0].recipient_location_city_name === undefined) {
      rawAwards = null; // Invalidate stale cache lacking municipal city fields
    }
  }

  if (rawAwards) {
    quotaGuard.recordCacheHit();
    console.log(`⚡ [CACHED] Using cached spending search for ${stateCode}-${countyFips || 'ALL'} (${rawAwards.length} awards)`);
  } else {
    quotaGuard.checkApiBudget();
    console.log(`📡 Querying USAspending for ${stateCode} (County: ${countyFips || 'ALL'})...`);

    const locationsFilter =
      stateCode === 'US' || stateCode === 'ALL'
        ? [{ country: 'USA' }]
        : countyFips
          ? [{ country: 'USA', state: stateCode, county: countyFips.padStart(3, '0') }]
          : [{ country: 'USA', state: stateCode }];

    const baseFields = [
      'Award ID',
      'Recipient Name',
      'Award Amount',
      'Description',
      'generated_internal_id',
      'Awarding Agency',
      'Awarding Sub Agency',
      'recipient_location_state_code',
      'recipient_location_city_name',
      'recipient_location_county_name',
      'Place of Performance City Name',
      'Place of Performance County Name',
      'Place of Performance State Code',
      'Contract Award Type',
      'Period of Performance Start Date',
      'Period of Performance Current End Date',
      'type_of_contract_pricing',
      'parent_recipient_name',
      'Place of Performance Congressional District',
    ];

    const payload = {
      filters: {
        award_type_codes: ['A', 'B', 'C', 'D'],
        place_of_performance_locations: locationsFilter,
        time_period: TIME_PERIOD,
      },
      fields: baseFields,
      limit,
      sort: 'Award Amount',
      order: 'desc',
    };

    try {
      const res = await fetchWithRetry(`${USASPENDING_API}/search/spending_by_award/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }, 2, 35000);

      if (!res.ok) {
        quotaGuard.recordApiError(res.status);
        console.warn(`⚠️ USAspending API returned ${res.status}`);
        return [];
      }

      quotaGuard.recordApiCall();
      quotaGuard.recordApiSuccess();
      const data = await res.json();
      rawAwards = data.results || [];
      writeCache('awards', cacheKey, rawAwards);
      console.log(`✅ Retrieved ${rawAwards.length} prime awards for ${stateCode}-${countyFips || 'STATE'}.`);
    } catch (err) {
      console.error(`Error harvesting ${stateCode}:`, err.message);
      return [];
    }
  }

  // Enrich top awards with transaction history
  const enrichedAwards = [];
  for (const award of rawAwards) {
    const internalId = award.generated_internal_id;
    let transactions = null;

    if (internalId) {
      const txCacheKey = `tx_${internalId}.json`;
      if (!force) {
        transactions = readCache('transactions', txCacheKey);
      }

      if (transactions) {
        quotaGuard.recordCacheHit();
      } else {
        quotaGuard.checkApiBudget();
        await sleep(LIMITS.API_MIN_DELAY_MS); // rate limiting
        try {
          const txRes = await fetchWithRetry(`${USASPENDING_API}/transactions/`, {
            method: 'POST',
            body: JSON.stringify({
              award_id: internalId,
              limit: 50,
              sort: 'action_date',
              order: 'asc',
            }),
          }, 2, 20000);
          if (txRes.ok) {
            quotaGuard.recordApiCall();
            quotaGuard.recordApiSuccess();
            const txData = await txRes.json();
            transactions = txData.results || [];
            writeCache('transactions', txCacheKey, transactions);
          } else {
            quotaGuard.recordApiError(txRes.status);
          }
        } catch (e) {
          console.warn(`Could not load tx for ${internalId}:`, e.message);
        }
      }
    }

    const stats = calculateSplitTrackCreep(award, transactions || []);
    const industrySector = classifyIndustrySector(award);
    const competitionType = classifyCompetition(award);
    const pricingType = classifyPricingType(award);

    enrichedAwards.push({
      ...award,
      ...stats,
      industrySector,
      competitionType,
      pricingType,
      transactions: transactions || [],
    });
  }

  return enrichedAwards;
}

// Generate SQL statements and time series from harvested awards
export function generateSqlBundle(jurisdictionMeta, awards) {
  let totalBaseline = 0;
  let totalCurrent = 0;
  let totalCreep = 0;
  let costPlusDollars = 0;
  let costPlusBaseline = 0;
  let costPlusCreep = 0;
  let fixedPriceDollars = 0;
  let fixedPriceBaseline = 0;
  let fixedPriceCreep = 0;
  let soleSourceDollars = 0;
  let capitalFlightDollars = 0;
  let septemberSpurtDollars = 0;
  let totalDelayDays = 0;
  let delayedContractsCount = 0;
  let zombieContractsCount = 0;

  const vendorMap = new Map();
  const sectorMap = new Map();
  const yearlyCohortMap = new Map();
  const sqlStatements = [];

  // Load State Budget & IRS Tax Benchmarks
  const benchmarkPath = path.join(__dirname, 'data', 'state_budget_benchmarks.json');
  let benchmarkData = {};
  if (fs.existsSync(benchmarkPath)) {
    benchmarkData = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
  }
  const stateBenchmarks = benchmarkData[jurisdictionMeta.stateCode]?.years || benchmarkData['US']?.years || {};
  const latestBenchmark = stateBenchmarks['2023'] || { state_operating_budget: 40200000000, federal_tax_collected: 74180000000, population: 5877610 };

  const countiesDataPath = path.join(__dirname, 'data', 'counties_by_state.json');
  let countiesByState = {};
  if (fs.existsSync(countiesDataPath)) {
    try {
      countiesByState = JSON.parse(fs.readFileSync(countiesDataPath, 'utf8'));
    } catch (e) {}
  }

  for (const award of awards) {
    const amt = award.currentObligation;
    const base = award.initialObligation;
    const creep = award.dollarCreep;
    const fy = award.fiscalYearStarted || 2022;

    const pricingType = award.pricingType || classifyPricingType(award);
    award.pricingType = pricingType;
    const isCostPlus = pricingType === 'COST-PLUS';

    totalBaseline += base;
    totalCurrent += amt;
    totalCreep += creep;

    if (isCostPlus) {
      costPlusDollars += amt;
      costPlusBaseline += base;
      costPlusCreep += creep;
    } else {
      fixedPriceDollars += amt;
      fixedPriceBaseline += base;
      fixedPriceCreep += creep;
    }

    if (award.competitionType === 'SOLE SOURCE / NO BID' || award.competitionType === 'FOLLOW-ON') {
      soleSourceDollars += amt;
    }

    const hq = (award.recipient_location_state_code || '').toUpperCase();
    if (hq && hq !== jurisdictionMeta.stateCode && jurisdictionMeta.stateCode !== 'US') {
      capitalFlightDollars += amt;
    }

    // Schedule Delay & Zombie Contract Detection
    const delayDays = award.scheduleDelayDays || 0;
    const txList = award.transactions || [];
    const isZombie = delayDays >= 365 || txList.length >= 8;
    if (delayDays > 0) {
      totalDelayDays += delayDays;
      delayedContractsCount += 1;
    }
    if (isZombie) {
      zombieContractsCount += 1;
    }
    award.isZombieContract = isZombie;

    // September "Use It or Lose It" Spurt Detection
    let awardSeptemberDollars = 0;
    for (const t of txList) {
      const dStr = t.action_date || '';
      if (dStr.includes('-09-') || dStr.endsWith('-09')) {
        const val = Number(t.federal_action_obligation ?? t.action_obligation ?? 0);
        if (val > 0) {
          awardSeptemberDollars += val;
          septemberSpurtDollars += val;
        }
      }
    }
    award.isSeptemberSpurt = awardSeptemberDollars > 0 && awardSeptemberDollars >= amt * 0.25;

    const parent = award.parent_recipient_name || award['Recipient Name'] || 'Unknown Vendor';
    vendorMap.set(parent, (vendorMap.get(parent) || 0) + amt);

    const sector = award.industrySector || 'DEFENSE & WEAPONS';
    sectorMap.set(sector, (sectorMap.get(sector) || 0) + amt);

    // Cohort aggregation
    if (!yearlyCohortMap.has(fy)) {
      yearlyCohortMap.set(fy, { count: 0, initial: 0, current: 0, creep: 0 });
    }
    const cohort = yearlyCohortMap.get(fy);
    cohort.count += 1;
    cohort.initial += base;
    cohort.current += amt;
    cohort.creep += creep;

    // Compact transactions for D1 storage
    const compactTx = (award.transactions || []).map((t) => ({
      d: t.action_date,
      m: t.modification_number,
      o: Number(t.federal_action_obligation ?? t.action_obligation ?? 0),
    }));

    const internalId = award.generated_internal_id || `AWD_${award['Award ID']}`;
    const desc = (award.Description || '').substring(0, 250);
    const congDist = award['Place of Performance Congressional District'] || null;
    const cityName =
      award['Place of Performance City Name'] ||
      award.recipient_location_city_name ||
      award.city_name ||
      award.recipient_city_name ||
      null;

    let awardCountyFips = jurisdictionMeta.countyFips || award.county_fips || null;
    if (!awardCountyFips && jurisdictionMeta.stateCode && jurisdictionMeta.stateCode !== 'US') {
      const cMatch = resolveCounty(jurisdictionMeta.stateCode, award['Place of Performance County Name'] || award.recipient_location_county_name);
      if (cMatch) awardCountyFips = cMatch.fips;
    }

    sqlStatements.push(`
      INSERT INTO awards (
        internal_id, award_id_piid, fiscal_year_started, state_code, county_fips,
        city_name, congressional_district, recipient_name, parent_recipient_name, recipient_state,
        business_type, competition_type, industry_sector, awarding_agency, awarding_sub_agency,
        pricing_type, award_type, initial_obligation, current_obligation, award_ceiling,
        dollar_creep, percent_creep, start_date, initial_end_date, end_date, schedule_delay_days,
        description, transactions_json, updated_at
      ) VALUES (
        ${sqlEscape(internalId)},
        ${sqlEscape(award['Award ID'])},
        ${fy},
        ${sqlEscape(jurisdictionMeta.stateCode)},
        ${sqlEscape(awardCountyFips)},
        ${sqlEscape(cityName)},
        ${sqlEscape(congDist)},
        ${sqlEscape(award['Recipient Name'])},
        ${sqlEscape(parent)},
        ${sqlEscape(hq)},
        ${sqlEscape('LARGE CORPORATE')},
        ${sqlEscape(award.competitionType)},
        ${sqlEscape(sector)},
        ${sqlEscape(award['Awarding Agency'] || 'Federal Government')},
        ${sqlEscape(award['Awarding Sub Agency'] || 'Procurement Bureau')},
        ${sqlEscape(pricingType)},
        ${sqlEscape(award['Contract Award Type'] || 'DEFINITIVE')},
        ${base},
        ${amt},
        ${award.awardCeiling || amt},
        ${creep},
        ${award.percentCreep},
        ${sqlEscape(award.startDate)},
        ${sqlEscape(award.initialEndDate)},
        ${sqlEscape(award.currentEndDate)},
        ${delayDays},
        ${sqlEscape(desc)},
        ${sqlEscape(JSON.stringify(compactTx))},
        ${Date.now()}
      ) ON CONFLICT(internal_id) DO UPDATE SET
        city_name = excluded.city_name,
        pricing_type = excluded.pricing_type,
        competition_type = excluded.competition_type,
        industry_sector = excluded.industry_sector,
        current_obligation = excluded.current_obligation,
        dollar_creep = excluded.dollar_creep,
        percent_creep = excluded.percent_creep,
        schedule_delay_days = excluded.schedule_delay_days,
        updated_at = excluded.updated_at;
    `);
  }

  // Top 3 Vendor Concentration & HHI (Herfindahl-Hirschman Index)
  const sortedVendors = Array.from(vendorMap.entries()).sort((a, b) => b[1] - a[1]);
  const top3Sum = sortedVendors.slice(0, 3).reduce((sum, v) => sum + v[1], 0);
  const top3ConcentrationPct = totalCurrent > 0 ? (top3Sum / totalCurrent) * 100 : 0;
  const topOffenderName = sortedVendors[0]?.[0] || 'Unknown Vendor';
  const topOffenderCreep = sortedVendors[0]?.[1] || 0;

  let hhiVendorIndex = 0;
  for (const [_, vAmt] of vendorMap.entries()) {
    const sharePct = totalCurrent > 0 ? (vAmt / totalCurrent) * 100 : 0;
    hhiVendorIndex += Math.pow(sharePct, 2);
  }
  const hhiScore = Math.round(hhiVendorIndex);

  // Advanced Forensic Ratios
  const percentOverrun = totalBaseline > 0 ? (totalCreep / totalBaseline) * 100 : 0;
  const costPlusPct = totalCurrent > 0 ? (costPlusDollars / totalCurrent) * 100 : 0;
  const soleSourcePct = totalCurrent > 0 ? (soleSourceDollars / totalCurrent) * 100 : 0;
  const capitalFlightPct = totalCurrent > 0 ? (capitalFlightDollars / totalCurrent) * 100 : 0;
  const septemberSpurtPct = totalCurrent > 0 ? (septemberSpurtDollars / totalCurrent) * 100 : 0;

  const costPlusCreepRate = costPlusBaseline > 0 ? (costPlusCreep / costPlusBaseline) * 100 : 0;
  const fixedPriceCreepRate = fixedPriceBaseline > 0 ? (fixedPriceCreep / fixedPriceBaseline) * 100 : 0;
  const costPlusMultiplier = fixedPriceCreepRate > 0 ? Number((costPlusCreepRate / fixedPriceCreepRate).toFixed(1)) : 1.0;

  const avgScheduleDelayDays = delayedContractsCount > 0 ? Math.round(totalDelayDays / delayedContractsCount) : 0;

  const pop = latestBenchmark.population || 5877610;
  const dollarsPerCapita = pop > 0 ? totalCurrent / pop : 0;
  const creepPerCapita = pop > 0 ? totalCreep / pop : 0;
  const stateBudget = latestBenchmark.state_operating_budget || 40200000000;
  const contractsToBudgetPct = stateBudget > 0 ? (totalCurrent / stateBudget) * 100 : 0;
  const federalTaxes = latestBenchmark.federal_tax_collected || 74180000000;
  const returnOnTaxDollar = federalTaxes > 0 ? totalCurrent / federalTaxes : 0;

  const jurId = jurisdictionMeta.countyFips
    ? `county:${jurisdictionMeta.stateCode}:${jurisdictionMeta.countyFips}`
    : `state:${jurisdictionMeta.stateCode}`;

  // Insert Fiscal Year Cohort rows
  const fiscalYearsArray = [];
  for (let y = 2018; y <= 2026; y++) {
    const c = yearlyCohortMap.get(y) || { count: 0, initial: 0, current: 0, creep: 0 };
    const bm = stateBenchmarks[String(y)] || latestBenchmark;
    const yBudget = bm.state_operating_budget || 40000000000;
    const yTax = bm.federal_tax_collected || 70000000000;
    const yCreepPct = c.initial > 0 ? (c.creep / c.initial) * 100 : 0;
    const yReturn = yTax > 0 ? c.current / yTax : 0;
    const yBudgetPct = yBudget > 0 ? (c.current / yBudget) * 100 : 0;

    const fyId = `${jurId}:${y}`;
    fiscalYearsArray.push({
      fiscalYear: y,
      contractsStartedCount: c.count,
      initialObligationStarted: c.initial,
      currentObligationStarted: c.current,
      dollarCreepStarted: c.creep,
      percentCreepStarted: yCreepPct,
      stateOperatingBudget: yBudget,
      federalTaxCollected: yTax,
      returnOnTaxDollar: yReturn,
      contractsToStateBudgetPct: yBudgetPct,
    });

    sqlStatements.unshift(`
      INSERT INTO jurisdiction_fiscal_years (
        id, jurisdiction_id, fiscal_year, state_operating_budget, federal_tax_collected,
        contracts_started_count, initial_obligation_started, current_obligation_started,
        dollar_creep_started, percent_creep_started, return_on_tax_dollar,
        contracts_to_state_budget_pct, updated_at
      ) VALUES (
        ${sqlEscape(fyId)},
        ${sqlEscape(jurId)},
        ${y},
        ${yBudget},
        ${yTax},
        ${c.count},
        ${c.initial},
        ${c.current},
        ${c.creep},
        ${yCreepPct},
        ${yReturn},
        ${yBudgetPct},
        ${Date.now()}
      ) ON CONFLICT(id) DO UPDATE SET
        contracts_started_count = excluded.contracts_started_count,
        initial_obligation_started = excluded.initial_obligation_started,
        current_obligation_started = excluded.current_obligation_started,
        dollar_creep_started = excluded.dollar_creep_started,
        percent_creep_started = excluded.percent_creep_started,
        return_on_tax_dollar = excluded.return_on_tax_dollar,
        contracts_to_state_budget_pct = excluded.contracts_to_state_budget_pct,
        updated_at = excluded.updated_at;
    `);
  }

  const payloadJson = JSON.stringify({
    initialObligation: totalBaseline,
    currentObligation: totalCurrent,
    dollarCreep: totalCreep,
    percentCreep: percentOverrun,
    dollarsPerCapita,
    creepPerCapita,
    costPlusPct,
    costPlusMultiplier,
    soleSourcePct,
    capitalFlightPct,
    septemberSpurtPct,
    avgScheduleDelayDays,
    zombieContractsCount,
    hhiScore,
    top3VendorConcentrationPct: top3ConcentrationPct,
    contractsToStateBudgetPct: contractsToBudgetPct,
    returnOnTaxDollar,
    activeContractsCount: awards.length,
    topOffenderName,
    topOffenderCreep,
    sectorBreakdown: Object.fromEntries(sectorMap.entries()),
    fiscalYears: fiscalYearsArray,
  });

  sqlStatements.unshift(`
    INSERT INTO jurisdictions (
      id, level, state_code, county_fips, name, population,
      initial_obligation, current_obligation, dollar_creep, percent_creep,
      dollars_per_capita, creep_per_capita, cost_plus_pct, sole_source_pct,
      capital_flight_pct, top3_vendor_concentration_pct, contracts_to_state_budget_pct,
      return_on_tax_dollar, active_contracts_count, top_offender_name,
      top_offender_creep, payload_json, updated_at
    ) VALUES (
      ${sqlEscape(jurId)},
      ${sqlEscape(jurisdictionMeta.countyFips ? 'county' : 'state')},
      ${sqlEscape(jurisdictionMeta.stateCode)},
      ${sqlEscape(jurisdictionMeta.countyFips || null)},
      ${sqlEscape(jurisdictionMeta.name)},
      ${pop},
      ${totalBaseline},
      ${totalCurrent},
      ${totalCreep},
      ${percentOverrun},
      ${dollarsPerCapita},
      ${creepPerCapita},
      ${costPlusPct},
      ${soleSourcePct},
      ${capitalFlightPct},
      ${top3ConcentrationPct},
      ${contractsToBudgetPct},
      ${returnOnTaxDollar},
      ${awards.length},
      ${sqlEscape(topOffenderName)},
      ${topOffenderCreep},
      ${sqlEscape(payloadJson)},
      ${Date.now()}
    ) ON CONFLICT(id) DO UPDATE SET
      population = excluded.population,
      initial_obligation = excluded.initial_obligation,
      current_obligation = excluded.current_obligation,
      dollar_creep = excluded.dollar_creep,
      percent_creep = excluded.percent_creep,
      dollars_per_capita = excluded.dollars_per_capita,
      creep_per_capita = excluded.creep_per_capita,
      cost_plus_pct = excluded.cost_plus_pct,
      sole_source_pct = excluded.sole_source_pct,
      capital_flight_pct = excluded.capital_flight_pct,
      top3_vendor_concentration_pct = excluded.top3_vendor_concentration_pct,
      contracts_to_state_budget_pct = excluded.contracts_to_state_budget_pct,
      return_on_tax_dollar = excluded.return_on_tax_dollar,
      active_contracts_count = excluded.active_contracts_count,
      top_offender_name = excluded.top_offender_name,
      top_offender_creep = excluded.top_offender_creep,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at;
  `);

  return {
    sql: sqlStatements.join('\n'),
    fiscalYears: fiscalYearsArray,
    sectorBreakdown: Object.fromEntries(sectorMap.entries()),
    summary: {
      initialObligation: totalBaseline,
      currentObligation: totalCurrent,
      dollarCreep: totalCreep,
      percentCreep: percentOverrun,
      dollarsPerCapita,
      creepPerCapita,
      costPlusPct,
      costPlusMultiplier,
      soleSourcePct,
      capitalFlightPct,
      septemberSpurtPct,
      avgScheduleDelayDays,
      zombieContractsCount,
      hhiScore,
      top3VendorConcentrationPct: top3ConcentrationPct,
      contractsToStateBudgetPct: contractsToBudgetPct,
      returnOnTaxDollar,
      contractsCount: awards.length,
      topOffenderName,
    },
  };
}

// CLI runner
async function main() {
  if (process.argv.includes('--ignore-limits')) {
    quotaGuard.setMaxCalls(10000);
  }
  const stateCode = (process.argv[2] || 'CO').toUpperCase();
  console.log(`🚀 Starting Forensic Procurement Ingestion v2.0 for State: ${stateCode}`);

  const awards = await harvestJurisdiction({ stateCode, limit: 20 });
  const result = generateSqlBundle({ stateCode, name: stateCode }, awards);

  // 1. Output D1 SQL Migration File
  const sqlDir = path.join(__dirname, 'seed_data');
  if (!fs.existsSync(sqlDir)) fs.mkdirSync(sqlDir, { recursive: true });
  const sqlFile = path.join(sqlDir, `${stateCode}_seed.sql`);
  fs.writeFileSync(sqlFile, result.sql, 'utf8');
  console.log(`✨ Generated D1 SQL Migration Seed: ${sqlFile}`);

  // 2. Output R2 Civic Bundle JSON
  const bundleDir = path.join(__dirname, 'bundles', 'states');
  if (!fs.existsSync(bundleDir)) fs.mkdirSync(bundleDir, { recursive: true });
  const bundleFile = path.join(bundleDir, `${stateCode}.json`);

  const bundlePayload = {
    stateCode,
    updatedAt: Date.now(),
    summary: result.summary,
    sectorBreakdown: result.sectorBreakdown,
    fiscalYears: result.fiscalYears,
    awards,
  };

  fs.writeFileSync(bundleFile, JSON.stringify(bundlePayload, null, 2), 'utf8');
  console.log(`📦 Generated R2 Civic Bundle: ${bundleFile}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
